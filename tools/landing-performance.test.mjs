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
  const demo = source("src/scripts/demo.ts");
  assert.doesNotMatch(
    demo,
    /offset(?:Left|Top|Width|Height)|client(?:Width|Height)|getBoundingClientRect/,
  );
  const page = source("src/pages/index.astro");
  assert.match(
    page,
    /matches\('\[data-section="features"\]'\)[\s\S]*import\("\.\.\/scripts\/product-metrics"\)/,
  );
});

test("the scrolling week row leaves room for the whole focus ring of its edge days", () => {
  const css = source("src/styles/landing.css");
  const ring = css.match(
    /\.week-days \.day-cell:focus-visible\s*\{[^}]*outline:\s*(\d+)px solid[^}]*outline-offset:\s*(-?\d+)px;/,
  );
  assert.ok(ring, "the day focus ring rule");
  const extension = Math.max(0, Number(ring[1]) + Number(ring[2]));
  const week = css.match(/\.week-days\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(
    week,
    /overflow-x:\s*auto;/,
    "the row scrolls, so it clips what lies outside its padding box",
  );
  const padding = Number(week.match(/padding:\s*(\d+)px;/)?.[1] ?? 0);
  assert.ok(padding >= extension, `padding ${padding}px is less than the ${extension}px ring`);
});

test("the selected day panel reserves its caption and two event rows, the most demoEvents returns", () => {
  const css = source("src/styles/landing.css");
  assert.match(css, /\.calendar-day-events\s*\{[^}]*gap:\s*8px;/);
  assert.match(
    css,
    /\.calendar-day-card \.calendar-day-events\s*\{[^}]*align-content:\s*start;[^}]*min-block-size:\s*calc\(var\(--fs-xs\) \* var\(--lh-body\) \+ 2 \* var\(--fs-sm\) \* var\(--lh-meta\) \+ 16px\);/,
  );
  const demoEvents = source("src/config/product-examples.ts").match(
    /export function demoEvents[\s\S]*?\n\}/,
  )[0];
  assert.equal(demoEvents.match(/events\.push\(/g).length, 2);
});

test("offscreen calendar and metric interiors reserve their exact grid geometry", () => {
  const css = source("src/styles/landing.css");
  assert.match(
    css,
    /\.example-app \.orbit-month-grid:not\(:has\(\[data-composition-folded\]\)\)\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-block-size:\s*auto 288px;/,
  );
  assert.match(
    css,
    /\.example-app \.metric-bars\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-block-size:\s*auto 96px;/,
  );
  assert.match(
    css,
    /\.orbit-month-grid\s*\{[^}]*grid-template-rows:\s*24px;[^}]*grid-auto-rows:\s*44px;/,
  );
  assert.equal(24 + 6 * 44, 288);
  assert.doesNotMatch(
    css,
    /(?:#features|#pricing|\.hero-stage|\.hero-pin-range)\s*\{[^}]*content-visibility/,
  );
});
