import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("src/scripts/downloads-panel.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class FakeElement {
  constructor(name, matches = []) {
    this.name = name;
    this.matchedSelectors = matches;
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.focused = 0;
    this.scrolled = [];
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  hasAttribute(key) {
    return this.attributes.has(key);
  }
  toggleAttribute(key, force) {
    if (force) this.attributes.set(key, "");
    else this.attributes.delete(key);
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
  contains(node) {
    return node === this || this.children.includes(node);
  }
  closest(selector) {
    const parts = selector.split(",").map((part) => part.trim());
    return parts.some((part) => this.matchedSelectors.includes(part)) ? this : null;
  }
  focus(options) {
    this.focused += 1;
    this.focusOptions = options;
  }
  scrollIntoView(options) {
    this.scrolled.push(options);
  }
}

function page({ hash = "", reducedMotion = false } = {}) {
  const toggle = new FakeElement("toggle", ["#downloads-toggle"]);
  toggle.setAttribute("aria-expanded", "false");
  const panel = new FakeElement("panel", ["#downloads"]);
  const entry = new FakeElement("entry", ["#downloads a"]);
  panel.children.push(entry);
  const opener = new FakeElement("header link", ["[data-downloads-open]"]);
  const elsewhere = new FakeElement("elsewhere");
  const listeners = new Map();
  const document = {
    getElementById: (id) => ({ "downloads-toggle": toggle, downloads: panel })[id] ?? null,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  vm.runInNewContext(source, {
    document,
    exports: {},
    Element: FakeElement,
    Node: FakeElement,
    window: {
      location: { hash },
      matchMedia: () => ({ matches: reducedMotion }),
    },
  });
  const fire = (type, target, extra = {}) => {
    const event = { type, target, defaultPrevented: false, ...extra };
    event.preventDefault = () => {
      event.defaultPrevented = true;
    };
    (target === panel && type === "focusout" ? panel.listeners : listeners).get(type)?.(event);
    return event;
  };
  return {
    toggle,
    panel,
    entry,
    opener,
    elsewhere,
    fire,
    press: (key) => fire("keydown", elsewhere, { key }),
    open: () => toggle.listeners.get("click")(),
    expanded: () => toggle.getAttribute("aria-expanded"),
    isOpen: () => panel.hasAttribute("data-open"),
  };
}

test("the toggle opens and closes the panel and reports aria-expanded", () => {
  const view = page();
  assert.equal(view.expanded(), "false");
  assert.equal(view.isOpen(), false);
  view.open();
  assert.equal(view.expanded(), "true");
  assert.equal(view.isOpen(), true);
  view.open();
  assert.equal(view.expanded(), "false");
  assert.equal(view.isOpen(), false);
});

test("Escape closes the open panel and returns focus to the button", () => {
  const view = page();
  view.open();
  const before = view.toggle.focused;
  const event = view.press("Escape");
  assert.equal(view.isOpen(), false);
  assert.equal(view.expanded(), "false");
  assert.equal(view.toggle.focused, before + 1);
  assert.equal(event.defaultPrevented, true);
});

test("Escape and other keys leave a closed panel and the focus alone", () => {
  const view = page();
  view.press("Escape");
  assert.equal(view.toggle.focused, 0);
  view.open();
  view.press("Enter");
  assert.equal(view.isOpen(), true);
  assert.equal(view.toggle.focused, 0);
});

test("the header link opens the panel, scrolls to the button and focuses it", () => {
  const view = page();
  const event = view.fire("click", view.opener);
  assert.equal(event.defaultPrevented, true);
  assert.equal(view.isOpen(), true);
  assert.equal(view.expanded(), "true");
  assert.deepEqual(JSON.parse(JSON.stringify(view.toggle.scrolled)), [
    { behavior: "smooth", block: "start" },
  ]);
  assert.equal(view.toggle.focused, 1);
  view.press("Escape");
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 2);
});

test("the header link scrolls without animation under reduced motion", () => {
  const view = page({ reducedMotion: true });
  view.fire("click", view.opener);
  assert.deepEqual(JSON.parse(JSON.stringify(view.toggle.scrolled)), [
    { behavior: "instant", block: "start" },
  ]);
});

test("a press outside the panel closes it without moving focus", () => {
  const view = page();
  view.open();
  view.fire("pointerdown", view.panel);
  assert.equal(view.isOpen(), true);
  view.fire("pointerdown", view.toggle);
  assert.equal(view.isOpen(), true);
  view.fire("pointerdown", view.elsewhere);
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 0);
});

test("choosing an entry closes the panel and keeps its own destination", () => {
  const view = page();
  view.open();
  const event = view.fire("click", view.entry);
  assert.equal(view.isOpen(), false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(view.toggle.focused, 0);
});

test("focus that leaves the panel for the page closes it", () => {
  const view = page();
  view.open();
  view.fire("focusout", view.panel, { relatedTarget: view.entry });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: view.toggle });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: null });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: view.elsewhere });
  assert.equal(view.isOpen(), false);
});

test("a visit to the downloads fragment opens the panel", () => {
  assert.equal(page({ hash: "#downloads" }).isOpen(), true);
  assert.equal(page({ hash: "#features" }).isOpen(), false);
});
