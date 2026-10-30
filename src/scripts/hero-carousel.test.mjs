import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness({ reduced = false } = {}) {
  class Element {
    attrs = {};
    listeners = new Map();
    parentElement = null;
    clientWidth = 200;
    scrollWidth = 200;
    overflowX = "visible";
    tagName = "DIV";
    focusVisible = false;
    matches(selector) {
      return selector.split(",").some((part) => {
        const value = part.trim();
        return value === ":focus-visible"
          ? this.focusVisible
          : value.toUpperCase() === this.tagName;
      });
    }
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    }
    contains(target) {
      for (let node = target; node; node = node.parentElement) {
        if (node === this) return true;
      }
      return false;
    }
  }
  const element = (options = {}) => Object.assign(new Element(), options);
  const slides = [0, 1].map(element);
  const segments = [0, 1].map(element);
  const positions = [];
  const carousel = Object.assign(element(), {
    clientWidth: 200,
    scrollLeft: 0,
    scrollTo(options) {
      positions.push(options);
    },
  });
  slides.forEach((slide) => (slide.parentElement = carousel));
  const stage = {
    querySelector: () => carousel,
    querySelectorAll: (selector) => (selector === "[data-phone-slide]" ? slides : segments),
  };
  const preference = {
    matches: reduced,
    addEventListener(_name, fn) {
      this.change = fn;
    },
  };
  const exports = {};
  const document = { getElementById: () => stage, activeElement: null };
  let resize;
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/hero-carousel.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      document,
      window: { matchMedia: () => preference },
      Element,
      getComputedStyle: (element) => ({ overflowX: element.overflowX }),
      exports,
      ResizeObserver: class {
        constructor(fn) {
          resize = fn;
        }
        observe() {}
      },
    },
  );
  return {
    slides,
    segments,
    carousel,
    element,
    document,
    positions,
    preference,
    resize,
    progress: exports.updateHeroCarousel,
    event(target, name, event = {}) {
      target.listeners.get(name)?.({ target, ...event });
    },
  };
}

test("horizontal scrollers keep their swipe while plain phone areas change screens", () => {
  for (const overflowX of ["auto", "scroll"]) {
    const h = harness();
    const row = h.element({ parentElement: h.slides[0], scrollWidth: 300, overflowX });
    const chip = h.element({ parentElement: row });
    h.event(h.carousel, "touchstart", {
      target: chip,
      touches: [{ clientX: 100, clientY: 0 }],
    });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 40, clientY: 2 }] });
    assert.equal(h.positions.length, 1, `${overflowX} scroller owns the gesture`);
    assert.equal(h.slides[0].inert, false);
    h.event(h.carousel, "touchstart", {
      target: h.slides[0],
      touches: [{ clientX: 100, clientY: 0 }],
    });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 40, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 200);
    assert.equal(h.slides[1].inert, false);
  }
});

test("non-scrolling descendants keep phone swipes available", () => {
  for (const options of [
    { overflowX: "auto", scrollWidth: 200 },
    { overflowX: "scroll", scrollWidth: 100 },
    { overflowX: "hidden", scrollWidth: 300 },
    { overflowX: "visible", scrollWidth: 300 },
  ]) {
    const h = harness();
    const target = h.element({ parentElement: h.slides[0], ...options });
    h.event(h.carousel, "touchstart", {
      target,
      touches: [{ clientX: 100, clientY: 0 }],
    });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 40, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 200);
  }
});

