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

function launch(hash = "") {
  const loaded = [];
  const opener = (name) => ({
    name,
    clicks: 0,
    listeners: [],
    addEventListener(type, listener, options) {
      assert.equal(type, "click");
      this.listeners.push({ listener, once: options?.once === true });
    },
    click() {
      this.clicks += 1;
      this.listeners = this.listeners.filter(({ once }) => !once);
    },
    press() {
      const event = { prevented: false, preventDefault: () => (event.prevented = true) };
      for (const { listener } of [...this.listeners]) listener(event);
      this.listeners = this.listeners.filter(({ once }) => !once);
      return event;
    },
  });
  const controls = [opener("toggle"), opener("header link")];
  vm.runInNewContext(source, {
    exports: {},
    require: (path) => {
      loaded.push(path);
      return {};
    },
    document: {
      querySelectorAll: (selector) => {
        assert.equal(selector, '#downloads-toggle, a[href="#downloads"]');
        return controls;
      },
    },
    location: { hash },
  });
  return { loaded, controls };
}

test("the page loads no panel code before a visitor uses a download control", async () => {
  const { loaded, controls } = launch();
  await flush();
  assert.deepEqual(loaded, []);
  assert.deepEqual(
    controls.map(({ listeners }) => listeners.length),
    [1, 1],
  );
});

for (const [index, name] of ["toggle", "header link"].entries()) {
  test(`the first press on the ${name} loads the panel and then repeats the press`, async () => {
    const { loaded, controls } = launch();
    const event = controls[index].press();
    assert.equal(event.prevented, true);
    assert.equal(controls[index].clicks, 0);
    await flush();
    assert.deepEqual(loaded, ["./downloads-panel"]);
    assert.equal(controls[index].clicks, 1);
    assert.equal(controls[index].listeners.length, 0);
  });
}

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
