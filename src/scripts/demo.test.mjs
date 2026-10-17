import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

const source = readFileSync("src/components/AstraDemo.astro", "utf8");
const { ast } = await parse(source);
const nodes = [];
function visit(node) {
  if (node.name) nodes.push(node);
  for (const child of node.children ?? []) visit(child);
}
visit(ast);
const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));

function harness(language = "en", reducedMotion = false) {
  const timers = new Map();
  const elements = new Map();
  const chips = ["start", "restart", "move"].map((example) => ({
    dataset: { demo: example },
    focused: false,
    attributes: {},
    listeners: new Map(),
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    },
    focus() {
      this.focused = true;
    },
  }));
  for (const node of nodes) {
    const attrs = attributes(node);
    const id = attrs.id || (attrs.class?.includes("demo-exchange") ? "exchange" : undefined);
    if (!id) continue;
    elements.set(id, {
      style: {},
      attributes: { ...attrs },
      listeners: new Map(),
      hidden: Object.hasOwn(attrs, "hidden"),
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      addEventListener(name, listener) {
        this.listeners.set(name, listener);
      },
    });
  }
  elements.get("astra-demo").querySelector = () => elements.get("exchange");
  elements.get("astra-demo").querySelectorAll = () => chips;
  const motion = {
    matches: reducedMotion,
    addEventListener(_name, callback) {
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
  vm.runInContext(`(function(exports, require) { ${translations} })`, context)(table, () => {
    throw new Error("unexpected dependency");
  });
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
  h.chips[1].listeners.get("click")();
  assert.equal(h.timers.size, 1, "a selected example plays on request");
  h.motion.matches = true;
  h.motion.change();
  assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get("demo-response").style.visibility, "visible");
});

test("example chips are keyboard buttons and the composer opens Orbit as a real link", () => {
  const chip = nodes.find((node) => Object.hasOwn(attributes(node), "data-demo"));
  assert.equal(chip.name, "button");
  assert.ok(!chip.attributes.some(({ name }) => name === "tabindex" || name === "disabled"));
  const composer = nodes.find((node) => attributes(node).class === "demo-composer");
  assert.ok(composer, "the conversation needs its composer entry point");
  assert.equal(composer.name, "a");
  assert.equal(attributes(composer).href, "appUrl");
  assert.ok(!nodes.some((node) => node.name === "input"));
  assert.match(source, /data-i18n="demo.composer"/);
});

for (const language of ["en", "pt-BR"]) {
  test(`${language}: approval and rejection finish each example and return focus to its chip`, () => {
    for (const action of ["approve", "reject"]) {
      const h = harness(language, true);
      for (const chip of h.chips) {
        chip.listeners.get("click")();
        const button = h.elements.get(`demo-${action}`);
        assert.ok(button?.listeners.has("click"), `${action} must be a real control`);
        button.listeners.get("click")();
        assert.equal(h.elements.get("demo-preview").hidden, true);
        assert.equal(h.elements.get("demo-result").hidden, false);
        const key = action === "approve" ? `demo.${chip.dataset.demo}.approved` : "demo.rejected";
        assert.equal(h.elements.get("demo-result").textContent, h.strings[key]);
        assert.equal(h.elements.get("exchange").attributes["aria-live"], "polite");
        assert.equal(h.elements.get("exchange").attributes["aria-busy"], "false");
        assert.equal(chip.focused, true);
        chip.listeners.get("click")();
        assert.equal(h.elements.get("demo-preview").hidden, false);
        assert.equal(h.elements.get("demo-result").hidden, true);
      }
    }
  });

  test(`${language}: edit switches morning and evening in place and keeps the whole batch proposed`, () => {
    const h = harness(language, true);
    for (const chip of h.chips) {
      chip.listeners.get("click")();
      const example = chip.dataset.demo;
      const original = h.elements.get("demo-repeat").textContent;
      const edit = h.elements.get("demo-edit");
      assert.ok(edit?.listeners.has("click"), "edit must change the proposal");
      edit.listeners.get("click")();
      const key = `demo.${example}.alternateRepeat`;
      assert.equal(h.elements.get("demo-repeat").textContent, h.strings[key]);
      if (example === "move")
        assert.equal(h.elements.get("demo-second-repeat").textContent, h.strings[key]);
      assert.equal(h.elements.get("demo-preview").attributes["data-state"], "proposed");
      assert.equal(h.elements.get("demo-preview").hidden, false);
      assert.equal(h.elements.get("demo-announcement").textContent, h.strings["demo.edited"]);
      edit.listeners.get("click")();
      assert.equal(h.elements.get("demo-repeat").textContent, original);
      chip.listeners.get("click")();
      assert.equal(h.elements.get("demo-announcement").attributes["data-i18n"], undefined);
    }
  });
}

test("actions during a replay clear its timer before announcing the result", () => {
  const h = harness();
  h.chips[0].listeners.get("click")();
  assert.equal(h.timers.size, 1);
  assert.ok(h.elements.get("demo-approve")?.listeners.has("click"));
  h.elements.get("demo-approve").listeners.get("click")();
  assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get("demo-response").style.visibility, "visible");
  assert.equal(h.elements.get("exchange").attributes["aria-busy"], "false");
});

test("approval lands the accepted habit and edited schedule on Today; rejection never does", () => {
  const h = harness("pt-BR", true);
  const today = h.elements.get("demo-today");
  assert.ok(today, "the conversation must render the Today destination");
  assert.equal(today.hidden, true);
  h.elements.get("demo-edit").listeners.get("click")();
  h.elements.get("demo-approve").listeners.get("click")();
  assert.equal(today.hidden, false);
  assert.equal(h.elements.get("demo-today-habit").textContent, h.strings["demo.start.habit"]);
  assert.equal(
    h.elements.get("demo-today-repeat").textContent,
    h.strings["demo.start.alternateRepeat"],
  );
  h.chips[2].listeners.get("click")();
  assert.equal(today.hidden, true);
  h.elements.get("demo-approve").listeners.get("click")();
  assert.equal(h.elements.get("demo-today-second").hidden, false);
  h.chips[0].listeners.get("click")();
  h.elements.get("demo-reject").listeners.get("click")();
  assert.equal(today.hidden, true);
});
