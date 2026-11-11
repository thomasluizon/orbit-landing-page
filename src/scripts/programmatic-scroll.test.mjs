import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const SECTION_TOP = 5000;
const FRAME_PIXELS = 100;
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeElement {
  constructor(trigger) {
    this.trigger = trigger;
  }
  closest(selector) {
    return selector === "[data-ios-trigger]" ? this.trigger : null;
  }
}

function page({ reduced = false, hash = "" } = {}) {
  const listeners = new Map();
  const documentListeners = new Map();
  const frames = [];
  const timers = new Map();
  let clock = 0;
  let timerId = 0;
  let animation;
  const scrollTrigger = { refreshListeners: [] };
  const state = { y: 0, location: { hash } };
  const emit = (name) => (listeners.get(name) ?? []).forEach((callback) => callback());
  const moveTo = (top, behavior) => {
    animation = undefined;
    if (behavior === "smooth" && top !== state.y) animation = { top };
    else state.y = top;
    if (!animation) emit("scroll");
  };
  const section = {
    scrollIntoView: ({ behavior }) => moveTo(SECTION_TOP, behavior),
  };
  const email = { focus() {} };
  const topButton = {
    hidden: true,
    addEventListener: (_name, callback) => (topButton.press = callback),
  };
  const window = {
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
    requestAnimationFrame: (callback) => frames.push(callback),
    cancelAnimationFrame() {},
    setTimeout: (callback, delay) => {
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
    get scrollY() {
      return state.y;
    },
  };
  const document = {
    readyState: "complete",
    fonts: { ready: Promise.resolve() },
    getElementById: (id) =>
      id === "ios"
        ? section
        : id === "waitlist-email"
          ? email
          : id === "hero-stage"
            ? {}
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
  const gsap = {
    registerPlugin() {},
    ticker: { add() {}, remove() {} },
    matchMedia: () => ({
      add(query, callback) {
        if (typeof query === "object") callback({ conditions: { pinned: true } });
      },
      revert() {},
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
  const context = vm.createContext({ window, document, Element: FakeElement });
  context.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  context.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const external = {
    gsap: { gsap },
    "gsap/ScrollTrigger": { ScrollTrigger },
    lenis: {
      default: class {
        raf() {}
        on() {}
        destroy() {}
      },
    },
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
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function (exports, require) {\n${code}\n})`, context)(exports, load);
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
    click,
    emit,
    topButton,
    advanceFrame,
    advanceTime,
    blockMainThread,
    refresh: refreshAll,
    scrollTrigger,
  };
}

async function settle(p, frames = 120) {
  for (let i = 0; i < frames; i++) {
    p.advanceFrame();
    await flush();
    p.advanceTime(16);
  }
}

test("a press on a waitlist trigger reaches the waitlist when the motion mounts during the smooth scroll", async () => {
  const p = page();
  p.load("./scroll");
  p.load("./waitlist-section");
  p.advanceFrame();
  p.advanceFrame();
  p.click();
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
});

test("a visit to the ios fragment reaches the waitlist when the motion mounts during the smooth scroll", async () => {
  const p = page({ hash: "#ios" });
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.load("./waitlist-section");
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
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
  assert.equal(p.state.y, 0);
});

async function pressAndMount(p) {
  p.load("./scroll");
  p.load("./waitlist-section");
  p.advanceFrame();
  p.advanceFrame();
  p.click();
  await settle(p, 3);
  assert.equal(p.scrollTrigger.refreshListeners.length, 1, "the motion mounted");
  assert.ok(p.state.y > 0 && p.state.y < SECTION_TOP, `in flight at ${p.state.y}`);
}

test("a press reaches the waitlist when a layout change refreshes again after a long task", async () => {
  const p = page();
  await pressAndMount(p);
  p.blockMainThread(200);
  p.emit("orbit:layout-changed");
  await settle(p);
  assert.equal(p.state.y, SECTION_TOP);
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

test("the back to top button reaches the top when a layout change refreshes again after a long task", async () => {
  const p = page();
  p.state.y = 9000;
  p.load("./scroll");
  p.advanceFrame();
  p.advanceFrame();
  p.load("./back-to-top");
  p.topButton.press();
  await settle(p, 3);
  assert.ok(p.state.y > 0, `in flight at ${p.state.y}`);
  p.blockMainThread(200);
  p.emit("orbit:layout-changed");
  await settle(p);
  assert.equal(p.state.y, 0);
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
}

test("disposing the motion removes its refresh listener", () => {
  const p = page();
  const motion = p.load("./landing-motion");
  const dispose = motion.mountLandingMotion();
  assert.equal(p.scrollTrigger.refreshListeners.length, 1);
  dispose();
  assert.equal(p.scrollTrigger.refreshListeners.length, 0);
});
