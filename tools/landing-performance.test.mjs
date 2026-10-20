import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = (path) =>
  process.env.LANDING_BASE_REVISION
    ? execFileSync("git", ["show", `${process.env.LANDING_BASE_REVISION}:${path}`], {
        encoding: "utf8",
      })
    : readFileSync(path, "utf8");
const code = (path) =>
  ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

test("carousel startup and selection never measure after changing slide styles", () => {
  let dirty = false;
  let reads = 0;
  const mutate = () => {
    dirty = true;
  };
  const slide = () => ({
    set inert(value) {
      mutate(value);
    },
    setAttribute: mutate,
    addEventListener() {},
  });
  const slides = [slide(), slide()];
  const segments = [slide(), slide()];
  const carousel = {
    get clientWidth() {
      reads++;
      assert.equal(dirty, false, "slide mutation forced synchronous layout");
      return 200;
    },
    setAttribute: mutate,
    addEventListener() {},
    contains: () => false,
    scrollTo() {},
  };
  const exports = {};
  vm.runInNewContext(code("src/scripts/hero-carousel.ts"), {
    exports,
    document: {
      activeElement: null,
      getElementById: () => ({
        querySelector: () => carousel,
        querySelectorAll: (selector) => (selector === "[data-phone-slide]" ? slides : segments),
      }),
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    ResizeObserver: class {
      observe() {}
    },
  });
  assert.equal(reads, 0, "the initial chat screen needs no width measurement");
  dirty = false;
  exports.updateHeroCarousel(0.9);
  assert.equal(reads, 1);
});

test("phone resize consumes observed width without remeasuring a styled layout", () => {
  let dirty = false;
  let callback;
  const screen = {
    querySelector: () => ({
      get offsetWidth() {
        assert.equal(dirty, false, "resize remeasured after the scale write");
        return 390;
      },
    }),
    getBoundingClientRect: () => ({ width: 200.5 }),
    style: {
      setProperty() {
        dirty = true;
      },
    },
  };
  vm.runInNewContext(code("src/scripts/phone-screen.ts"), {
    exports: {},
    document: { querySelector: () => screen },
    ResizeObserver: class {
      constructor(fn) {
        callback = fn;
      }
      observe() {}
    },
  });
  callback([{ contentRect: { width: 240.5 } }]);
});

test("hero controls cannot evaluate or measure below-the-fold metrics", () => {
  const examples = source("src/scripts/product-examples.ts");
  assert.doesNotMatch(
    examples,
    /offset(?:Left|Top|Width|Height)|client(?:Width|Height)|getBoundingClientRect/,
  );
  const page = source("src/pages/index.astro");
  assert.match(
    page,
    /matches\('\[data-section="features"\]'\)[\s\S]*import\("\.\.\/scripts\/product-metrics"\)/,
  );
});

test("offscreen calendar and metric interiors reserve their exact grid geometry", () => {
  const css = source("src/styles/landing.css");
  assert.match(
    css,
    /\.example-app \.orbit-month-grid:not\(:has\(\[data-composition-folded\]\)\)\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-block-size:\s*auto 280px;/,
  );
  assert.match(
    css,
    /\.example-app \.metric-bars\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-block-size:\s*auto 96px;/,
  );
  assert.equal(16 + 6 * 44, 280);
  assert.doesNotMatch(
    css,
    /(?:#features|#pricing|\.hero-stage|\.hero-pin-range)\s*\{[^}]*content-visibility/,
  );
});
