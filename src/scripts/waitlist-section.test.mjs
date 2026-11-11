import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

class FakeElement {
  constructor(trigger) {
    this.trigger = trigger;
  }
  closest(selector) {
    return selector === "[data-ios-trigger]" ? this.trigger : null;
  }
}

function harness(hash = "", reduced = false) {
  const listeners = new Map(),
    entries = [];
  const section = {
      scrollIntoView(options) {
        entries.push(options);
      },
    },
    email = {
      focused: { preventScroll: false },
      focus(options) {
        this.focused = options;
      },
    };
  const triggers = [{}, {}];
  const documentListeners = new Map();
  const dispatch = (event) => documentListeners.get("click")?.(event);
  const click = (target) => {
    const event = {
      prevented: false,
      target: new FakeElement(target),
      preventDefault() {
        this.prevented = true;
      },
    };
    dispatch(event);
    return event;
  };
  const location = { hash };
  const transpile = (file) =>
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
  const sandbox = {
    exports: {},
    Element: FakeElement,
    document: {
      getElementById: (id) => (id === "ios" ? section : email),
      addEventListener: (name, fn) => documentListeners.set(name, fn),
    },
    window: {
      location,
      matchMedia: () => ({ matches: reduced }),
      history: {
        pushState(_state, _title, value) {
          location.hash = value;
        },
      },
      addEventListener: (name, fn) => listeners.set(name, fn),
      setTimeout: () => 0,
      clearTimeout() {},
    },
  };
  const scroll = {};
  vm.runInNewContext(
    `(function (exports) {${transpile("src/scripts/programmatic-scroll.ts")}})`,
    sandbox,
  )(scroll);
  const loads = [];
  sandbox.require = (path) => {
    loads.push(path);
    return scroll;
  };
  vm.runInNewContext(transpile("src/scripts/waitlist-section.ts"), sandbox);
  return { entries, email, triggers, listeners, location, click, dispatch, loads };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));
test("the ios fragment scrolls to the dedicated section and focuses its real email field", async () => {
  for (const reduced of [false, true]) {
    const h = harness("#ios", reduced);
    await settled();
    assert.equal(h.entries.length, 1);
    assert.equal(h.entries[0].behavior, reduced ? "instant" : "smooth");
    assert.equal(h.email.focused.preventScroll, true);
  }
});
test("footer and FAQ entries repeat the same fragment behavior and history stays usable", async () => {
  const h = harness();
  assert.equal(h.entries.length, 0);
  for (const trigger of h.triggers) assert.ok(h.click(trigger).prevented);
  await settled();
  assert.equal(h.location.hash, "#ios");
  assert.equal(h.entries.length, 2);
  h.location.hash = "";
  h.listeners.get("popstate")();
  await settled();
  assert.equal(h.entries.length, 2);
  h.location.hash = "#ios";
  h.listeners.get("hashchange")();
  await settled();
  assert.equal(h.entries.length, 3);
});
test("a trigger added after the script loaded and a repeat tap on the ios fragment still focus the field", async () => {
  const h = harness("#ios");
  await settled();
  assert.equal(h.entries.length, 1);
  const late = {};
  assert.ok(h.click(late).prevented);
  await settled();
  assert.equal(h.entries.length, 2);
  assert.equal(h.email.focused.preventScroll, true);
});
test("the programmatic scroll loads on the first click on a trigger and not at script start", async () => {
  const h = harness();
  assert.deepEqual(h.loads, []);
  h.click(null);
  await settled();
  assert.deepEqual(h.loads, [], "a click outside every trigger loads nothing");
  h.click({});
  await settled();
  assert.equal(h.loads.length, 1);
  assert.equal(h.entries.length, 1);
});
test("a later click starts the scroll in the task of the click once the scroll module is loaded", async () => {
  const h = harness();
  h.click({});
  await settled();
  const before = h.entries.length;
  h.click({});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.entries.length, before + 1);
});
test("a click outside every waitlist trigger is left alone", () => {
  const h = harness();
  assert.equal(h.click(null).prevented, false);
  assert.equal(h.entries.length, 0);
  assert.equal(h.location.hash, "");
});
test("a click whose target is not an Element is left alone", () => {
  const h = harness();
  const event = {
    prevented: false,
    target: { closest: () => ({}) },
    preventDefault() {
      this.prevented = true;
    },
  };
  h.dispatch(event);
  assert.equal(event.prevented, false);
  assert.equal(h.entries.length, 0);
});
test("the section precedes FAQ and owns the existing waitlist and Turnstile controls", () => {
  const source = readFileSync("src/components/IosWaitlist.astro", "utf8");
  assert.match(source, /<section\s+id="ios"/);
  assert.doesNotMatch(source, /<dialog|ios-close/);
  for (const id of ["form", "email", "submit", "submit-label", "status", "turnstile", "privacy"])
    assert.ok(source.includes(`id="waitlist-${id}"`));
  const page = readFileSync("src/pages/index.astro", "utf8");
  assert.ok(page.indexOf("<IosWaitlist />") < page.indexOf("<Faq />"));
});
