import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
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
    document: { querySelectorAll: () => [screen] },
    ResizeObserver: class {
      constructor(fn) {
        callback = fn;
      }
      observe() {}
    },
  });
  callback([{ contentRect: { width: 240.5 } }]);
});
