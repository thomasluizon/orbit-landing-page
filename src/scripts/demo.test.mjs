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
function harness(language = "en", threadHeight = 415) {
  const events = new Map();
  const observers = [];
  const element = (attrs = {}) => ({
    hidden: Object.hasOwn(attrs, "hidden"),
    attributes: { ...attrs },
    listeners: new Map(),
    dataset: {},
    textContent: "",
    value: "",
    focused: false,
    setAttribute(name, value) {
      this.attributes[name] = value;
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
    closest() {
      return null;
    },
    fire(event) {
      this.listeners.get(event)?.({ preventDefault() {} });
    },
  });
  const elements = new Map(
    nodes
      .filter((node) => attributes(node).id)
      .map((node) => [attributes(node).id, element(attributes(node))]),
  );
  const chips = ["start", "restart", "move"].map((name) =>
    Object.assign(element(), { dataset: { demo: name } }),
  );
  elements.get("astra-demo").querySelectorAll = () => chips;
  const exchange = element();
  let scrollTop = 0;
  const thread = {
    clientHeight: threadHeight,
    scrollHeight: threadHeight,
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value) {
      scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
    },
  };
  elements.get("demo-preview").closest = () => thread;
  elements.get("astra-demo").querySelector = (selector) =>
    selector === ".demo-exchange" ? exchange : chips[0];
  const copied = [element(), element()];
  const added = Object.assign(element({ hidden: true }), {
    closest: () => null,
    querySelector: (selector) => copied[selector === "[data-approved-name]" ? 0 : 1],
  });
  elements.get("demo-continue-link").dataset.appUrl = "https://app-staging.useorbit.org";
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
    document: {
      getElementById: (id) => elements.get(id),
      querySelectorAll: (selector) => (selector === "[data-demo-approved]" ? [added] : []),
    },
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
  require("./demo");
  return {
    elements,
    chips,
    added,
    copied,
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
    strings: require("../i18n/translations").translations[language],
    switchLanguage(value) {
      language = value;
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
    assert.equal(h.added.hidden, false);
    assert.equal(h.copied[0].textContent, "Read & reflect");
    const link = new URL(h.get("demo-continue-link").href);
    assert.equal(link.origin, "https://app-staging.useorbit.org");
    assert.equal(link.pathname, "/habits/new");
    assert.deepEqual([...link.searchParams], [["title", "Read & reflect"]]);
    assert.equal(h.get("demo-continue").hidden, false);
    assert.doesNotMatch(
      readFileSync("src/scripts/demo.ts", "utf8"),
      /fetch\(|innerHTML|setTimeout/,
    );
  });
  test(`${language}: examples propose the selected habits and rejection adds nothing`, () => {
    const h = harness(language);
    for (const [index, name] of ["start", "restart", "move"].entries()) {
      h.chips[index].fire("click");
      assert.equal(h.get("demo-request").textContent, h.strings[`demo.${name}.request`]);
      assert.equal(h.get("demo-second").hidden, name !== "move");
      h.get("demo-reject").fire("click");
      assert.equal(h.get("demo-result").textContent, h.strings["demo.rejected"]);
      assert.equal(h.get("demo-today").hidden, true);
      assert.equal(h.added.hidden, true);
      assert.equal(h.get("demo-continue").hidden, true);
    }
  });
}
test("empty submissions keep the current proposal and user text remains literal", () => {
  const h = harness();
  h.get("demo-input").value = "   ";
  h.get("demo-composer").fire("submit");
  assert.equal(h.get("demo-request").textContent, "");
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
