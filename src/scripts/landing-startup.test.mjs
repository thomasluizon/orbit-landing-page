import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const deferred = ["pricing", "faq", "back-to-top", "scroll", "waitlist", "waitlist-section"];
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({
  scheduler = false,
  readyState = "loading",
  page = readFileSync("src/pages/index.astro", "utf8"),
} = {}) {
  const bindings = [];
  const continuations = [];
  const listeners = new Map();
  const observers = [];
  let task = 0;
  const targets = [".hero-device", '[data-section="features"]'].map((selector) => ({
    matches: (value) => value === selector,
  }));
  const document = {
    readyState,
    querySelectorAll: () => targets,
  };
  const window = {
    addEventListener(name, callback, options) {
      assert.equal(options.once, true);
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      continuations.push(callback);
    },
    ...(scheduler && {
      scheduler: {
        yield() {
          assert.equal(this, window.scheduler, "yield keeps its Scheduler receiver");
          return new Promise((resolve) => continuations.push(resolve));
        },
      },
    }),
  };
  const context = vm.createContext({
    window,
    document,
    exports: {},
    IntersectionObserver: class {
      observed = new Set();
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.observed.add(target);
      }
      unobserve(target) {
        this.observed.delete(target);
      }
    },
  });
  const modules = new Map();
  function require(path) {
    if (modules.has(path)) return modules.get(path);
    if (path === "../scripts/task-queue" || path === "./task-queue") {
      const exports = {};
      const code = ts.transpileModule(readFileSync("src/scripts/task-queue.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
      modules.set(path, exports);
      return exports;
    }
    bindings.push({ name: path.split("/").at(-1), task });
    const exports = {};
    modules.set(path, exports);
    return exports;
  }
  context.require = require;
  const source = page.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)[1];
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return {
    bindings,
    continuations,
    load: () => {
      document.readyState = "complete";
      for (const callback of listeners.get("load") ?? []) callback();
      listeners.delete("load");
    },
    intersect(index) {
      for (const observer of observers)
        observer.callback(
          [...observer.observed].map((target) => ({
            target,
            isIntersecting: target === targets[index],
          })),
        );
    },
    async drain() {
      for (let count = 0; count < 100; count++) {
        await flush();
        if (!continuations.length) return;
        task++;
        continuations.shift()();
      }
      assert.fail("startup tasks must finish");
    },
  };
}

for (const [opening, closing] of [
  ["<SCRIPT>", "</SCRIPT>"],
  ["<script>", "</script \n>"],
  ['<ScRiPt data-startup="true">', "</sCrIpT\t>"],
]) {
  test(`startup extraction accepts ${opening} and ${closing.trim()}`, async () => {
    const page = readFileSync("src/pages/index.astro", "utf8")
      .replace("<script>", opening)
      .replace("</script>", closing);
    const h = harness({ page });
    assert.deepEqual(h.bindings, [{ name: "i18n", task: 0 }]);
    h.intersect(1);
    h.load();
    await h.drain();
    for (const name of [...deferred, "product-examples", "product-metrics"])
      assert.ok(h.bindings.some((binding) => binding.name === name));
    assert.ok(!h.bindings.some(({ name }) => name === "demo"));
  });
}

for (const scheduler of [false, true]) {
  for (const readyState of ["loading", "complete"]) {
    test(`page import reserves synchronous binding for the first viewport (scheduler: ${scheduler}, document: ${readyState})`, async () => {
      const h = harness({ scheduler, readyState });
      assert.deepEqual(h.bindings, [{ name: "i18n", task: 0 }]);
      await flush();
      assert.deepEqual(h.bindings, [{ name: "i18n", task: 0 }]);
      if (readyState === "loading") assert.equal(h.continuations.length, 0);
      h.load();
      await flush();
      assert.deepEqual(h.bindings, [{ name: "i18n", task: 0 }]);
      await h.drain();
      assert.deepEqual(
        h.bindings.slice(1).map(({ name }) => name),
        deferred,
      );
      assert.equal(new Set(h.bindings.map(({ task }) => task)).size, deferred.length + 1);
    });
  }

  test(`preview intersections wait for load and use separate tasks (scheduler: ${scheduler})`, async () => {
    const h = harness({ scheduler });
    h.intersect(0);
    await flush();
    assert.deepEqual(h.bindings, [{ name: "i18n", task: 0 }]);
    assert.equal(h.continuations.length, 0);
    h.load();
    await h.drain();
    const previews = h.bindings.filter(({ name }) => ["product-examples", "demo"].includes(name));
    assert.deepEqual(
      previews.map(({ name }) => name),
      ["product-examples", "demo"],
    );
    assert.ok(!h.bindings.some(({ name }) => name === "product-metrics"));
    assert.ok(previews.every(({ task }) => task > 0));
    assert.notEqual(previews[0].task, previews[1].task);
    for (const name of deferred) assert.ok(h.bindings.some((binding) => binding.name === name));
  });

  test(`a direct visit below the hero binds feature controls without loading the demo (scheduler: ${scheduler})`, async () => {
    const h = harness({ scheduler });
    h.intersect(1);
    h.load();
    await h.drain();
    assert.ok(h.bindings.some(({ name }) => name === "product-examples"));
    assert.ok(h.bindings.some(({ name }) => name === "product-metrics"));
    assert.ok(!h.bindings.some(({ name }) => name === "demo"));
  });
}
