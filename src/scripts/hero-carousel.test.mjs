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
  const slides = [0, 1, 2, 3].map(element);
  const segments = [0, 1, 2, 3].map(element);
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
  test(`focus inside the carousel holds its screen until focus leaves (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    const chip = h.element({ parentElement: h.slides[0] });
    const composer = h.element({ parentElement: h.slides[0] });
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
    const outside = h.element();
    h.document.activeElement = outside;
    h.event(h.carousel, "focusout", { target: composer, relatedTarget: outside });
    assert.equal(h.positions.length, 1, "leaving focus waits for the next progress update");
    h.progress(0.9);
    assert.equal(h.positions.at(-1).left, 600);
    assert.equal(h.slides[3].inert, false);
    assert.equal(h.segments[3].attrs["aria-current"], "true");
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
    assert.equal(h.positions.at(-1).left, 400);
    assert.equal(h.slides[2].inert, false);
  });
}

for (const reduced of [false, true]) {
  test(`scroll exposes every screen in equal slices, including reverse scroll (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    for (const [progress, index] of [
      [0, 0],
      [0.249, 0],
      [0.25, 1],
      [0.499, 1],
      [0.5, 2],
      [0.749, 2],
      [0.75, 3],
      [1, 3],
      [0.3, 1],
      [0, 0],
    ]) {
      h.progress(progress);
      for (let i = 0; i < 4; i++) {
        assert.equal(h.slides[i].inert, i !== index);
        assert.equal(h.slides[i].attrs["aria-hidden"], String(i !== index));
        assert.equal(h.segments[i].attrs["aria-current"], String(i === index));
      }
      assert.equal(h.positions.at(-1).left, index * 200);
      if (reduced) assert.equal(h.positions.at(-1).behavior, "instant");
    }
  });

  test(`pager taps and swipes select screens at every width (reduced: ${reduced})`, () => {
    const h = harness({ reduced });
    h.event(h.segments[2], "click");
    assert.equal(h.positions.at(-1).left, 400);
    assert.equal(h.positions.at(-1).behavior, reduced ? "instant" : "smooth");
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 100, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 20, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 600);
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 20, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 100, clientY: 2 }] });
    assert.equal(h.positions.at(-1).left, 400);
    const count = h.positions.length;
    h.event(h.carousel, "touchstart", { touches: [{ clientX: 0, clientY: 0 }] });
    h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 20, clientY: 100 }] });
    assert.equal(h.positions.length, count, "vertical gestures stay available for scrolling");
    h.carousel.clientWidth = 300;
    h.resize();
    assert.equal(h.carousel.scrollLeft, 600);
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
    const stage = {};
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
