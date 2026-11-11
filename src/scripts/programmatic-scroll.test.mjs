import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const SECTION_TOP = 5000;
const HEADER_OFFSET = 96;
const PAGE_HEIGHT = 20000;
const FRAME_PIXELS = 100;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const transpile = (file) =>
  ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const lenisSource = transpile("node_modules/lenis/dist/lenis.mjs");

class FakeElement {
  constructor(trigger) {
    this.trigger = trigger;
  }
  closest(selector) {
    return selector === "[data-ios-trigger]" ? this.trigger : null;
  }
}
class FakeWindow {}

function page({ reduced = false, hash = "" } = {}) {
  const listeners = new Map();
  const documentListeners = new Map();
  const frames = [];
  const tickers = new Set();
  const timers = new Map();
  let clock = 0;
  let timerId = 0;
  let animation;
  const scrollTrigger = { refreshListeners: [] };
  const state = { y: 0, sectionTop: SECTION_TOP, location: { hash } };
  const emit = (name) =>
    (listeners.get(name) ?? []).forEach((callback) =>
      callback({
        type: name,
        button: 0,
        clientX: 0,
        clientY: 0,
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        ctrlKey: false,
        cancelable: false,
        composedPath: () => [],
      }),
    );
  const rootClasses = new Set();
  const root = {
    classList: {
      add: (name) => rootClasses.add(name),
      remove: (name) => rootClasses.delete(name),
      contains: (name) => rootClasses.has(name),
      [Symbol.iterator]: () => rootClasses.values(),
    },
    get scrollHeight() {
      return PAGE_HEIGHT;
    },
    scrollWidth: 1280,
  };
  const nativeSmoothScrollStallsWhileLenisRuns = () => rootClasses.has("lenis");
  const moveTo = (top, behavior) => {
    animation = undefined;
    if (behavior === "smooth" && top !== state.y) {
      if (!nativeSmoothScrollStallsWhileLenisRuns()) animation = { top };
      return;
    }
    state.y = top;
    emit("scroll");
  };
  class FakeSection extends FakeElement {
    getBoundingClientRect() {
      const top = state.sectionTop + HEADER_OFFSET - state.y;
      return { top, bottom: top + 600, left: 0, right: 1280, width: 1280, height: 600 };
    }
    scrollIntoView({ behavior }) {
      moveTo(state.sectionTop, behavior);
    }
  }
  const section = new FakeSection();
  const email = { focus() {} };
  const topButton = {
    hidden: true,
    addEventListener: (_name, callback) => (topButton.press = callback),
  };
  const window = Object.setPrototypeOf(
    {
      location: state.location,
      history: {
        pushState(_state, _title, value) {
          state.location.hash = value;
        },
      },
      matchMedia: () => ({ matches: reduced }),
      addEventListener: (name, callback) => {
        listeners.set(name, [...(listeners.get(name) ?? []), callback]);
      },
      removeEventListener: (name, callback) => {
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((item) => item !== callback),
        );
      },
      dispatchEvent() {},
      requestAnimationFrame: (callback) => frames.push(callback),
      cancelAnimationFrame() {},
      setTimeout: (callback, delay = 0) => {
        timers.set(++timerId, { callback, due: clock + delay });
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
      scrollTo(first, second) {
        if (typeof first === "object") moveTo(first.top, first.behavior);
        else moveTo(second, "instant");
      },
      innerWidth: 1280,
      innerHeight: 800,
      scrollX: 0,
      get scrollY() {
        return state.y;
      },
    },
    FakeWindow.prototype,
  );
  const document = {
    readyState: "complete",
    documentElement: root,
    fonts: { ready: Promise.resolve() },
    getElementById: (id) =>
      id === "ios"
        ? section
        : id === "waitlist-email"
          ? email
          : id === "hero-stage"
            ? { querySelectorAll: () => [] }
            : id === "back-to-top"
              ? topButton
              : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => documentListeners.set(name, callback),
  };
  const animateCompositor = () => {
    if (!animation) return false;
    const direction = Math.sign(animation.top - state.y);
    const next = state.y + direction * FRAME_PIXELS;
    state.y = direction > 0 ? Math.min(next, animation.top) : Math.max(next, animation.top);
    if (state.y === animation.top) animation = undefined;
    return true;
  };
  const advanceFrame = () => {
    if (animateCompositor()) emit("scroll");
    [...tickers].forEach((tick) => tick(clock / 1000));
    frames.splice(0).forEach((callback) => callback());
  };
  const advanceTime = (ms) => {
    const end = clock + ms;
    for (;;) {
      const [id, timer] = [...timers].reduce(
        (first, entry) => (!first || entry[1].due < first[1].due ? entry : first),
        undefined,
      ) ?? [undefined, { due: Infinity }];
      if (timer.due > end) break;
      timers.delete(id);
      clock = Math.max(clock, timer.due);
      timer.callback();
    }
    clock = end;
  };
  const blockMainThread = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) animateCompositor();
    advanceTime(ms);
  };
  const queueRefresh = () => window.requestAnimationFrame(refreshAll);
  const mediaCleanups = [];
  const gsap = {
    registerPlugin() {},
    ticker: { add: (tick) => tickers.add(tick), remove: (tick) => tickers.delete(tick) },
    matchMedia: () => ({
      add(query, callback) {
        const matches =
          typeof query === "object" || query !== "(prefers-reduced-motion: no-preference)"
            ? true
            : !reduced;
        if (!matches) return;
        const cleanup = callback({ conditions: { pinned: true }, add: (run) => run() });
        if (typeof cleanup === "function") mediaCleanups.push(cleanup);
      },
      revert() {
        mediaCleanups.splice(0).forEach((cleanup) => cleanup());
      },
    }),
    timeline: () => {
      queueRefresh();
      return { to() {} };
    },
    fromTo() {},
  };
  const refreshAll = () => {
    const recorded = state.y;
    window.scrollTo(0, 0);
    window.scrollTo(0, 0);
    window.scrollTo(0, 0);
    window.scrollTo(0, recorded);
    scrollTrigger.refreshListeners.forEach((callback) => callback());
  };
  const ScrollTrigger = {
    refresh: refreshAll,
    update() {},
    addEventListener(type, callback) {
      if (type === "refresh") scrollTrigger.refreshListeners.push(callback);
    },
    removeEventListener(type, callback) {
      if (type === "refresh")
        scrollTrigger.refreshListeners = scrollTrigger.refreshListeners.filter(
          (item) => item !== callback,
        );
    },
  };
  const modules = new Map();
  const context = vm.createContext({
    window,
    document,
    navigator: { userAgent: "node" },
    console,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLAnchorElement: class {},
    Window: FakeWindow,
    CustomEvent: class {},
    requestAnimationFrame: window.requestAnimationFrame,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    getComputedStyle: (node) =>
      node === section ? { scrollMarginTop: `${HEADER_OFFSET}px` } : { overflowY: "visible" },
  });
  context.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  context.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const lenis = {};
  vm.runInContext(`(function (exports) {\n${lenisSource}\n})`, context)(lenis);
  const external = {
    gsap: { gsap },
    "gsap/ScrollTrigger": { ScrollTrigger },
    lenis,
    "./hero-float": { mountHeroFloat: () => () => {} },
    "./hero-carousel": { updateHeroCarousel() {} },
  };
  const load = (name) => {
    if (name in external) return external[name];
    if (modules.has(name)) return modules.get(name);
    const file = `src/scripts/${name.replace("./", "")}.ts`;
    const exports = {};
    modules.set(name, exports);
    if (!existsSync(file)) return exports;
    vm.runInContext(`(function (exports, require) {\n${transpile(file)}\n})`, context)(
      exports,
      load,
    );
    return exports;
  };
  const click = () =>
    documentListeners.get("click")({
      target: new FakeElement({}),
      preventDefault() {},
    });
  return {
    load,
    window,
    state,
    section,
    click,
    emit,
    topButton,
    advanceFrame,
    advanceTime,
    blockMainThread,
    refresh: refreshAll,
    scrollTrigger,
    lenisMounted: () => rootClasses.has("lenis"),
  };
}