for (const reduced of [false, true]) {
  test(`keyboard focus and text input hold the screen until focus leaves (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    const chip = h.element({
      parentElement: h.slides[0],
      tagName: "BUTTON",
      focusVisible: true,
    });
    const composer = h.element({ parentElement: h.slides[0], tagName: "INPUT" });
    h.document.activeElement = chip;
    h.event(h.carousel, "focusin", { target: chip });
    h.progress(0.9);
    assert.equal(h.positions.length, 1);
    assert.equal(h.slides[0].inert, false);
    assert.equal(h.slides[0].attrs["aria-hidden"], "false");
    assert.equal(h.document.activeElement, chip);
    h.document.activeElement = composer;
    h.event(h.carousel, "focusout", { target: chip, relatedTarget: composer });
    h.event(h.carousel, "focusin", { target: composer });
    h.progress(0.9);
    assert.equal(h.positions.length, 1, "focus moving within the carousel keeps the screen");
    assert.equal(h.slides[0].inert, false);
    assert.equal(h.slides[0].attrs["aria-hidden"], "false");
    assert.equal(h.document.activeElement, composer);
    const outside = h.element();
    h.document.activeElement = outside;
    h.event(h.carousel, "focusout", { target: composer, relatedTarget: outside });
    assert.equal(h.positions.length, 1, "leaving focus waits for the next progress update");
    h.progress(0.9);
    assert.equal(h.positions.at(-1).left, 200);
    assert.equal(h.slides[1].inert, false);
    assert.equal(h.segments[1].attrs["aria-current"], "true");
  });

  test(`pointer-focused buttons allow scroll to change screens (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    const chip = h.element({ parentElement: h.slides[0], tagName: "BUTTON" });
    assert.equal(chip.matches(":focus-visible"), false);
    h.document.activeElement = chip;
    h.event(h.carousel, "focusin", { target: chip });
    h.progress(0.9);
    assert.equal(h.positions.at(-1).left, 200);
    assert.equal(h.slides[0].inert, true);
    assert.equal(h.slides[1].inert, false);
    assert.equal(h.segments[1].attrs["aria-current"], "true");
  });

  test(`pager taps and swipes still work with carousel focus (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    h.document.activeElement = h.element({ parentElement: h.slides[0] });
    h.event(h.segments[1], "click");
    assert.equal(h.positions.at(-1).left, 200);
    h.document.activeElement = h.element({ parentElement: h.slides[1] });
    h.event(h.carousel, "touchstart", {
      target: h.slides[1],
      touches: [{ clientX: 100, clientY: 0 }],
    });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 40, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 0);
    assert.equal(h.slides[0].inert, false);
  });
}

for (const reduced of [false, true]) {
  test(`scroll exposes every screen in equal slices, including reverse scroll (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    for (const [progress, index] of [
      [0, 0],
      [0.499, 0],
      [0.5, 1],
      [0.999, 1],
      [1, 1],
      [0.3, 0],
      [0, 0],
    ]) {
      h.progress(progress);
      for (let i = 0; i < h.slides.length; i++) {
        assert.equal(h.slides[i].inert, i !== index);
        assert.equal(h.slides[i].attrs["aria-hidden"], String(i !== index));
        assert.equal(h.segments[i].attrs["aria-current"], String(i === index));
      }
      assert.equal(h.positions.at(-1).left, index * 200);
      if (reduced) assert.equal(h.positions.at(-1).behavior, "instant");
    }
  });

  test(`pager taps and swipes select both screens at every width (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    h.event(h.segments[1], "click");
    assert.equal(h.positions.at(-1).left, 200);
    assert.equal(h.positions.at(-1).behavior, reduced ? "instant" : "smooth");
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 100, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 20, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 0);
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 20, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 100, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 200);
    const count = h.positions.length;
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 0, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 20, clientY: 100 }] });
    assert.equal(h.positions.length, count, "vertical gestures stay available for scrolling");
    h.carousel.clientWidth = 300;
    h.resize();
    assert.equal(h.carousel.scrollLeft, 300);
  });
}

test("a reduced motion change stops an in-flight slide immediately", () => {
  const h = harness();
  h.event(h.segments[1], "click");
  h.preference.matches = true;
  h.preference.change();
  assert.equal(h.positions.at(-1).left, 200);
  assert.equal(h.positions.at(-1).behavior, "instant");
});

test("production has no autonomous carousel, playback controls or repeating animation", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const carousel = readFileSync("src/scripts/hero-carousel.ts", "utf8");
  const copy = readFileSync("src/i18n/translations.ts", "utf8");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.doesNotMatch(
    hero + carousel + copy + css,
    /hero-playback|demo\.(?:pause|resume)|hero-(?:pause|play)-icon|ambientRunning|carouselRunning|carousel-fill|hero-float\s+\d/,
  );
  assert.doesNotMatch(
    carousel,
    /setTimeout|setInterval|performance\.now|sessionStorage|IntersectionObserver/,
  );
  for (const file of readdirSync("src", { recursive: true }).filter((file) =>
    /\.(?:astro|css|ts)$/.test(file),
  )) {
    assert.doesNotMatch(
      readFileSync(`src/${file}`, "utf8"),
      /setInterval\s*\(|repeat:\s*-1|animation[^;{}]*\binfinite\b/,
      file,
    );
  }
  assert.match(
    css,
    /\.carousel-segment\[aria-current="true"\] \.carousel-marker\s*\{\s*background: var\(--color-primary\)/,
  );
});

for (const [width, height, pinned] of [
  [1440, 900, true],
  [1100, 762, true],
  [412, 915, true],
  [390, 844, true],
  [320, 568, true],
  [844, 390, false],
  [568, 320, false],
  [844, 583, false],
  [844, 584, true],
  [568, 567, false],
]) {
  test(`${width}x${height} drives screens with scroll in ${pinned ? "pinned" : "flow"} mode for both motion preferences`, () => {
    for (const reduced of [false, true]) {
      const triggers = [],
        progresses = [],
        lenisInstances = [];
      const stage = { querySelectorAll: () => [] };
      const exports = {};
      let reverted = false;
      class Lenis {
        constructor() {
          lenisInstances.push(this);
        }
        on() {}
        destroy() {
          this.destroyed = true;
        }
      }
      const gsap = {
        registerPlugin() {},
        matchMedia: () => ({
          add(query, fn) {
            if (typeof query === "object") {
              const conditions = Object.fromEntries(
                Object.entries(query).map(([name, value]) => [
                  name,
                  value
                    .split(",")
                    .some((alternative) =>
                      [
                        ...alternative.matchAll(/\((width|height)\s*(<=|>=|<|>)\s*(\d+)px\)/g),
                      ].every(([, axis, operator, boundary]) =>
                        vm.runInNewContext(
                          `${axis === "width" ? width : height} ${operator} ${boundary}`,
                        ),
                      ),
                    ),
                ]),
              );
              assert.equal(conditions.pinned, pinned);
              assert.equal(conditions.flow, !pinned);
              const css = readFileSync("src/styles/landing.css", "utf8");
              assert.ok(
                css.includes(`@media ${query.flow}`),
                "flow spacing shares the driver's fit boundaries",
              );
              fn({ conditions });
            } else if (query === "all" || !reduced) fn();
          },
          revert() {
            reverted = true;
          },
        }),
        timeline(options) {
          triggers.push(options.scrollTrigger);
          return { to() {} };
        },
        fromTo() {},
      };
      vm.runInNewContext(
        ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        {
          exports,
          require: (name) =>
            name === "gsap"
              ? { gsap }
              : name === "gsap/ScrollTrigger"
                ? { ScrollTrigger: { refresh() {}, update() {} } }
                : name === "lenis"
                  ? { default: Lenis }
                  : name === "./hero-float"
                    ? { mountHeroFloat: () => () => {} }
                    : { updateHeroCarousel: (progress) => progresses.push(progress) },
          document: {
            getElementById: (id) =>
              id === "hero-stage"
                ? stage
                : id === "site-header"
                  ? {
                      getBoundingClientRect: () => ({ bottom: width <= 640 ? 80 : 96 }),
                    }
                  : null,
            querySelectorAll: () => [],
            querySelector: () => null,
            fonts: { ready: Promise.resolve() },
          },
          window: { addEventListener() {}, removeEventListener() {} },
          ResizeObserver: class {
            disconnect() {}
          },
        },
      );
      const dispose = exports.mountLandingMotion();
      assert.equal(triggers.length, 1);
      assert.equal(triggers[0].pin, pinned);
      if (pinned) {
        assert.equal(triggers[0].start(), `top ${width <= 640 ? 96 : 112}px`);
        assert.equal(triggers[0].end, "+=560");
        assert.equal(triggers[0].pinSpacing, false);
      } else {
        assert.equal(triggers[0].start, "top bottom");
        assert.equal(triggers[0].end, "bottom top");
      }
      assert.deepEqual(
        progresses,
        [],
        "constructing the driver does not autonomously advance screens",
      );
      assert.equal(triggers[0].scrub, true);
      triggers[0].onUpdate({ progress: 0.625 });
      triggers[0].onRefresh({ progress: 0.25 });
      assert.deepEqual(progresses, [0.625, 0.25]);
      assert.equal(lenisInstances.length, reduced ? 0 : 1);
      dispose();
      assert.equal(reverted, true);
    }
  });
}

test("feature motion waits for intersection and separate tasks, and respects media cleanup", () => {
  for (const reduced of [false, true]) {
    const tasks = [],
      animations = [],
      cleanups = [],
      observers = [];
    const rows = [0, 1].map(() => ({ querySelectorAll: () => [] }));
    let recording = false;
    const context = {
      add(callback) {
        recording = true;
        callback();
        recording = false;
      },
    };
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require(name) {
          if (name === "./task-queue")
            return { afterLoad: (callbacks) => tasks.push(...callbacks) };
          if (name === "gsap")
            return {
              gsap: {
                registerPlugin() {},
                matchMedia: () => ({
                  add(query, callback) {
                    if (query === "all" || !reduced) {
                      const cleanup = callback(context);
                      if (cleanup) cleanups.push(cleanup);
                    }
                  },
                  revert: () => cleanups.forEach((cleanup) => cleanup()),
                }),
                fromTo(_targets, _from, to) {
                  assert.ok(recording, "deferred animations stay in their media context");
                  animations.push(to.scrollTrigger.trigger);
                },
              },
            };
          if (name === "gsap/ScrollTrigger") return { ScrollTrigger: { refresh() {} } };
          if (name === "lenis")
            return {
              default: class {
                on() {}
                destroy() {}
              },
            };
          return {};
        },
        document: {
          getElementById: () => null,
          querySelector: () => null,
          querySelectorAll: (selector) => (selector === "[data-example-row]" ? rows : []),
          fonts: { ready: Promise.resolve() },
        },
        window: { addEventListener() {}, removeEventListener() {} },
        ResizeObserver: class {
          disconnect() {}
        },
        IntersectionObserver: class {
          observed = new Set();
          constructor(callback) {
            this.callback = callback;
            observers.push(this);
          }
          observe(row) {
            this.observed.add(row);
          }
          unobserve(row) {
            this.observed.delete(row);
          }
          disconnect() {
            this.disconnected = true;
          }
        },
      },
    );
    const dispose = exports.mountLandingMotion();
    assert.equal(tasks.length, 0);
    assert.deepEqual(animations, []);
    if (reduced) {
      assert.equal(observers.length, 0);
      dispose();
      continue;
    }
    const observer = observers[0];
    assert.deepEqual([...observer.observed], rows);
    observer.callback(rows.map((target) => ({ target, isIntersecting: false })));
    assert.equal(tasks.length, 0);
    observer.callback(rows.map((target) => ({ target, isIntersecting: true })));
    assert.equal(tasks.length, 2);
    assert.deepEqual(animations, []);
    tasks.shift()();
    assert.deepEqual(animations, [rows[0]]);
    dispose();
    assert.equal(observer.disconnected, true);
    tasks.shift()();
    assert.deepEqual(animations, [rows[0]], "reverted media cannot mount a queued animation");
  }
});

function floatHarness({ reduced = false, startup = false, language = "en", fine = true } = {}) {
  const frames = new Map();
  const events = new Map();
  const preference = {
    matches: reduced,
    addEventListener: (name, fn) => events.set(`motion:${name}`, fn),
    removeEventListener: (name) => events.delete(`motion:${name}`),
  };
  const desktop = {
    matches: true,
    addEventListener: (name, fn) => events.set(`width:${name}`, fn),
    removeEventListener: (name) => events.delete(`width:${name}`),
  };
  const pointer = {
    matches: fine,
    addEventListener: (name, fn) => events.set(`pointer:${name}`, fn),
    removeEventListener: (name) => events.delete(`pointer:${name}`),
  };
  const cards = Array.from({ length: 4 }, () => ({
    listeners: new Map(),
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    },
    removeEventListener(name) {
      this.listeners.delete(name);
    },
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 160, height: 120 }),
    style: {
      transform: "",
      translate: "",
      rotate: "",
      removeProperty(name) {
        this[name] = "";
      },
    },
  }));
  let intersection;
  let disconnected = false;
  let frameId = 0;
  let phaseIndex = 0;
  const columns = [0, 1].map((index) => ({
    querySelectorAll: () => cards.slice(index * 2, index * 2 + 2),
    getBoundingClientRect: () => ({ top: 100, height: 320 }),
  }));
  const stage = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-hero-column]");
      return columns;
    },
  };
  const document = {
    documentElement: { lang: language },
    getElementById: (id) => (id === "hero-stage" ? stage : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    fonts: { ready: Promise.resolve() },
    hidden: false,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    Math: Object.assign(Object.create(Math), { random: () => ++phaseIndex / 10 }),
    document,
    window: {
      innerHeight: 800,
      requestAnimationFrame: (fn) => scheduleFrame(fn),
      addEventListener: (name, fn) => events.set(`window:${name}`, fn),
      removeEventListener: (name) => events.delete(`window:${name}`),
      matchMedia: (query) =>
        query.includes("reduced-motion")
          ? preference
          : query.includes("pointer: fine")
            ? pointer
            : desktop,
    },
    requestAnimationFrame: (fn) => scheduleFrame(fn),
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      disconnect() {}
    },
    IntersectionObserver: class {
      constructor(fn) {
        intersection = fn;
      }
      observe(target) {
        assert.equal(target, stage);
      }
      disconnect() {
        disconnected = true;
      }
    },
  });
  function scheduleFrame(fn) {
    frames.set(++frameId, fn);
    return frameId;
  }
  function evaluate(name, require) {
    const exports = {};
    const code = ts.transpileModule(readFileSync(`src/scripts/${name}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
    return exports;
  }
  vm.runInContext(
    ts.transpileModule(readFileSync("src/scripts/hero-float.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  let dispose;
  if (startup) {
    const cleanups = [];
    const require = (name) => {
      if (name === "./landing-motion") return evaluate("landing-motion", require);
      if (name === "./hero-float") return exports;
      if (name === "gsap")
        return {
          gsap: {
            registerPlugin() {},
            matchMedia: () => ({
              add(query, callback) {
                if (typeof query === "object" || !reduced) {
                  const cleanup = callback({ conditions: { pinned: true } });
                  if (cleanup) cleanups.push(cleanup);
                }
              },
              revert: () => cleanups.forEach((cleanup) => cleanup()),
            }),
            timeline: () => ({ to() {} }),
            fromTo() {},
          },
        };
      if (name === "gsap/ScrollTrigger") return { ScrollTrigger: { update() {}, refresh() {} } };
      if (name === "lenis")
        return {
          default: class {
            on() {}
            destroy() {}
          },
        };
      return {};
    };
    evaluate("scroll", require);
    dispose = () => events.get("window:pagehide")();
  } else dispose = exports.mountHeroFloat(stage);
  return {
    cards,
    frames,
    events,
    document,
    preference,
    desktop,
    pointer,
    dispose,
    get disconnected() {
      return disconnected;
    },
    intersect(visible) {
      intersection?.([{ isIntersecting: visible }]);
    },
    advance(time) {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(time);
      }
    },
    tick(time) {
      assert.equal(frames.size, 1, "all cards share one scheduled animation frame");
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(time);
    },
  };
}

test("hero float assigns all three paths and an independent phase to every side card and chip", () => {
  const source = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.doesNotMatch(source, /mountHeroFloat|disposeFloat/);
  assert.match(readFileSync("src/scripts/scroll.ts", "utf8"), /mountHeroFloat\(stage\)/);
  assert.match(source, /\[data-hero-float\] > \*/);
  const h = floatHarness();
  assert.equal(h.frames.size, 0, "wait for the hero to enter the viewport");
  h.intersect(true);
  h.tick(1000);
  const first = h.cards.map((card) => card.style.transform);
  const expectedPaths = [0, 1, 1, 2];
  first.forEach((transform, index) => {
    const phase = ((index + 1) / 10) * Math.PI * 2;
    const t = 0.82;
    const x =
      expectedPaths[index] === 0
        ? Math.cos(t + phase) * 17
        : expectedPaths[index] === 1
          ? Math.sin(t + phase) * 17
          : 17 * (0.58 * Math.sin(0.62 * t + phase) + 0.42 * Math.sin(1.73 * t + 1.3 * phase));
    const y =
      expectedPaths[index] === 0
        ? Math.sin(t + phase) * 17
        : expectedPaths[index] === 1
          ? Math.sin(2 * (t + phase)) * 17 * 0.48
          : 17 *
            (0.58 * Math.cos(0.81 * t + 0.9 * phase) + 0.42 * Math.cos(1.51 * t + 1.1 * phase));
    const offsets = [...transform.matchAll(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0\)/g)];
    assert.equal(offsets.length, 2, "float and column parallax compose in one transform");
    assert.ok(Math.abs(Number(offsets[0][1]) - x) < 0.01);
    assert.ok(Math.abs(Number(offsets[0][2]) - y) < 0.01);
    const parallax = ((0.35 * 50 * 0.22 * 0.14 * 320) / 100) * (index < 2 ? 1 : -1);
    assert.ok(Math.abs(Number(offsets[1][2]) - parallax) < 0.01);
  });
  h.tick(2000);
  assert.ok(h.cards.every((card, index) => card.style.transform !== first[index]));
  h.dispose();
});

test("hero float stops on visibilitychange hidden, offscreen intersection and disposal", () => {
  const h = floatHarness();
  h.intersect(true);
  h.tick(1000);
  h.document.hidden = true;
  h.events.get("visibilitychange")();
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.events.get("visibilitychange")();
  h.tick(2000);
  h.intersect(false);
  assert.equal(h.frames.size, 0);
  h.intersect(true);
  h.tick(3000);
  h.dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.disconnected, true);
  assert.equal(h.events.size, 0);
});

