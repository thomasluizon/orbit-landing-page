import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { scriptsFrom } from "./html.test-helper.mjs";

const transpile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const source = transpile("src/scripts/downloads-launcher.ts");
const headerScrollSource = transpile("src/scripts/header-scroll.ts");
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
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  scrollIntoView(options) {
    this.scrolled.push({ ...options });
  }
  focus(options) {
    this.focused.push({ ...options });
  }
}

function launch(hash = "", { failing = false, headerScroll = false } = {}) {
  const loaded = [];
  const smooth = [];
  const pushed = [];
  const listeners = [];
  const toggle = new FakeElement("toggle", ["#downloads-toggle"]);
  toggle.setAttribute("aria-expanded", "false");
  const link = new FakeElement("header link", [
    'a[href="#downloads"]',
    '.header-links a[href^="#"]',
  ]);
  link.setAttribute("href", "#downloads");
  const wrapper = new FakeElement("downloads wrapper");
  const icon = new FakeElement("toggle icon");
  icon.closest = (selector) => toggle.closest(selector);
  const elsewhere = new FakeElement("elsewhere");
  const page = {
    Element: FakeElement,
    require: (path) => {
      loaded.push(path);
      if (failing) throw new Error("chunk request failed");
      return path === "./programmatic-scroll"
        ? { scrollToElement: (target) => smooth.push(target) }
        : {};
    },
    document: {
      getElementById: (id) => ({ "downloads-toggle": toggle, downloads: wrapper })[id] ?? null,
      addEventListener: (type, listener) => {
        assert.equal(type, "click");
        listeners.push(listener);
      },
    },
    location: { hash },
    window: {
      location: { hash },
      history: { pushState: (_state, _title, url) => pushed.push(url) },
    },
  };
  vm.runInNewContext(source, { ...page, exports: {} });
  if (headerScroll) vm.runInNewContext(headerScrollSource, { ...page, exports: {} });
  const press = (target, modifiers = {}) => {
    const event = {
      target,
      button: 0,
      ...modifiers,
      defaultPrevented: false,
      preventDefault: () => (event.defaultPrevented = true),
    };
    for (const listener of listeners) listener(event);
    return event;
  };
  const expanded = () => toggle.getAttribute("aria-expanded");
  return {
    loaded,
    smooth,
    pushed,
    listeners,
    press,
    expanded,
    toggle,
    link,
    wrapper,
    icon,
    elsewhere,
  };
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
  assert.equal(event.defaultPrevented, true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, []);
  assert.deepEqual(view.toggle.focused, []);
});

test("the next press on the toggle closes the panel, with the panel code still on its way", () => {
  const view = launch();
  view.press(view.toggle);
  assert.equal(view.press(view.icon).defaultPrevented, true);
  assert.equal(view.expanded(), "false");
  view.press(view.toggle);
  assert.equal(view.expanded(), "true");
});

test("a press on a downloads link opens the panel and focuses the toggle in the same task, then scrolls to it through the programmatic scroll", async () => {
  const view = launch();
  const event = view.press(view.link);
  assert.equal(event.defaultPrevented, true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.focused, [{ preventScroll: true }]);
  await flush();
  assert.deepEqual(view.smooth, [view.toggle]);
  assert.deepEqual(
    view.toggle.scrolled,
    [],
    "a native scroll would stop short at the next motion refresh",
  );
  assert.deepEqual(view.loaded, ["./downloads-panel", "./programmatic-scroll"]);
});

test("a modified press on a downloads link keeps the browser's new tab or new window action", async () => {
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey"]) {
    const view = launch();
    const event = view.press(view.link, { [modifier]: true });
    await flush();
    assert.equal(event.defaultPrevented, false, modifier);
    assert.equal(view.expanded(), "false", modifier);
    assert.deepEqual(view.toggle.scrolled, [], modifier);
    assert.deepEqual(view.smooth, [], modifier);
    assert.deepEqual(view.toggle.focused, [], modifier);
    assert.deepEqual(view.loaded, [], modifier);
  }
});

test("a modified press on the toggle still opens the panel, because a button has no new tab action", () => {
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey"]) {
    const view = launch();
    const event = view.press(view.toggle, { [modifier]: true });
    assert.equal(event.defaultPrevented, true, modifier);
    assert.equal(view.expanded(), "true", modifier);
  }
});

test("a press on a downloads link never closes the open panel", async () => {
  const view = launch();
  view.press(view.toggle);
  view.press(view.link);
  assert.equal(view.expanded(), "true");
  view.press(view.link);
  assert.equal(view.expanded(), "true");
  await flush();
  assert.deepEqual(view.smooth, [view.toggle, view.toggle]);
});

test("a header downloads link press runs one handler with the header link scroll loaded", async () => {
  const view = launch("", { headerScroll: true });
  assert.equal(view.listeners.length, 2, "the launcher listens first, the header link scroll next");
  const event = view.press(view.link);
  await flush();
  assert.equal(event.defaultPrevented, true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.smooth, [view.toggle], "one scroll, to the toggle and not the wrapper");
  assert.deepEqual(view.toggle.focused, [{ preventScroll: true }]);
  assert.deepEqual(view.wrapper.focused, []);
  assert.equal(view.wrapper.getAttribute("tabindex"), null);
  assert.deepEqual(view.pushed, []);
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey"]) {
    const modified = launch("", { headerScroll: true });
    const press = modified.press(modified.link, { [modifier]: true });
    await flush();
    assert.equal(press.defaultPrevented, false, modifier);
    assert.equal(modified.expanded(), "false", modifier);
    assert.deepEqual(modified.smooth, [], modifier);
    assert.deepEqual(modified.toggle.focused, [], modifier);
    assert.deepEqual(modified.wrapper.focused, [], modifier);
    assert.deepEqual(modified.pushed, [], modifier);
  }
});

test("a visit to the downloads fragment opens the panel at startup and leaves the scroll and the focus to the browser", async () => {
  const view = launch("#downloads");
  assert.equal(view.expanded(), "true");
  assert.deepEqual(view.toggle.scrolled, []);
  assert.deepEqual(view.toggle.focused, []);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel"]);
  assert.deepEqual(view.smooth, []);
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
  assert.deepEqual(view.loaded, [
    "./downloads-panel",
    "./downloads-panel",
    "./programmatic-scroll",
  ]);
});

test("a failed chunk load leaves a panel that the toggle and a link still open and close, and a link still reaches the toggle", async () => {
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
  assert.deepEqual(view.smooth, []);
  assert.deepEqual(
    view.loaded,
    ["./downloads-panel", "./downloads-panel", "./programmatic-scroll"],
    "the next open asks for the panel code again",
  );
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
  assert.equal(event.defaultPrevented, false);
  assert.equal(view.expanded(), "false");
  assert.deepEqual(view.loaded, []);
});

test("no startup script imports the panel code or the programmatic scroll statically", () => {
  const page = readFileSync("src/pages/index.astro", "utf8");
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const launcher = readFileSync("src/scripts/downloads-launcher.ts", "utf8");
  for (const html of [page, hero])
    for (const { body } of scriptsFrom(html)) assert.doesNotMatch(body, /downloads-panel/);
  assert.match(page, /import "\.\.\/scripts\/downloads-launcher";/);
  assert.doesNotMatch(launcher, /^import\b/m);
  assert.match(launcher, /import\("\.\/downloads-panel"\)/);
  assert.match(launcher, /import\("\.\/programmatic-scroll"\)/);
});
