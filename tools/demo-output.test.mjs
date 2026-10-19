import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

const source = readFileSync("dist/index.html", "utf8");
const { ast } = await parse(source);
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const nodes = descendants(ast);
const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
function harness(language = "en", threadHeight = 415) {
  const events = new Map();
  const observers = [];
  const elements = new Map();
  function element(node, parent = null) {
    const attrs = attributes(node);
    let text = node.type === "text" ? node.value : "";
    const result = {
      name: node.name,
      parent,
      hidden: Object.hasOwn(attrs, "hidden"),
      attributes: { ...attrs },
      listeners: new Map(),
      dataset: Object.fromEntries(
        Object.entries(attrs)
          .filter(([name]) => name.startsWith("data-"))
          .map(([name, value]) => [
            name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ]),
      ),
      value: "",
      focused: false,
      get textContent() {
        return text + this.children.map((child) => child.textContent).join("");
      },
      set textContent(value) {
        text = value;
        this.children = [];
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      toggleAttribute(name, on) {
        if (name === "hidden") this.hidden = on;
      },
      addEventListener(name, fn) {
        this.listeners.set(name, fn);
      },
      focus() {
        this.focused = true;
      },
      scrollIntoView() {},
      matches(selector) {
        for (const [, excluded] of selector.matchAll(/:not\(([^)]+)\)/g)) {
          if (this.matches(excluded)) return false;
        }
        const simple = selector.replace(/:not\([^)]+\)/g, "");
        if (simple.startsWith("."))
          return (this.attributes.class ?? "").split(/\s+/).includes(simple.slice(1));
        const [, name, value] = simple.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/) ?? [];
        return (
          name !== undefined &&
          Object.hasOwn(this.attributes, name) &&
          (value === undefined || this.attributes[name] === value)
        );
      },
      querySelectorAll(selector) {
        return this.children.flatMap((child) =>
          descendants(child).filter((candidate) => candidate.matches(selector)),
        );
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
      },
      closest(selector) {
        return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
      },
      fire(event) {
        this.listeners.get(event)?.({ preventDefault() {} });
      },
    };
    result.children = (node.children ?? []).map((child) => element(child, result));
    if (attrs.id) elements.set(attrs.id, result);
    return result;
  }
  const document = element(ast);
  document.getElementById = (id) => elements.get(id) ?? null;
  const chips = elements.get("astra-demo").querySelectorAll("[data-demo]");
  const exchange = elements.get("astra-demo").querySelector(".demo-exchange");
  const thread = elements.get("demo-preview").closest(".demo-thread");
  thread.clientHeight = threadHeight;
  thread.scrollHeight = threadHeight;
  let scrollTop = 0;
  Object.defineProperty(thread, "scrollTop", {
    get: () => scrollTop,
    set(value) {
      scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
    },
  });
  const context = vm.createContext({
    URL,
    ResizeObserver: class {
      targets = new Set();
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
    },
    exports: {},
    document,
    window: { addEventListener: (name, fn) => events.set(name, fn) },
  });
  const modules = new Map();
  function require(path) {
    if (path === "./i18n") return { getLang: () => language };
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(readFileSync(`src/scripts/${path}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInContext(`(function(exports,require){${code}\n})`, context)(exports, require);
    modules.set(path, exports);
    return exports;
  }
  const translations = require("../i18n/translations").translations;
  function translate() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = translations[language][element.attributes["data-i18n"]];
    });
    document.querySelectorAll("[data-copy-en]").forEach((element) => {
      element.textContent = language === "en" ? element.dataset.copyEn : element.dataset.copyPt;
    });
  }
  translate();
  require("./demo");
  return {
    elements,
    chips,
    phoneRows: () => elements.get("phone-today").querySelectorAll("[data-habit-toggle]"),
    visibleRows: () =>
      elements
        .get("phone-today")
        .querySelectorAll("[data-habit-toggle]")
        .filter((row) => !row.hidden),
    events,
    exchange,
    thread,
    observers,
    resize(target) {
      for (const observer of observers) {
        if (observer.targets.has(target)) observer.callback();
      }
    },
    get: (id) => elements.get(id),
    strings: translations[language],
    landing: require("../i18n/translations").landingCopy[language],
    switchLanguage(value) {
      language = value;
      translate();
      events.get("orbit:language-changed")();
    },
  };
}
test("exchange growth re-reveals the actions above the chip row at every phone scale", () => {
  for (const language of ["en", "pt-BR"]) {
    for (const [width, height] of [
      [320, 568],
      [360, 740],
      [1280, 720],
      [1352, 762],
      [1440, 900],
      [1920, 1080],
    ]) {
      const top = width <= 640 ? 96 : 112;
      const deviceWidth = Math.min(330, ((height - top - 64) * 9) / 19.5, width - 64);
      const scale = (deviceWidth - 8) / 330;
      const target = 44 / scale;
      const composerHeight = Math.max(48, target);
      const chipsHeight = Math.max(44, target);
      const threadHeight = 715 - 40 - 56 - (12 + chipsHeight + 8 + composerHeight + 24);
      const h = harness(language, threadHeight);
      const observed = h.observers.flatMap((observer) => [...observer.targets]);
      assert.ok(observed.includes(h.get("demo-preview")));
      assert.ok(observed.includes(h.thread));
      assert.ok(observed.includes(h.exchange), "request and reply growth must trigger reveal");
      for (const contentHeight of [600, 760, 940]) {
        h.thread.scrollHeight = contentHeight;
        h.resize(h.exchange);
        assert.equal(h.thread.scrollTop, contentHeight - threadHeight);
        const actionReachBottom = (contentHeight - h.thread.scrollTop) * scale;
        const chipsTop = (threadHeight + 12) * scale;
        assert.ok(
          actionReachBottom < chipsTop,
          `${language} ${width}x${height}: actions clear chips`,
        );
      }
      h.get("demo-edit").fire("click");
      const editorScrollTop = h.thread.scrollTop;
      h.thread.scrollHeight += 200;
      h.resize(h.exchange);
      assert.equal(h.thread.scrollTop, editorScrollTop, "editing retains its scroll position");
      assert.equal(h.get("demo-edit-name").focused, true);
    }
  }
});
for (const language of ["en", "pt-BR"]) {
  test(`${language}: typed requests stay local, can be edited, and approve into Today with a supported app title`, () => {
    const h = harness(language);
    h.get("demo-input").value =
      language === "en" ? "I want to read at night." : "Quero ler à noite.";
    h.get("demo-composer").fire("submit");
    assert.equal(
      h.get("demo-request").textContent,
      language === "en" ? "I want to read at night." : "Quero ler à noite.",
    );
    assert.equal(
      h.get("demo-habit").textContent,
      language === "en" ? "read at night" : "ler à noite",
    );
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.start.alternateRepeat"]);
    assert.equal(h.get("demo-continue").hidden, true);
    h.get("demo-edit").fire("click");
    assert.equal(h.get("demo-edit-form").hidden, false);
    h.get("demo-edit-name").value = "Read & reflect";
    h.get("demo-edit-schedule").value = "afternoon";
    h.get("demo-edit-form").fire("submit");
    assert.equal(h.get("demo-habit").textContent, "Read & reflect");
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.afternoon"]);
    h.get("demo-approve").fire("click");
    assert.equal(h.get("demo-preview").hidden, true);
    assert.equal(h.get("demo-today").hidden, false);
    assert.equal(h.get("demo-today-habit").textContent, "Read & reflect");
    assert.equal(h.get("demo-today-repeat").textContent, h.strings["demo.afternoon"]);
    const rows = h.visibleRows();
    assert.deepEqual(
      rows.map((row) => row.querySelector(".habit-name").textContent.trim()),
      ["product.stretch", "product.walk", "product.read", "product.run"]
        .map((key) => h.landing[key])
        .concat("Read & reflect"),
    );
    assert.equal(
      rows.at(-1).querySelector(".product-caption").textContent.trim(),
      h.strings["demo.afternoon"],
    );
    assert.equal(rows.at(-1).attributes["aria-pressed"], "false");
    const link = new URL(h.get("demo-continue-link").href);
    assert.equal(link.origin, new URL(h.get("demo-continue-link").dataset.appUrl).origin);
    assert.equal(link.pathname, "/habits/new");
    assert.deepEqual([...link.searchParams], [["title", "Read & reflect"]]);
    assert.equal(h.get("demo-continue").hidden, false);
    const otherLanguage = language === "en" ? "pt-BR" : "en";
    h.switchLanguage(otherLanguage);
    const translated = harness(otherLanguage).strings;
    assert.equal(rows.at(-1).querySelector(".habit-name").textContent, "Read & reflect");
    assert.equal(
      rows.at(-1).querySelector(".product-caption").textContent,
      translated["demo.afternoon"],
    );
    assert.doesNotMatch(
      readFileSync("src/scripts/demo.ts", "utf8"),
      /fetch\(|innerHTML|setTimeout/,
    );
  });
  test(`${language}: examples propose the selected habits and rejection adds nothing`, () => {
    const h = harness(language);
    const originalRows = h.visibleRows();
    for (const [index, name] of ["start", "restart", "move"].entries()) {
      h.chips[index].fire("click");
      assert.equal(h.get("demo-request").textContent, h.strings[`demo.${name}.request`]);
      assert.equal(h.get("demo-second").hidden, name !== "move");
      h.get("demo-reject").fire("click");
      assert.equal(h.get("demo-result").textContent, h.strings["demo.rejected"]);
      assert.equal(h.get("demo-today").hidden, true);
      assert.deepEqual(h.visibleRows(), originalRows);
      assert.equal(h.get("demo-continue").hidden, true);
    }
  });
  test(`${language}: single approvals replace the first sample and retain the other rows in order`, () => {
    const h = harness(language);
    const samples = h.visibleRows();
    assert.equal(samples.length, 5);
    for (const index of [0, 1]) {
      const example = index === 0 ? "start" : "restart";
      h.chips[index].fire("click");
      h.get("demo-approve").fire("click");
      const rows = h.visibleRows();
      assert.deepEqual(rows.slice(0, -1), samples.slice(1));
      assert.equal(
        rows.at(-1).querySelector(".habit-name").textContent.trim(),
        h.strings[`demo.${example}.habit`],
      );
      assert.equal(
        rows.at(-1).querySelector(".product-caption").textContent.trim(),
        h.strings[`demo.${example}.repeat`],
      );
      assert.equal(rows.at(-1).attributes.class, samples[0].attributes.class);
      assert.ok(rows.at(-1).querySelector(".habit-emoji"));
      assert.ok(rows.at(-1).querySelector(".status-ring"));
    }
  });
  test(`${language}: edited batches replace all samples and resets reuse the approved rows`, () => {
    const h = harness(language);
    const samples = h.visibleRows();
    h.chips[2].fire("click");
    h.get("demo-edit").fire("click");
    h.get("demo-edit-name").value = "Evening walk";
    h.get("demo-edit-schedule").value = "evening";
    h.get("demo-edit-form").fire("submit");
    h.get("demo-approve").fire("click");
    const approved = h.visibleRows();
    assert.deepEqual(
      approved.map((row) => row.querySelector(".habit-name").textContent.trim()),
      ["Evening walk", h.strings["demo.move.secondHabit"]],
    );
    assert.ok(samples.every((row) => row.hidden));
    for (const row of approved) {
      assert.equal(
        row.querySelector(".product-caption").textContent.trim(),
        h.strings["demo.start.alternateRepeat"],
      );
    }
    const count = h.phoneRows().length;
    h.chips[0].fire("click");
    h.get("demo-reject").fire("click");
    assert.deepEqual(h.visibleRows(), approved, "rejecting retains the accepted batch");
    h.chips[2].fire("click");
    h.get("demo-approve").fire("click");
    assert.deepEqual(h.visibleRows(), approved, "approving again reuses both rows");
    assert.equal(h.phoneRows().length, count);
    assert.equal(
      approved[0].querySelector(".habit-name").textContent.trim(),
      h.strings["demo.move.habit"],
    );
    h.chips[0].fire("click");
    h.get("demo-approve").fire("click");
    assert.deepEqual(h.visibleRows(), [...samples.slice(1), approved[0]]);
    assert.equal(approved[1].hidden, true);
    assert.equal(h.phoneRows().length, count);
  });
}
test("empty submissions keep the current proposal and user text remains literal", () => {
  const h = harness();
  h.get("demo-input").value = "   ";
  h.get("demo-composer").fire("submit");
  assert.equal(h.get("demo-request").textContent.trim(), h.strings["demo.start.request"]);
  h.get("demo-input").value = '<img src=x onerror="alert(1)">';
  h.get("demo-composer").fire("submit");
  assert.equal(h.get("demo-habit").textContent, '<img src=x onerror="alert(1)">');
  h.switchLanguage("pt-BR");
  assert.equal(h.get("demo-habit").textContent, '<img src=x onerror="alert(1)">');
});
test("the composer is an editable form with a submit action", () => {
  const composer = nodes.find((node) => attributes(node).id === "demo-composer");
  assert.equal(composer.name, "form");
  assert.ok(nodes.some((node) => node.name === "input" && attributes(node).id === "demo-input"));
  assert.ok(nodes.some((node) => node.name === "button" && attributes(node).type === "submit"));
  assert.doesNotMatch(source, /demo-playback/);
});
