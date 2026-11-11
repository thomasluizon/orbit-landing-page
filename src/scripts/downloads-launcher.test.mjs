import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { scriptsFrom } from "./html.test-helper.mjs";

const source = ts.transpileModule(readFileSync("src/scripts/downloads-launcher.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeElement {
  constructor(name, selectors = []) {
    this.name = name;
    this.selectors = selectors;
    this.attributes = new Map();
    this.scrolled = [];
    this.focused = [];
  }
  closest(selector) {
    const parts = selector.split(",").map((part) => part.trim());
    return parts.some((part) => this.selectors.includes(part)) ? this : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  scrollIntoView(options) {
    this.scrolled.push({ ...options });
  }
  focus(options) {
    this.focused.push({ ...options });
  }
}

function launch(hash = "", { failing = false } = {}) {
  const loaded = [];
  const listeners = [];
  const toggle = new FakeElement("toggle", ["#downloads-toggle"]);
  toggle.setAttribute("aria-expanded", "false");
  const link = new FakeElement("header link", ['a[href="#downloads"]']);
  const icon = new FakeElement("toggle icon");
  icon.closest = (selector) => toggle.closest(selector);
  const elsewhere = new FakeElement("elsewhere");
  vm.runInNewContext(source, {
    exports: {},
    Element: FakeElement,
    require: (path) => {
      loaded.push(path);
      if (failing) throw new Error("chunk request failed");
      return {};
    },
    document: {
      getElementById: (id) => (id === "downloads-toggle" ? toggle : null),
      addEventListener: (type, listener) => {
        assert.equal(type, "click");
        listeners.push(listener);
      },
    },
    location: { hash },
  });
  const press = (target) => {
    const event = { target, prevented: false, preventDefault: () => (event.prevented = true) };
    for (const listener of listeners) listener(event);
    return event;
  };
  const expanded = () => toggle.getAttribute("aria-expanded");
  return { loaded, listeners, press, expanded, toggle, link, icon, elsewhere };
}

test("the page loads no panel code and opens no panel before a visitor uses a download control", async () => {
  const view = launch();
  await flush();
  assert.deepEqual(view.loaded, []);
  assert.equal(view.listeners.length, 1);
  assert.equal(view.expanded(), "false");
});

test("a press on the toggle opens the panel in the same task, before the panel code arrives", () => {
  const view = launch();
  const event = view.press(view.toggle);
  assert.equal(event.prevented, true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, []);
  assert.deepEqual(view.toggle.focused, []);
});

test("the next press on the toggle closes the panel, with the panel code still on its way", () => {
  const view = launch();
  view.press(view.toggle);
  assert.equal(view.press(view.icon).prevented, true);
  assert.equal(view.expanded(), "false");
  view.press(view.toggle);
  assert.equal(view.expanded(), "true");
});

test("a press on a downloads link opens the panel in the same task, scrolls to the toggle and focuses it", () => {
  const view = launch();
  const event = view.press(view.link);
  assert.equal(event.prevented, true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, [{ block: "start" }]);
  assert.deepEqual(view.toggle.focused, [{ preventScroll: true }]);
});

test("a press on a downloads link never closes the open panel", () => {
  const view = launch();
  view.press(view.toggle);
  view.press(view.link);
  assert.equal(view.expanded(), "true");
  view.press(view.link);
  assert.equal(view.expanded(), "true");
  assert.equal(view.toggle.scrolled.length, 2);
});

test("a visit to the downloads fragment opens the panel at startup and leaves the scroll and the focus to the browser", async () => {
  const view = launch("#downloads");
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, []);
  assert.deepEqual(view.toggle.focused, []);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel"]);
  const other = launch("#features");
  await flush();
  assert.equal(other.expanded(), "false");
  assert.deepEqual(other.toggle.scrolled, []);
  assert.deepEqual(other.loaded, []);
});

test("a press on the toggle after a fragment visit closes the panel that the visit opened", () => {
  const view = launch("#downloads");
  view.press(view.toggle);
  assert.equal(view.expanded(), "false");
});

test("each open asks for the panel code and a close asks for nothing", async () => {
  const view = launch();
  view.press(view.toggle);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel"]);
  view.press(view.toggle);
  await flush();
  assert.equal(view.loaded.length, 1);
  view.press(view.link);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel", "./downloads-panel"]);
});

test("a failed panel load leaves a panel that the toggle and a link still open and close", async () => {
  const view = launch("", { failing: true });
  view.press(view.toggle);
  assert.equal(view.expanded(), "true");
  await flush();
  assert.equal(view.expanded(), "true");
  view.press(view.toggle);
  await flush();
  assert.equal(view.expanded(), "false");
  view.press(view.link);
  await flush();
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, [{ block: "start" }]);
  assert.equal(view.loaded.length, 2, "the next open asks for the panel code again");
});

test("a visit to the downloads fragment still opens the panel when the panel code fails to load", async () => {
  const view = launch("#downloads", { failing: true });
  await flush();
  assert.equal(view.expanded(), "true");
  assert.equal(view.loaded.length, 1);
});

test("a press outside the openers keeps its own action and loads nothing", async () => {
  const view = launch();
  const event = view.press(view.elsewhere);
  await flush();
  assert.equal(event.prevented, false);
  assert.equal(view.expanded(), "false");
  assert.deepEqual(view.loaded, []);
});

test("no startup script imports the panel code statically", () => {
  const page = readFileSync("src/pages/index.astro", "utf8");
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const launcher = readFileSync("src/scripts/downloads-launcher.ts", "utf8");
  for (const html of [page, hero])
    for (const { body } of scriptsFrom(html)) assert.doesNotMatch(body, /downloads-panel/);
  assert.match(page, /import "\.\.\/scripts\/downloads-launcher";/);
  assert.doesNotMatch(launcher, /^import\b/m);
  assert.match(launcher, /import\("\.\/downloads-panel"\)/);
});
