import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness({ mobile = true, reduced = false, stored = false } = {}) {
  const events = new Map(),
    documentEvents = new Map(),
    timers = new Map(),
    storage = new Map();
  if (stored) storage.set("orbit-demo-interacted", "true");
  let now = 0,
    next = 0,
    intersection;
  const element = () => ({
    dataset: {},
    attrs: {},
    listeners: new Map(),
    style: {},
    offsetWidth: 36,
    hidden: false,
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    },
    querySelector() {
      return element();
    },
  });
  const slides = [0, 1, 2, 3].map(element),
    segments = [0, 1, 2, 3].map(element),
    device = element(),
    playback = element(),
    carousel = Object.assign(element(), {
      clientWidth: 200,
      scrollTo(options) {
        this.position = options.left;
      },
    });
  const stage = Object.assign(element(), {
    querySelector: (selector) => (selector === ".hero-device" ? device : carousel),
    querySelectorAll: (selector) => (selector === "[data-phone-slide]" ? slides : segments),
    getBoundingClientRect: () => ({ top: 100, bottom: 600 }),
  });
  const preferences = {
    mobile: {
      matches: mobile,
      addEventListener(_name, fn) {
        this.change = fn;
      },
    },
    reduced: {
      matches: reduced,
      addEventListener(_name, fn) {
        this.change = fn;
      },
    },
  };
  const document = {
    hidden: false,
    getElementById: (id) => (id === "hero-stage" ? stage : playback),
    addEventListener: (name, fn) => documentEvents.set(name, fn),
  };
  const window = {
    innerHeight: 800,
    matchMedia: (query) => (query.includes("768") ? preferences.mobile : preferences.reduced),
    addEventListener: (name, fn) => events.set(name, fn),
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (fn, delay) => {
      timers.set(++next, { fn, delay });
      return next;
    },
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/hero-carousel.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      document,
      window,
      exports: {},
      performance: { now: () => now },
      sessionStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
      require: (path) =>
        path === "./i18n"
          ? { getLang: () => "en" }
          : { translations: { en: { "demo.pause": "Pause", "demo.resume": "Play" } } },
      IntersectionObserver: class {
        constructor(fn) {
          intersection = fn;
        }
        observe() {}
      },
      ResizeObserver: class {
        observe() {}
      },
    },
  );
  return {
    stage,
    slides,
    segments,
    carousel,
    device,
    playback,
    preferences,
    timers,
    storage,
    events,
    documentEvents,
    document,
    visibility(value) {
      intersection([{ isIntersecting: value }]);
    },
    advance(milliseconds) {
      now += milliseconds;
    },
    fireTimer() {
      const [id, entry] = [...timers][0];
      timers.delete(id);
      entry.fn();
    },
    event(target, name, event = {}) {
      target.listeners.get(name)?.(event);
    },
  };
}
test("mobile advances after six seconds and marks only the active slide as accessible", () => {
  const h = harness();
  assert.equal(h.timers.size, 0);
  h.visibility(true);
  assert.equal([...h.timers.values()][0].delay, 6000);
  h.advance(6000);
  h.fireTimer();
  assert.equal(h.carousel.position, 200);
  assert.equal(h.slides[1].inert, false);
  assert.equal(h.slides[0].inert, true);
  assert.equal(h.segments[1].attrs["aria-current"], "true");
  assert.equal([...h.timers.values()][0].delay, 6000);
});
test("offscreen, hidden, desktop and reduced motion never advance the carousel", () => {
  for (const options of [{ mobile: false }, { reduced: true }, { stored: true }]) {
    const h = harness(options);
    h.visibility(true);
    assert.equal(h.timers.size, 0);
  }
  const h = harness();
  h.visibility(true);
  h.advance(2000);
  h.visibility(false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.stage.dataset.ambientRunning, "false");
  h.visibility(true);
  assert.equal([...h.timers.values()][0].delay, 4000);
  h.document.hidden = true;
  h.documentEvents.get("visibilitychange")();
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.documentEvents.get("visibilitychange")();
  assert.equal(h.timers.size, 1);
  h.preferences.reduced.matches = true;
  h.preferences.reduced.change();
  assert.equal(h.timers.size, 0);
  assert.equal(h.playback.hidden, true);
});
test("the external pause control freezes both ambient motion and remaining progress", () => {
  const h = harness();
  h.visibility(true);
  h.advance(2500);
  h.event(h.playback, "click");
  assert.equal(h.timers.size, 0);
  assert.equal(h.stage.dataset.ambientRunning, "false");
  assert.equal(h.playback.attrs["aria-label"], "Play");
  h.advance(9000);
  h.event(h.playback, "click");
  assert.equal([...h.timers.values()][0].delay, 3500);
  assert.equal(h.stage.dataset.ambientRunning, "true");
  assert.equal(h.playback.attrs["aria-label"], "Pause");
});
test("pointer, focus, typing, segments and swipe stop automatic advance for the visit", () => {
  for (const event of ["pointerdown", "focusin", "input"]) {
    const h = harness();
    h.visibility(true);
    h.event(h.device, event);
    assert.equal(h.timers.size, 0);
    assert.equal(h.storage.get("orbit-demo-interacted"), "true");
    h.event(h.playback, "click");
    h.event(h.playback, "click");
    assert.equal(h.timers.size, 0);
    h.visibility(false);
    h.visibility(true);
    assert.equal(h.timers.size, 0);
  }
  const h = harness();
  h.visibility(true);
  h.event(h.segments[2], "click");
  assert.equal(h.carousel.position, 400);
  assert.equal(h.timers.size, 0);
  h.event(h.carousel, "touchstart", { touches: [{ clientX: 100, clientY: 0 }] });
  h.event(h.carousel, "touchend", { changedTouches: [{ clientX: 20, clientY: 2 }] });
  assert.equal(h.carousel.position, 600);
  assert.equal(h.timers.size, 0);
});
