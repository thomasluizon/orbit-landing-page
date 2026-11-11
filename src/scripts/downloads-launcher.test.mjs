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

function launch(hash = "") {
  const loaded = [];
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
      return { activate: (control) => activated.push(control.name) };
    },
    document: {
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
  return { loaded, activated, listeners, press, toggle, link, icon, elsewhere };
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