test("hero float guards prefers-reduced-motion and rests when the preference or width changes", () => {
  const resting = floatHarness({ reduced: true });
  assert.equal(resting.frames.size, 0);
  assert.ok(resting.cards.every((card) => card.style.transform === ""));
  resting.dispose();
  const h = floatHarness();
  h.intersect(true);
  h.tick(1000);
  h.preference.matches = true;
  h.events.get("motion:change")();
  assert.equal(h.frames.size, 0);
  assert.ok(h.cards.every((card) => card.style.transform === ""));
  h.preference.matches = false;
  h.events.get("motion:change")();
  h.tick(2000);
  h.desktop.matches = false;
  h.events.get("width:change")();
  assert.equal(h.frames.size, 0);
  h.dispose();
});

test("hero float starts once an initially reduced motion preference is turned off", () => {
  const h = floatHarness({ reduced: true });
  h.intersect(true);
  assert.equal(h.frames.size, 0);
  pointAt(h.cards[0], 260, 320);
  assert.equal(h.cards[0].style.rotate, "");
  h.preference.matches = false;
  h.events.get("motion:change")();
  h.tick(1000);
  assert.ok(h.cards.every((card) => card.style.transform.includes("translate3d")));
  h.dispose();
  assert.equal(h.events.size, 0);
});

