import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

function harness(language = "en", reducedMotion = false) {
  const timers = new Map();
  const elements = new Map();
  const chips = ["start", "restart", "move"].map((example) => ({
    dataset: { demo: example },
    attributes: {},
    listeners: new Map(),
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    },
  }));
  for (const id of [
    "astra-demo",
    "demo-response",
    "demo-second",
    "demo-request",
    "demo-reply",
    "demo-habit",
    "demo-repeat",
    "exchange",
  ]) {
    elements.set(id, {
      style: {},
      attributes: {},
      hidden: false,
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    });
  }
  elements.get("astra-demo").querySelector = () => elements.get("exchange");
  elements.get("astra-demo").querySelectorAll = () => chips;
  const motion = {
    matches: reducedMotion,
    addEventListener(name, callback) {
      this.change = callback;
    },
  };
  const context = vm.createContext({
    document: { getElementById: (id) => elements.get(id) },
    window: {
      matchMedia: () => motion,
      setTimeout(callback) {
        timers.set(timers.size + 1, callback);
        return timers.size;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  });
  const translations = ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const table = {};
  vm.runInContext(`(function(exports, require) { ${translations} })`, context)(table, () => ({
    pricesFor: () => ({}),
  }));
  const code = ts.transpileModule(readFileSync("src/scripts/demo.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInContext(`(function(exports, require) { ${code} })`, context)({}, (path) =>
    path.endsWith("translations") ? table : { getLang: () => language },
  );
  return { elements, chips, timers, motion, strings: table.translations[language] };
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: every example plays its real request and preview, with one batch for both habits`, () => {
    const h = harness(language);
    for (const chip of h.chips) {
      chip.listeners.get("click")();
      const example = chip.dataset.demo;
      assert.equal(h.elements.get("exchange").attributes["aria-busy"], "true");
      assert.equal(h.elements.get("demo-response").style.visibility, "hidden");
      for (const field of ["request", "reply", "habit", "repeat"]) {
        assert.equal(
          h.elements.get(`demo-${field}`).textContent,
          h.strings[`demo.${example}.${field}`],
        );
        assert.equal(
          h.elements.get(`demo-${field}`).attributes["data-i18n"],
          `demo.${example}.${field}`,
        );
      }
      assert.equal(h.timers.size, 1, "a new request cancels the previous replay");
      for (const callback of h.timers.values()) callback();
      h.timers.clear();
      assert.equal(h.elements.get("demo-response").style.visibility, "visible");
      assert.equal(h.elements.get("exchange").attributes["aria-busy"], "false");
      assert.equal(h.elements.get("demo-second").hidden, example !== "move");
      assert.deepEqual(
        h.chips.map((target) => target.attributes["aria-pressed"]),
        h.chips.map((target) => String(target === chip)),
      );
    }
  });

  test(`${language}: reduced motion shows the first result and every chosen result immediately`, () => {
    const h = harness(language, true);
    assert.equal(h.timers.size, 0);
    assert.equal(h.elements.get("demo-response").style.visibility, "visible");
    for (const chip of h.chips) {
      chip.listeners.get("click")();
      assert.equal(h.timers.size, 0);
      assert.equal(h.elements.get("exchange").attributes["aria-busy"], "false");
      assert.equal(h.elements.get("demo-response").style.visibility, "visible");
    }
  });
}

test("changing the motion preference finishes an in-flight replay", () => {
  const h = harness();
  assert.equal(h.timers.size, 1, "the first example plays on load");
  h.motion.matches = true;
  h.motion.change();
  assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get("demo-response").style.visibility, "visible");
});

test("example choices use native keyboard buttons and the visual preview has no false controls", async () => {
  const { ast } = await parse(readFileSync("src/components/AstraDemo.astro", "utf8"));
  const buttons = [];
  function visit(node) {
    if (node.name === "button") buttons.push(node);
    for (const child of node.children ?? []) visit(child);
  }
  visit(ast);
  assert.equal(buttons.length, 1, "the mapped examples share one native button template");
  assert.ok(buttons[0].attributes.some(({ name }) => name === "data-demo"));
  assert.ok(!buttons[0].attributes.some(({ name }) => name === "tabindex" || name === "disabled"));
  assert.match(
    readFileSync("src/components/AstraDemo.astro", "utf8"),
    /demo-preview-actions" aria-hidden="true"/,
  );
});
