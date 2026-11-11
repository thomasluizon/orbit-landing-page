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
  }
  closest(selector) {
    const parts = selector.split(",").map((part) => part.trim());
    return parts.some((part) => this.selectors.includes(part)) ? this : null;
  }
}

function launch(hash = "", { failing = false } = {}) {
  const loaded = [];
  const page = {
    "downloads-toggle": { attributes: {}, scrolled: [] },
    downloads: { attributes: {} },
  };
  for (const element of Object.values(page)) {
    element.setAttribute = (name, value) => (element.attributes[name] = value);
    element.toggleAttribute = (name, force) => (element.attributes[name] = force);
    element.scrollIntoView = (options) => element.scrolled?.push(options.block);
  }
  const activated = [];
  const listeners = [];
  const toggle = new FakeElement("toggle", ["#downloads-toggle"]);
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
      return { activate: (control) => activated.push(control.name) };
    },
    document: {
      getElementById: (id) => page[id] ?? null,
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
  return { loaded, activated, listeners, press, toggle, link, icon, elsewhere, page };
}

test("the page loads no panel code before a visitor uses a download control", async () => {
  const { loaded, listeners } = launch();
  await flush();
  assert.deepEqual(loaded, []);
  assert.equal(listeners.length, 1);
});

for (const control of ["toggle", "link"]) {
  test(`the first press on the ${control} loads the panel and acts on that press without a second click`, async () => {
    const view = launch();
    const event = view.press(view[control]);
    assert.equal(event.prevented, true);
    await flush();
    assert.deepEqual(view.loaded, ["./downloads-panel"]);
    assert.deepEqual(view.activated, [view[control].name]);
  });
}

test("every later press on either opener reaches activate() through the same listener", async () => {
  const view = launch();
  view.press(view.link);
  await flush();
  for (const target of [view.toggle, view.icon, view.link]) {
    assert.equal(view.press(target).prevented, true);
    await flush();
  }
  assert.deepEqual(view.activated, ["header link", "toggle", "toggle", "header link"]);
  assert.ok(view.loaded.every((path) => path === "./downloads-panel"));
});

test("a second press while the panel code loads does not undo the first", async () => {
  const view = launch();
  assert.equal(view.press(view.toggle).prevented, true);
  assert.equal(view.press(view.icon).prevented, true);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel"]);
  assert.deepEqual(view.activated, ["toggle"]);
  view.press(view.toggle);
  await flush();
  assert.deepEqual(view.activated, ["toggle", "toggle"], "a press after the load acts again");
});

test("a press while the downloads fragment loads the panel does not close the panel it opens", async () => {
  const view = launch("#downloads");
  assert.equal(view.press(view.toggle).prevented, true);
  await flush();
  assert.deepEqual(view.loaded, ["./downloads-panel"]);
  assert.deepEqual(view.activated, []);
});

test("a failed panel load lets the next press try again", async () => {
  const view = launch("", { failing: true });
  view.press(view.toggle);
  view.press(view.toggle);
  await flush();
  assert.equal(view.loaded.length, 1);
  view.press(view.toggle);
  await flush();
  assert.equal(view.loaded.length, 2);
});

test("a press outside the openers keeps its own action and loads nothing", async () => {
  const view = launch();
  const event = view.press(view.elsewhere);
  await flush();
  assert.equal(event.prevented, false);
  assert.deepEqual(view.loaded, []);
  assert.deepEqual(view.activated, []);
});

test("a visit to the downloads fragment loads the panel without a press", async () => {
  const { loaded } = launch("#downloads");
  await flush();
  assert.deepEqual(loaded, ["./downloads-panel"]);
  const other = launch("#features");
  await flush();
  assert.deepEqual(other.loaded, []);
});

for (const control of ["toggle", "link"]) {
  test(`a press on the ${control} still opens the list and brings it into view when the panel code fails to load`, async () => {
    const view = launch("", { failing: true });
    assert.equal(view.press(view[control]).prevented, true);
    await flush();
    assert.deepEqual(view.activated, []);
    assert.deepEqual(view.page.downloads.attributes, { "data-open": true });
    assert.deepEqual(view.page["downloads-toggle"].attributes, { "aria-expanded": "true" });
    assert.deepEqual(view.page["downloads-toggle"].scrolled, ["start"]);
  });
}

test("a visit to the downloads fragment still opens the list when the panel code fails to load", async () => {
  const view = launch("#downloads", { failing: true });
  await flush();
  assert.deepEqual(view.page.downloads.attributes, { "data-open": true });
  assert.deepEqual(view.page["downloads-toggle"].attributes, { "aria-expanded": "true" });
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
