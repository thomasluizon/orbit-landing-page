import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("src/scripts/downloads-panel.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class FakeElement {
  constructor(name, matches = [], dataset = {}) {
    this.name = name;
    this.dataset = dataset;
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

const entryIds = ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"];

function entryList(panel) {
  const list = new FakeElement("list");
  list.items = entryIds.map(
    (id) =>
      new FakeElement(
        id,
        [],
        id === "android" || id === "iphone" ? { downloadTarget: id } : { desktopDownload: id },
      ),
  );
  list.append = (...nodes) => {
    list.items = nodes;
  };
  panel.querySelector = (selector) => (selector === ".downloads-list" ? list : null);
  panel.querySelectorAll = (selector) => (selector === ".downloads-entry" ? list.items : []);
  return list;
}

function page({ hash = "", reducedMotion = false, lead } = {}) {
  const toggle = new FakeElement("toggle", ["#downloads-toggle"]);
  toggle.setAttribute("aria-expanded", "false");
  const panel = new FakeElement("panel", ["#downloads"]);
  const entry = new FakeElement("entry", ["#downloads a"]);
  panel.children.push(entry);
  const list = entryList(panel);
  const hero = new FakeElement("hero", [], lead === undefined ? {} : { downloadLead: lead });
  const opener = new FakeElement("header link", ['a[href="#downloads"]']);
  const elsewhere = new FakeElement("elsewhere");
  const listeners = new Map();
  const document = {
    activeElement: null,
    getElementById: (id) =>
      ({ "downloads-toggle": toggle, downloads: panel, "hero-download": hero })[id] ?? null,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const exports = {};
  vm.runInNewContext(source, {
    document,
    exports,
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
    document,
    activate: exports.activate,
    toggle,
    panel,
    entry,
    opener,
    elsewhere,
    hero,
    order: () => list.items.map(({ name }) => name),
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
  assert.deepEqual(JSON.parse(JSON.stringify(view.toggle.scrolled)), [{ block: "start" }]);
  assert.equal(view.toggle.focused, 1);
  view.press("Escape");
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 2);
});

test("the header link jumps without a smooth scroll, which the motion refresh would stop short", () => {
  for (const reducedMotion of [false, true]) {
    const view = page({ reducedMotion });
    view.fire("click", view.opener);
    assert.deepEqual(JSON.parse(JSON.stringify(view.toggle.scrolled)), [{ block: "start" }]);
  }
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

test("choosing an entry with the keyboard returns focus to the button before the panel hides", () => {
  const view = page();
  view.open();
  view.document.activeElement = view.entry;
  view.fire("click", view.entry);
  assert.equal(view.isOpen(), false);
  assert.equal(view.toggle.focused, 1);
});

test("the press that loaded the module acts once: the button toggles and the header link opens", () => {
  const view = page();
  view.activate(view.toggle);
  assert.equal(view.isOpen(), true);
  view.activate(view.toggle);
  assert.equal(view.isOpen(), false);
  view.activate(view.opener);
  assert.equal(view.isOpen(), true);
  assert.equal(view.toggle.scrolled.length, 1);
  assert.equal(view.toggle.focused, 1);
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

test("a visit to the downloads fragment opens the panel and brings the button below the header", () => {
  const view = page({ hash: "#downloads" });
  assert.equal(view.isOpen(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(view.toggle.scrolled)), [{ block: "start" }]);
  assert.equal(view.toggle.focused, 1);
  const other = page({ hash: "#features" });
  assert.equal(other.isOpen(), false);
  assert.equal(other.toggle.scrolled.length, 0);
});

for (const [visitor, lead, expected] of [
  [
    "a Mac that reports Apple silicon",
    "mac-arm",
    ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"],
  ],
  [
    "a Mac that reports Intel",
    "mac-x86",
    ["mac-x86", "mac-arm", "windows-x86", "windows-arm", "android", "iphone"],
  ],
  [
    "a Windows PC",
    "windows-x86",
    ["windows-x86", "windows-arm", "mac-arm", "mac-x86", "android", "iphone"],
  ],
  [
    "a Windows on Arm PC",
    "windows-arm",
    ["windows-arm", "windows-x86", "mac-arm", "mac-x86", "android", "iphone"],
  ],
  [
    "an Android phone",
    "android",
    ["android", "mac-arm", "mac-x86", "windows-x86", "windows-arm", "iphone"],
  ],
  [
    "an iPhone",
    "iphone",
    ["iphone", "mac-arm", "mac-x86", "windows-x86", "windows-arm", "android"],
  ],
  [
    "an unknown visitor",
    undefined,
    ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"],
  ],
]) {
  test(`opening the panel for ${visitor} lists the visitor's platform first`, () => {
    const view = page({ lead });
    assert.deepEqual(view.order(), entryIds);
    view.open();
    assert.deepEqual(view.order(), expected);
  });
}

test("the panel orders again on every open and follows a late architecture hint", () => {
  const view = page({ lead: "mac-arm" });
  view.open();
  view.open();
  view.hero.dataset.downloadLead = "mac-x86";
  view.open();
  assert.deepEqual(view.order().slice(0, 2), ["mac-x86", "mac-arm"]);
});

test("a visit to the downloads fragment lists the visitor's platform first", () => {
  assert.equal(page({ hash: "#downloads", lead: "windows-x86" }).order()[0], "windows-x86");
});