for (const language of ["en", "pt-BR"]) {
  test(`visible hero cards float within one second without scroll in ${language}`, async () => {
    const h = floatHarness({ startup: true, language });
    h.tick(0);
    h.tick(16);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.frames.size, 0, "wait for the initial intersection delivery");
    h.intersect(true);
    h.advance(32);
    const first = h.cards.map((card) => card.style.transform);
    assert.ok(
      first.every((transform) => transform.includes("translate3d")),
      "all four visible cards must receive a float transform without scrolling",
    );
    h.tick(500);
    assert.ok(h.cards.every((card, index) => card.style.transform !== first[index]));
    h.dispose();
  });
}

function pointAt(card, x, y, pointerType = "mouse", type = "pointermove") {
  card.listeners.get(type)?.({ clientX: x, clientY: y, pointerType });
}

test("each hero card follows the mouse with bounded translation and 3D tilt while floating", () => {
  const h = floatHarness();
  h.intersect(true);
  h.tick(1000);
  for (const card of h.cards) {
    const floating = card.style.transform;
    pointAt(card, 260, 200, "mouse", "pointerenter");
    assert.equal(card.style.translate, "3.00px -3.00px");
    assert.match(card.style.rotate, /^1(?:\.0+)? 1(?:\.0+)? 0 2\.83deg$/);
    assert.equal(card.style.transform, floating, "pointer feedback preserves float and parallax");
    pointAt(card, 1000, 1000);
    assert.equal(card.style.translate, "3.00px 3.00px", "pointer coordinates are clamped");
    pointAt(card, 100, 320);
    assert.equal(card.style.translate, "-3.00px 3.00px");
    assert.match(card.style.rotate, /^-1(?:\.0+)? -1(?:\.0+)? 0 2\.83deg$/);
    pointAt(card, 260, 260);
    assert.equal(card.style.rotate, "0 1 0 2.00deg");
    pointAt(card, 180, 260);
    assert.equal(card.style.translate, "0.00px 0.00px");
    assert.match(card.style.rotate, / 0\.00deg$/);
    pointAt(card, 260, 200);
    h.tick(1016);
    assert.notEqual(card.style.transform, floating, "the float loop continues during hover");
    assert.equal(card.style.translate, "3.00px -3.00px");
    pointAt(card, 260, 200, "mouse", "pointerleave");
    assert.equal(card.style.translate, "");
    assert.equal(card.style.rotate, "");
  }
  h.dispose();
  assert.ok(h.cards.every((card) => card.listeners.size === 0));
});

