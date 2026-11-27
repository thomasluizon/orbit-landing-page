import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

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
