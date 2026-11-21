import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";
import { stylesheetRules } from "./lib/stylesheet-rules.mjs";

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:astro|ts|css)$/.test(entry.name) ? [path] : [];
  });

const nodesOf = (node) => [node, ...(node.children ?? []).flatMap(nodesOf)];
const attributeOf = (node, name) => node.attributes?.find((attribute) => attribute.name === name);

test("no source file paints a primary action by scroll position", () => {
  for (const path of sourceFiles("src")) {
    const source = readFileSync(path, "utf8");
    assert.ok(!/data-accent-active|data-primary-action|primary-actions/.test(source), path);
  }
});

test("each component keeps at most one primary pill button with a static fill", async () => {
  const primitive = readFileSync("src/components/PillButton.astro", "utf8");
  const primary = primitive.match(/primary:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  assert.match(primary, /(?:^|\s)bg-primary(?:\s|$)/);
  assert.doesNotMatch(primitive, /IntersectionObserver|setAttribute/);
  for (const file of readdirSync("src/components").filter((name) => name.endsWith(".astro"))) {
    const { ast } = await parse(readFileSync(`src/components/${file}`, "utf8"));
    const primaries = nodesOf(ast).filter((node) => {
      if (node.name !== "PillButton") return false;
      const variant = attributeOf(node, "variant");
      return !variant || variant.value === "primary";
    });
    assert.ok(primaries.length <= 1, `${file} declares ${primaries.length} primary buttons`);
  }
});

const globalCss = readFileSync("src/styles/global.css", "utf8");
const landingCss = readFileSync("src/styles/landing.css", "utf8");
const rules = [...stylesheetRules(globalCss), ...stylesheetRules(landingCss)];
const declaration = (block, property) =>
  block.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`))?.[1].trim();
function selectorParts(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...selector].entries()) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, selector.slice(start)].map((part) => part.trim().replace(/\s+/g, " "));
}
const lastValue = (selector, property) =>
  rules
    .filter((rule) => selectorParts(rule.selector).includes(selector))
    .map((rule) => declaration(rule.declarations, property))
    .filter(Boolean)
    .at(-1);
const FINE_POINTER = "@media (hover: hover) and (pointer: fine)";
const SUPPRESSIONS = new Set([".faq-list details[open] summary:is(:hover, :active)"]);

const compiledScript = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

function withMotionTokens(sandbox) {
  sandbox.require = (specifier) => {
    assert.equal(specifier, "./motion-token");
    const exports = {};
    vm.runInContext(
      `(exports) => {${compiledScript("src/scripts/motion-token.ts")}}`,
      sandbox,
    )(exports);
    return exports;
  };
  return sandbox;
}

test("a duration token reads the built seconds and the source milliseconds", () => {
  const values = {
    "--duration-normal": ".22s",
    "--duration-fast": " 160ms",
    "--duration-slow": "0.28s",
    "--ease-out": " cubic-bezier(.16, 1, .3, 1)",
  };
  const sandbox = withMotionTokens({
    getComputedStyle: () => ({ getPropertyValue: (name) => values[name] }),
    document: { documentElement: {} },
  });
  vm.createContext(sandbox);
  const { durationToken, motionToken } = sandbox.require("./motion-token");
  assert.equal(durationToken("--duration-normal"), 220);
  assert.equal(durationToken("--duration-fast"), 160);
  assert.equal(durationToken("--duration-slow"), 280);
  assert.equal(motionToken("--ease-out"), "cubic-bezier(.16, 1, .3, 1)");
});

function faqHarness({ reduced, openAtStart = [] }) {
  const calls = [];
  class FakeElement {}
  class FakeDetails extends FakeElement {
    constructor(name, collapsed, expandedHeight) {
      super();
      this.name = name;
      this.open = false;
      this.attributes = new Map([["name", "orbit-questions"]]);
      this.style = { removeProperty: (key) => delete this.style[key] };
      this.collapsed = collapsed;
      this.expandedHeight = expandedHeight;
      this.height = collapsed;
      this.listeners = new Map();
      this.summary = Object.assign(new FakeElement(), {
        parentElement: this,
        attributes: new Map([["aria-expanded", "false"]]),
        offsetHeight: collapsed - 1,
        setAttribute(key, value) {
          this.attributes.set(key, value);
        },
        closest: () => this.summary,
      });
      this.answer = {
        animations: [],
        animate: (frames, timing) => {
          const animation = {
            frames,
            timing,
            cancelled: false,
            cancel: () => (animation.cancelled = true),
          };
          calls.push(Object.assign(animation, { target: `${name}:answer` }));
          return animation;
        },
      };
    }
    get offsetHeight() {
      return this.open ? this.expandedHeight : this.collapsed;
    }
    get clientHeight() {
      return this.offsetHeight - 1;
    }
    getBoundingClientRect() {
      return { height: this.height };
    }
    hasAttribute(key) {
      return this.attributes.has(key);
    }
    removeAttribute(key) {
      this.attributes.delete(key);
    }
    toggleAttribute(key, force) {
      if (force) this.attributes.set(key, "");
      else this.attributes.delete(key);
    }
    querySelector(selector) {
      return selector === "summary" ? this.summary : selector === "p" ? this.answer : null;
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    animate(frames, timing) {
      const animation = {
        frames,
        timing,
        cancelled: false,
        cancel: () => (animation.cancelled = true),
      };
      calls.push(Object.assign(animation, { target: `${this.name}:height` }));
      return animation;
    }
  }
  const items = [new FakeDetails("one", 64, 160), new FakeDetails("two", 64, 200)];
  for (const item of items) item.open = openAtStart.includes(item.name);
  let click;
  const list = { addEventListener: (_, listener) => (click = listener) };
  const builtValues = {
    "--duration-normal": ".22s",
    "--duration-fast": ".16s",
    "--ease-out": "cubic-bezier(.16, 1, .3, 1)",
    "--ease-standard": "cubic-bezier(.2, 0, 0, 1)",
  };
  vm.runInNewContext(
    compiledScript("src/scripts/faq.ts"),
    withMotionTokens({
      exports: {},
      Element: FakeElement,
      HTMLDetailsElement: FakeDetails,
      getComputedStyle: () => ({ getPropertyValue: (name) => builtValues[name] }),
      window: { matchMedia: () => ({ matches: reduced }) },
      document: {
        documentElement: {},
        querySelector: () => list,
        querySelectorAll: () => items,
      },
    }),
  );
  const press = (item) => click({ target: item.summary, preventDefault() {} });
  return { items, calls, press };
}

test("the FAQ animates open and closed and closes the other item with the same motion", () => {
  const { items, calls, press } = faqHarness({ reduced: false });
  const [one, two] = items;
  assert.ok(
    items.every((item) => !item.hasAttribute("name")),
    "script owns exclusivity",
  );
  press(one);
  const opening = calls.find((call) => call.target === "one:height");
  assert.deepEqual([...opening.frames.blockSize], ["64px", "160px"]);
  assert.equal(opening.timing.duration, 220);
  assert.equal(opening.timing.easing, "cubic-bezier(.16, 1, .3, 1)");
  assert.equal(one.summary.attributes.get("aria-expanded"), "true");
  assert.equal(one.style.overflow, "clip");
  opening.onfinish();
  assert.equal(one.open, true);
  assert.ok(!one.style.overflow);
  one.height = 160;
  press(two);
  const closing = calls.find((call) => call.target === "one:height" && call !== opening);
  assert.deepEqual([...closing.frames.blockSize], ["160px", "64px"]);
  assert.equal(closing.timing.duration, 160);
  assert.equal(one.open, true, "the item stays open until its motion ends");
  assert.ok(one.hasAttribute("data-closing"));
  assert.equal(one.summary.attributes.get("aria-expanded"), "false");
  assert.equal(two.summary.attributes.get("aria-expanded"), "true");
  closing.onfinish();
  assert.equal(one.open, false);
  assert.ok(!one.hasAttribute("data-closing"));
});

test("the FAQ retargets from the current height when a press interrupts its motion", () => {
  const { items, calls, press } = faqHarness({ reduced: false });
  const [one] = items;
  press(one);
  const opening = calls.find((call) => call.target === "one:height");
  one.height = 100;
  press(one);
  assert.equal(opening.cancelled, true);
  const closing = calls.filter((call) => call.target === "one:height").at(-1);
  assert.deepEqual([...closing.frames.blockSize], ["100px", "64px"]);
});

test("the FAQ changes state without motion when the visitor reduces motion", () => {
  const { items, calls, press } = faqHarness({ reduced: true });
  const [one, two] = items;
  press(one);
  assert.equal(one.open, true);
  assert.equal(one.summary.attributes.get("aria-expanded"), "true");
  press(two);
  assert.equal(one.open, false);
  assert.equal(two.open, true);
  assert.deepEqual(calls, []);
});

test("an FAQ item opened before the script runs reads as expanded once it runs", () => {
  const { items, press } = faqHarness({ reduced: false, openAtStart: ["two"] });
  const [one, two] = items;
  assert.equal(one.summary.attributes.get("aria-expanded"), "false");
  assert.equal(two.summary.attributes.get("aria-expanded"), "true");
  assert.equal(two.open, true, "the script keeps the answer the visitor opened");
  press(one);
  assert.ok(two.hasAttribute("data-closing"), "a later press closes it like any other open item");
});

test("a native toggle outside the script's motion updates aria-expanded", () => {
  const { items } = faqHarness({ reduced: false });
  const [one] = items;
  for (const open of [true, false]) {
    one.open = open;
    one.listeners.get("toggle")();
    assert.equal(one.summary.attributes.get("aria-expanded"), String(open));
  }
});

function headerScrollHarness({ hash = "", reduced = false } = {}) {
  class FakeElement {
    constructor(attributes = {}) {
      this.attributes = new Map(Object.entries(attributes));
      this.focusOptions = undefined;
    }
    closest(selector) {
      return selector === '.header-links a[href^="#"]' && this.attributes.has("href") ? this : null;
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    focus(options) {
      this.focusOptions = options;
    }
    scrollIntoView() {}
  }
  const sections = { features: new FakeElement(), pricing: new FakeElement() };
  const location = { hash };
  const scrolled = [];
  let click;
  const sandbox = {
    exports: {},
    Element: FakeElement,
    document: {
      addEventListener: (_, listener) => (click = listener),
      getElementById: (id) => sections[id] ?? null,
    },
    window: {
      location,
      history: { pushState: (_state, _title, value) => (location.hash = value) },
    },
    require: () => ({ scrollToElement: (target) => scrolled.push({ target, reduced }) }),
  };
  vm.runInNewContext(compiledScript("src/scripts/header-scroll.ts"), sandbox);
  const press = (href, extra = {}) => {
    const event = {
      button: 0,
      defaultPrevented: false,
      target: new FakeElement({ href }),
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    click(event);
    return event;
  };
  return { sections, location, scrolled, press };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

test("a header link scrolls to its section through the programmatic scroll", async () => {
  const { sections, location, scrolled, press } = headerScrollHarness();
  const event = press("#pricing");
  await settled();
  assert.equal(event.defaultPrevented, true);
  assert.equal(location.hash, "#pricing");
  assert.equal(scrolled.length, 1);
  assert.equal(scrolled[0].target, sections.pricing);
  assert.equal(sections.pricing.getAttribute("tabindex"), "-1");
  assert.equal(sections.pricing.focusOptions.preventScroll, true);
});

test("a header link leaves a press the downloads launcher owns, a modified press and a missing target alone", async () => {
  const { scrolled, location, press } = headerScrollHarness();
  assert.equal(press("#features", { defaultPrevented: true }).defaultPrevented, true);
  for (const extra of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
    assert.equal(press("#features", extra).defaultPrevented, false);
  }
  assert.equal(press("#downloads").defaultPrevented, false);
  await settled();
  assert.deepEqual(scrolled, []);
  assert.equal(location.hash, "");
});

test("reduced motion removes every control transition and the press movement", () => {
  const reduced = rules.filter(
    (rule) =>
      rule.conditions.includes("@media (prefers-reduced-motion: reduce)") &&
      globalCss.includes(rule.declarations),
  );
  const universal = reduced.find((rule) => rule.selector.includes("*::before"));
  assert.ok(universal, "global.css resets every transition under reduced motion");
  assert.equal(declaration(universal.declarations, "transition-duration"), "0.01ms !important");
  assert.equal(declaration(universal.declarations, "transition-delay"), "0s !important");
  const press = reduced.find((rule) => rule.selector === ":active");
  assert.equal(declaration(press.declarations, "scale"), "none !important");
});

test("every hover rule waits for a fine pointer, so a tap on a touch screen leaves no hover behind", () => {
  const outside = rules
    .filter((rule) => !rule.conditions.includes(FINE_POINTER))
    .flatMap((rule) => selectorParts(rule.selector))
    .filter((part) => /:hover\b/.test(part) && !SUPPRESSIONS.has(part));
  assert.deepEqual(outside, []);
});

test("a small Orbit face paints its symbol classes with rules that reach the clone of its use", async () => {
  const { ast } = await parse(readFileSync("src/components/OrbitMascot.astro", "utf8"));
  const symbolClasses = new Set(
    nodesOf(ast)
      .filter((node) => node.name === "symbol")
      .flatMap((symbol) => nodesOf(symbol))
      .flatMap((node) => (attributeOf(node, "class")?.value ?? "").split(/\s+/).filter(Boolean)),
  );
  const inks = new Map([
    ["orbit-ink", "currentColor"],
    ["orbit-eye-ink", "var(--color-bg)"],
    ["orbit-moon-ink", "var(--color-primary)"],
  ]);
  assert.deepEqual([...symbolClasses].sort(), [...inks.keys()].sort());
  for (const [name, fill] of inks) {
    const reach = new RegExp(`\\.${name}(?![\\w-])`);
    const scoped = rules
      .flatMap((rule) => selectorParts(rule.selector))
      .filter((part) => reach.test(part) && part !== `.${name}`);
    assert.deepEqual(scoped, [], `${name}: an ancestor outside the symbol never matches the clone`);
    assert.equal(lastValue(`.${name}`, "fill"), fill, name);
  }
});
