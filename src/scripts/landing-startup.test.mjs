import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { scriptsFrom } from "./html.test-helper.mjs";

const deferred = ["pricing", "faq", "back-to-top", "scroll", "waitlist", "waitlist-section"];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const firstViewport = [
  { name: "demo-clock", task: 0 },
  { name: "i18n", task: 0 },
];

function harness({
  scheduler = false,
  readyState = "loading",
  page = readFileSync("src/pages/index.astro", "utf8"),
} = {}) {
  const bindings = [];
  const mounts = [];
  const continuations = [];
  const listeners = new Map();
  const observers = [];
  let task = 0;
  const targets = [".hero-device", '[data-section="features"]', "[data-week-card]"].map(
    (selector) => ({
      selector,
      matches: (value) => value === selector,
    }),
  );
  const document = {
    readyState,
    querySelectorAll: (selectors) => {
      const requested = selectors.split(",").map((selector) => selector.trim());
      return targets.filter(({ selector }) => requested.includes(selector));
    },
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
      disconnect() {
        this.observed.clear();
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
    const exports = {
      mountWeek: (target) => mounts.push({ name: "week", target }),
    };
    modules.set(path, exports);
    return exports;
  }
  context.require = require;
  const source = scriptsFrom(page)[0].body;
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return {
    bindings,
    mounts,
    targets,
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
  ['<ScRiPt data-startup="true">', "</sCrIpT\t\n bar>"],
  ["<script>", "</script/foo>"],
  ["<script>", "</script/ >"],
]) {
  test(`startup extraction accepts ${opening} and ${closing.trim()}`, async () => {
    const page = readFileSync("src/pages/index.astro", "utf8")
      .replace("<script>", opening)
      .replace("</script>", closing);
    const h = harness({ page });
    assert.deepEqual(h.bindings, firstViewport);
    h.intersect(1);
    h.load();
    await h.drain();
    for (const name of [...deferred, "product-metrics", "demo-views"])
      assert.ok(h.bindings.some((binding) => binding.name === name));
    assert.ok(!h.bindings.some(({ name }) => name === "demo"));
  });
}

for (const scheduler of [false, true]) {
  for (const readyState of ["loading", "complete"]) {
    test(`page import reserves synchronous binding for the first viewport (scheduler: ${scheduler}, document: ${readyState})`, async () => {
      const h = harness({ scheduler, readyState });
      assert.deepEqual(h.bindings, firstViewport);
      await flush();
      assert.deepEqual(h.bindings, firstViewport);
      if (readyState === "loading") assert.equal(h.continuations.length, 0);
      h.load();
      await flush();
      assert.deepEqual(h.bindings, firstViewport);
      await h.drain();
      assert.deepEqual(
        h.bindings.slice(firstViewport.length).map(({ name }) => name),
        deferred,
      );
      assert.equal(new Set(h.bindings.map(({ task }) => task)).size, deferred.length + 1);
    });
  }

  test(`preview intersections wait for load and use separate tasks (scheduler: ${scheduler})`, async () => {
    const h = harness({ scheduler });
    h.intersect(0);
    h.intersect(1);
    await flush();
    assert.deepEqual(h.bindings, firstViewport);
    assert.equal(h.continuations.length, 0);
    h.load();
    await h.drain();
    const previews = ["demo", "product-metrics", "demo-views"].map((name) =>
      h.bindings.find((binding) => binding.name === name),
    );
    assert.ok(previews.every((preview) => preview?.task > 0));
    assert.equal(new Set(previews.map(({ task }) => task)).size, previews.length);
    for (const name of deferred) assert.ok(h.bindings.some((binding) => binding.name === name));
  });

  test(`the phone preview loads the demo and nothing from the features (scheduler: ${scheduler})`, async () => {
    const h = harness({ scheduler });
    h.intersect(0);
    h.load();
    await h.drain();
    const names = h.bindings.map(({ name }) => name);
    assert.ok(names.includes("demo"));
    for (const name of ["product-metrics", ...demoViewModules])
      assert.ok(!names.includes(name), name);
  });

  test(`a direct visit below the hero binds feature controls without loading the demo (scheduler: ${scheduler})`, async () => {
    const h = harness({ scheduler });
    h.intersect(1);
    h.load();
    await h.drain();
    assert.ok(h.bindings.some(({ name }) => name === "product-metrics"));
    assert.ok(h.bindings.some(({ name }) => name === "demo-views"));
    assert.ok(!h.bindings.some(({ name }) => name === "demo"));
  });
}

test("the hero week card loads its renderer when it comes into view, without waiting for load", async () => {
  const h = harness();
  h.intersect(2);
  await flush();
  assert.deepEqual(
    h.bindings.map(({ name }) => name),
    [...firstViewport.map(({ name }) => name), "week"],
  );
  assert.deepEqual(h.mounts, [{ name: "week", target: h.targets[2] }]);
});

test("the calendar and the chart labels load only when the features come near", async () => {
  const h = harness();
  h.load();
  await h.drain();
  const names = () => h.bindings.map(({ name }) => name);
  for (const name of demoViewModules) assert.ok(!names().includes(name), name);
  h.intersect(1);
  await h.drain();
  assert.ok(names().indexOf("demo-views") > names().indexOf("product-metrics"));
  assert.deepEqual(h.mounts, [], "the week card mounts only when it comes into view");
});

test("the hero binds the download target with its own first-viewport script, not after load", () => {
  const hero = scriptsFrom(readFileSync("src/components/Hero.astro", "utf8"));
  assert.equal(hero.length, 1);
  assert.match(hero[0].body, /import "\.\.\/scripts\/desktop-downloads";/);
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /desktop-downloads/);
});

const demoViewModules = ["demo-views", "calendar", "calendar-view", "week"];

function moduleFile(from, specifier) {
  const path = join(dirname(from), specifier);
  return [`${path}.ts`, path].find((candidate) => existsSync(candidate));
}

function importsOf(file, code, { dynamic }) {
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      !node.importClause?.isTypeOnly
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      dynamic &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, code, ts.ScriptTarget.ES2022));
  return specifiers
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => moduleFile(file, specifier))
    .filter(Boolean);
}

function startupModules() {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    importsOf(file, readFileSync(file, "utf8"), { dynamic: true }).forEach(visit);
  };
  const page = "src/pages/index.astro";
  for (const file of [
    page,
    "src/layouts/Layout.astro",
    "src/components/Hero.astro",
    "src/components/PillButton.astro",
  ]) {
    for (const { body } of scriptsFrom(readFileSync(file, "utf8"))) {
      importsOf(file, body, { dynamic: file !== page }).forEach(visit);
    }
  }
  return [...seen].map((file) => basename(file).replace(/\.ts$/, ""));
}

test("the startup scripts never import the deferred demo views, even dynamically", () => {
  const modules = startupModules();
  assert.ok(modules.includes("demo-clock"), modules.join(", "));
  for (const name of demoViewModules)
    assert.ok(!modules.includes(name), `${name} in ${modules.join(", ")}`);
});

test("the deferred views hide their build dates only when scripts run", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /@media \(scripting: enabled\) \{\s*\[data-clock-pending\]\s*:is\([^)]*\[data-week-days\][^)]*\[data-calendar-grid\][^)]*\)\s*\{\s*visibility: hidden;/,
  );
  assert.doesNotMatch(
    css.replace(/@media \(scripting: enabled\) \{[\s\S]*?\n\}/g, ""),
    /data-clock-pending/,
  );
});
