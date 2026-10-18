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

test("the pinned timeline sends scroll progress in both motion preferences", () => {
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
          if (query === "all" || !reduced) fn();
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
          getElementById: (id) => (id === "hero-stage" ? stage : null),
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
    assert.equal(triggers[0].pin, true);
    assert.equal(triggers[0].scrub, true);
    triggers[0].onUpdate({ progress: 0.625 });
    triggers[0].onRefresh({ progress: 0.25 });
    assert.deepEqual(progresses, [0.625, 0.25]);
    assert.equal(lenisInstances.length, reduced ? 0 : 1);
    dispose();
    assert.equal(reverted, true);
  }
});

function floatHarness({ reduced = false } = {}) {
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
  const cards = Array.from({ length: 4 }, () => ({
    style: {
      transform: "",
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
    hidden: false,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/hero-float.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Math: Object.assign(Object.create(Math), { random: () => ++phaseIndex / 10 }),
      document,
      window: {
        innerHeight: 800,
        matchMedia: (query) => (query.includes("reduced-motion") ? preference : desktop),
      },
      requestAnimationFrame: (fn) => {
        frames.set(++frameId, fn);
        return frameId;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
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
    },
  );
  const dispose = exports.mountHeroFloat(stage);
  return {
    cards,
    frames,
    events,
    document,
    preference,
    desktop,
    dispose,
    get disconnected() {
      return disconnected;
    },
    intersect(visible) {
      intersection([{ isIntersecting: visible }]);
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
  assert.match(source, /mountHeroFloat\(stage\)/);
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