async function settle(p, frames = 160) {
  for (let i = 0; i < frames; i++) {
    p.advanceFrame();
    await flush();
    p.advanceTime(16);
  }
}

async function settleWithRefreshes(p, frames = 160) {
  for (let i = 0; i < frames; i++) {
    p.advanceFrame();
    await flush();
    p.advanceTime(16);
    if (i % 5 === 4) p.emit("orbit:layout-changed");
  }
}

const sectionGap = (p) => p.section.getBoundingClientRect().top;

test("a press on a waitlist trigger reaches the waitlist when the motion mounts during the smooth scroll", async () => {
  const p = page();
  p.load("./scroll");
  p.load("./waitlist-section");
  p.advanceFrame();
  p.advanceFrame();
  p.click();
  await settle(p);
  assert.ok(p.lenisMounted(), "Lenis mounted");
  assert.equal(p.state.y, SECTION_TOP);
  assert.equal(sectionGap(p), HEADER_OFFSET);
});

test("a visit to the ios fragment reaches the waitlist when the motion mounts during the smooth scroll", async () => {
  const p = page({ hash: "#ios" });
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.load("./waitlist-section");
  await settle(p);
  assert.ok(p.lenisMounted(), "Lenis mounted");
  assert.equal(p.state.y, SECTION_TOP);
  assert.equal(sectionGap(p), HEADER_OFFSET);
});

test("the back to top button reaches the top when the motion mounts during the smooth scroll", async () => {
  const p = page();
  p.state.y = 3000;
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.load("./back-to-top");
  p.topButton.press();
  await settle(p);
  assert.ok(p.lenisMounted(), "Lenis mounted");
  assert.equal(p.state.y, 0);
});

