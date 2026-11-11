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
    this.scrolled = 0;
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
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
  focus() {
    this.focused += 1;
  }
  scrollIntoView() {
    this.scrolled += 1;
  }
}

function page({ hash = "", open = true } = {}) {
  const toggle = new FakeElement("toggle", ["#downloads"]);
  toggle.setAttribute("aria-expanded", String(open));
  const panel = new FakeElement("panel", ["#downloads"]);
  const entry = new FakeElement("entry", ["#downloads a", "#downloads"]);
  panel.children.push(entry);
  const opener = new FakeElement("header link", ['a[href="#downloads"]']);
  const elsewhere = new FakeElement("elsewhere");
  const listeners = new Map();
  const document = {
    activeElement: null,
    getElementById: (id) => ({ "downloads-toggle": toggle, "downloads-panel": panel })[id] ?? null,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const exports = {};
  vm.runInNewContext(source, {
    document,
    exports,
    Element: FakeElement,
    Node: FakeElement,
    location: { hash },
    window: { location: { hash } },
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
    document,
    exports,
    toggle,
    panel,
    entry,
    opener,
    elsewhere,
    fire,
    press: (key) => fire("keydown", elsewhere, { key }),
    isOpen: () => toggle.getAttribute("aria-expanded") === "true",
  };
}

test("the panel code leaves the state of the panel alone when it arrives", () => {
  for (const hash of ["", "#downloads"]) {
    const opened = page({ hash });
    assert.equal(opened.isOpen(), true);
    const closed = page({ hash, open: false });
    assert.equal(closed.isOpen(), false);
    for (const view of [opened, closed]) {
      assert.equal(view.toggle.scrolled, 0);
      assert.equal(view.toggle.focused, 0);
    }
  }
});

test("the panel code gives the launcher nothing to call", () => {
  assert.deepEqual(Object.keys(page().exports), []);
});

test("Escape with focus in the panel closes it and returns focus to the button", () => {
  const view = page();
  view.document.activeElement = view.entry;
  const event = view.press("Escape");
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 1);
  assert.equal(event.defaultPrevented, true);
});

test("Escape with focus outside the panel closes it and leaves the focus alone", () => {
  const view = page();
  const event = view.press("Escape");
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 0);
  assert.equal(event.defaultPrevented, true);
});

test("Escape and other keys leave a closed panel and the focus alone", () => {
  const closed = page({ open: false });
  const event = closed.press("Escape");
  assert.equal(event.defaultPrevented, false);
  assert.equal(closed.toggle.focused, 0);
  const view = page();
  view.press("Enter");
  assert.equal(view.isOpen(), true);
  assert.equal(view.toggle.focused, 0);
});

test("the panel leaves every opener press to the launcher, so one path handles it", () => {
  for (const open of [true, false]) {
    const view = page({ open });
    assert.equal(view.toggle.listeners.has("click"), false);
    for (const opener of [view.toggle, view.opener]) {
      for (const type of ["pointerdown", "click"]) {
        const event = view.fire(type, opener);
        assert.equal(event.defaultPrevented, false);
        assert.equal(view.isOpen(), open);
      }
    }
  }
});

test("a press outside the panel closes it without moving focus", () => {
  const view = page();
  view.fire("pointerdown", view.panel);
  assert.equal(view.isOpen(), true);
  view.fire("pointerdown", view.entry);
  assert.equal(view.isOpen(), true);
  view.fire("pointerdown", view.elsewhere);
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 0);
});

test("choosing an entry closes the panel and keeps its own destination", () => {
  const view = page();
  const event = view.fire("click", view.entry);
  assert.equal(view.isOpen(), false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(view.toggle.focused, 0);
});

test("choosing an entry with the keyboard returns focus to the button before the panel hides", () => {
  const view = page();
  view.document.activeElement = view.entry;
  view.fire("click", view.entry);
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 1);
});

test("focus that leaves the panel for the page closes it", () => {
  const view = page();
  view.fire("focusout", view.panel, { relatedTarget: view.entry });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: view.toggle });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: null });
  assert.equal(view.isOpen(), true);
  view.fire("focusout", view.panel, { relatedTarget: view.elsewhere });
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 0);
});

test("a dismissal leaves a panel that the launcher can open again", () => {
  const view = page();
  view.press("Escape");
  view.toggle.setAttribute("aria-expanded", "true");
  view.fire("pointerdown", view.elsewhere);
  assert.equal(view.isOpen(), false);
});