test("hero pointer feedback rests for touch, reduced motion, narrow widths and stopped loops", () => {
  for (const options of [{ reduced: true }, { fine: false }, {}]) {
    const h = floatHarness(options);
    if (!options.reduced) h.intersect(true);
    for (const card of h.cards) {
      for (const pointerType of ["touch", "pen"]) {
        pointAt(card, 260, 200, pointerType);
        assert.equal(card.style.translate, "");
        assert.equal(card.style.rotate, "");
      }
      if (options.reduced || options.fine === false) {
        pointAt(card, 260, 200);
        assert.equal(card.style.translate, "");
        assert.equal(card.style.rotate, "");
      }
    }
    h.dispose();
  }
  const h = floatHarness();
  h.intersect(true);
  const card = h.cards[0];
  for (const [pause, resume] of [
    [() => h.intersect(false), () => h.intersect(true)],
    [
      () => {
        h.document.hidden = true;
        h.events.get("visibilitychange")();
      },
      () => {
        h.document.hidden = false;
        h.events.get("visibilitychange")();
      },
    ],
    ...[
      [h.preference, "motion:change"],
      [h.desktop, "width:change"],
      [h.pointer, "pointer:change"],
    ].map(([media, name]) => [
      () => {
        media.matches = name === "motion:change";
        h.events.get(name)();
      },
      () => {
        media.matches = name !== "motion:change";
        h.events.get(name)();
      },
    ]),
  ]) {
    pointAt(card, 260, 200);
    assert.notEqual(card.style.rotate, "");
    pause();
    assert.equal(card.style.translate, "");
    assert.equal(card.style.rotate, "");
    pointAt(card, 260, 200);
    assert.equal(card.style.rotate, "");
    resume();
  }
  pointAt(card, 260, 200);
  pointAt(card, 260, 200, "mouse", "pointercancel");
  assert.equal(card.style.rotate, "");
  h.dispose();
  assert.equal(h.events.size, 0);
});

test("hero pointer feedback uses the surface duration and movement easing in both directions", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /@media \(hover: hover\) and \(pointer: fine\) and \(prefers-reduced-motion: no-preference\)/,
  );
  const rule = css.match(/\[data-hero-float\]\s*\{([^}]*transition[^}]*)\}/)?.[1];
  assert.ok(rule, "the base card rule eases entry, retargeting and return");
  for (const property of ["translate", "rotate"]) {
    assert.ok(rule.includes(`${property} var(--duration-hover-surface) var(--ease-out)`));
  }
  assert.match(css, /\.hero-side\s*\{\s*perspective:\s*800px;/);
});