async function mountLenisAtRest(p, top) {
  p.state.y = top;
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.emit("scroll");
  await settle(p, 10);
  assert.ok(p.lenisMounted(), "Lenis mounted");
  assert.equal(p.scrollTrigger.refreshListeners.length, 1, "the motion mounted");
}

test("with Lenis mounted, a press reaches the waitlist below the header through refreshes during the scroll", async () => {
  const p = page();
  await mountLenisAtRest(p, 11);
  p.load("./waitlist-section");
  p.click();
  await flush();
  await settleWithRefreshes(p);
  assert.equal(p.state.y, SECTION_TOP);
  assert.equal(sectionGap(p), HEADER_OFFSET);
});

test("with Lenis mounted, a press reaches the waitlist after a long task and a later refresh", async () => {
  const p = page();
  await mountLenisAtRest(p, 0);
  p.load("./waitlist-section");
  p.click();
  await settle(p, 3);
  assert.ok(p.state.y > 0 && p.state.y < SECTION_TOP, `in flight at ${p.state.y}`);
  p.blockMainThread(200);
  p.emit("orbit:layout-changed");
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
});

test("with Lenis mounted, a refresh after the waitlist moves steers the scroll to its new place", async () => {
  const p = page();
  await mountLenisAtRest(p, 0);
  p.load("./waitlist-section");
  p.click();
  await settle(p, 3);
  assert.ok(p.state.y > 0 && p.state.y < SECTION_TOP, `in flight at ${p.state.y}`);
  p.state.sectionTop = SECTION_TOP + 640;
  p.emit("orbit:layout-changed");
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP + 640);
  assert.equal(sectionGap(p), HEADER_OFFSET);
});

test("with Lenis mounted, the back to top button reaches the top through refreshes during the scroll", async () => {
  const p = page();
  await mountLenisAtRest(p, 9000);
  p.load("./back-to-top");
  p.topButton.press();
  await flush();
  await settleWithRefreshes(p);
  assert.equal(p.state.y, 0);
});

test("a press reaches the waitlist through any number of refreshes during one smooth scroll", async () => {
  const p = page();
  p.load("./scroll");
  p.load("./waitlist-section");
  p.advanceFrame();
  p.advanceFrame();
  p.click();
  await flush();
  for (let round = 0; round < 6; round++) {
    p.advanceFrame();
    p.advanceTime(16);
    if (round % 2) p.blockMainThread(200);
    p.emit("orbit:layout-changed");
    p.advanceFrame();
    await flush();
  }
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
});

test("reduced motion scrolls to the waitlist at once", async () => {
  const p = page({ reduced: true });
  p.load("./scroll");
  p.load("./waitlist-section");
  p.click();
  await flush();
  assert.equal(p.state.y, SECTION_TOP);
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
  assert.equal(p.lenisMounted(), false);
});

test("reduced motion scrolls back to the top at once after the motion mounts", async () => {
  const p = page({ reduced: true });
  await settle(p, 0);
  p.state.y = 9000;
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.emit("scroll");
  await settle(p, 10);
  assert.equal(p.scrollTrigger.refreshListeners.length, 1, "the motion mounted");
  p.load("./back-to-top");
  p.topButton.press();
  await flush();
  assert.equal(p.state.y, 0);
});

test("a scroll that settled is not started again by a later refresh", async () => {
  const p = page();
  p.load("./scroll");
  p.load("./waitlist-section");
  p.advanceFrame();
  p.advanceFrame();
  p.click();
  await settle(p);
  assert.equal(p.scrollTrigger.refreshListeners.length, 1, "the motion mounted");
  p.advanceTime(1000);
  p.window.scrollTo({ top: 1200, behavior: "instant" });
  p.refresh();
  await settle(p);
  assert.equal(p.state.y, 1200);
});

for (const input of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  test(`a ${input} during the smooth scroll stops a later refresh from restarting it`, async () => {
    const p = page();
    p.load("./scroll");
    p.load("./waitlist-section");
    p.advanceFrame();
    p.advanceFrame();
    p.click();
    await flush();
    p.emit(input);
    await settle(p);
    assert.ok(p.state.y < SECTION_TOP, `stopped at ${p.state.y}`);
  });

  test(`a ${input} during a scroll that Lenis drives stops it`, async () => {
    const p = page();
    await mountLenisAtRest(p, 0);
    p.load("./waitlist-section");
    p.click();
    await settle(p, 3);
    const stopped = p.state.y;
    assert.ok(stopped > 0 && stopped < SECTION_TOP, `in flight at ${stopped}`);
    p.emit(input);
    await settleWithRefreshes(p);
    assert.equal(p.state.y, stopped);
  });
}

test("disposing the motion removes its refresh listener and unmounts Lenis", () => {
  const p = page();
  const motion = p.load("./landing-motion");
  const dispose = motion.mountLandingMotion();
  assert.equal(p.scrollTrigger.refreshListeners.length, 1);
  assert.ok(p.lenisMounted());
  dispose();
  assert.equal(p.scrollTrigger.refreshListeners.length, 0);
  assert.equal(p.lenisMounted(), false);
});
