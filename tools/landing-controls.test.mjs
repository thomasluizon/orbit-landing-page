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
const rulesFor = (selector) =>
  rules.filter((rule) => rule.selector.split(",").some((part) => part.trim() === selector));
const lastValue = (selector, property) =>
  rulesFor(selector)
    .map((rule) => declaration(rule.declarations, property))
    .filter(Boolean)
    .at(-1);

test("the Ask Astra focus ring follows the pill shape and stays inside the phone", () => {
  assert.equal(lastValue(".demo-composer", "border-radius"), "28px");
  assert.equal(lastValue(".demo-composer", "min-block-size"), "56px");
  const ring = ".demo-composer:has(input:focus-visible)";
  assert.equal(lastValue(ring, "outline"), "2px solid var(--color-primary)");
  assert.equal(lastValue(ring, "outline-offset"), "2px");
  assert.equal(lastValue(".demo-composer input:focus-visible", "outline"), "none");
  assert.equal(lastValue(".demo-composer input", "border-radius"), undefined);
  const gutter = Number.parseInt(lastValue(".demo-input-area", "padding") ?? "0", 10);
  assert.ok(gutter >= 4, "the ring needs the 2px offset and the 2px width inside its container");
});

test("every other rounded input keeps its own radius, so the global focus ring follows it", () => {
  assert.match(globalCss, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-primary\)/);
  for (const selector of ["#waitlist-email", ".demo-edit-form input", ".demo-edit-form select"]) {
    assert.match(lastValue(selector, "border-radius") ?? "", /^var\(--radius-(?:sm|md|lg|xl)\)$/);
  }
});

function faqHarness({ reduced }) {
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
  let click;
  const list = { addEventListener: (type, listener) => (click = listener) };
  const values = {
    "--duration-normal": "220ms",
    "--duration-fast": "160ms",
    "--ease-out": " cubic-bezier(0.16, 1, 0.3, 1)",
    "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/faq.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: {},
      Element: FakeElement,
      HTMLDetailsElement: FakeDetails,
      getComputedStyle: () => ({ getPropertyValue: (name) => values[name] }),
      window: { matchMedia: () => ({ matches: reduced }) },
      document: {
        documentElement: {},
        querySelector: () => list,
        querySelectorAll: () => items,
      },
    },
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
  assert.equal(opening.timing.easing, "cubic-bezier(0.16, 1, 0.3, 1)");
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
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/header-scroll.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    sandbox,
  );
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

test("a section lands below the header, which sets the offset from its own size and inset", () => {
  const valueAt = (selector, property, compact) =>
    rulesFor(selector)
      .filter((rule) => rule.conditions.some((text) => text.includes("40rem")) === compact)
      .map((rule) => declaration(rule.declarations, property))
      .filter(Boolean)
      .at(-1);
  for (const [compact, inset, height] of [
    [false, "24px", "72px"],
    [true, "16px", "64px"],
  ]) {
    assert.equal(valueAt(".header-content", "min-block-size", compact), height);
    assert.match(
      valueAt(".site-header", "inset-block-start", compact),
      new RegExp(`^max\\(${inset},`),
    );
    assert.equal(
      valueAt(".landing-shell", "--header-offset", compact),
      `calc(max(${inset}, env(safe-area-inset-top)) + ${height} + 16px)`,
    );
  }
  const anchored = rules.find((rule) => rule.selector === ":where(section[id], main[id])");
  assert.equal(
    declaration(anchored.declarations, "scroll-margin-block-start"),
    "var(--header-offset)",
  );
  for (const selector of [".downloads-disclosure", ".downloads-toggle"]) {
    assert.equal(
      lastValue(selector, "scroll-margin-block-start"),
      "var(--header-offset)",
      selector,
    );
  }
});

const TIER = {
  control: "var(--duration-hover-control)",
  surface: "var(--duration-hover-surface)",
  press: "var(--duration-fast)",
};
const COLOUR = ["background-color", "color", "box-shadow"];
const PRESS = ["scale", "opacity"];
const controls = [
  [".brand", ["background-color"]],
  [".header-links a", ["color"]],
  [".language-toggle", ["background-color", "scale"]],
  [".billing-option", [...COLOUR, "scale"]],
  [".demo-chip", [...COLOUR, "scale"]],
  [".demo-composer", ["background-color"]],
  [".demo-send", ["background-color", "color", "scale"]],
  [".demo-save", ["background-color", "scale"]],
  [".habit-row[data-habit-toggle]", ["background-color"]],
  [".calendar-nav-button", ["background-color"]],
  [".calendar-month-title", ["background-color"]],
  [".day-cell-circle", ["background-color"]],
  [".downloads-entry", ["background-color"]],
  [".downloads-qr", ["background-color"]],
  [".faq-list summary", ["background-color"]],
  [".back-to-top", ["background-color", "scale"]],
  ["#waitlist-email", ["background-color", "box-shadow"]],
  [".demo-edit-form input", ["background-color", "box-shadow"]],
  [".demo-edit-form select", ["background-color", "box-shadow"]],
  [".text-link", ["color"], "surface"],
  [".carousel-marker", ["background-color"], "press"],
  [".metric-bar", ["background-color"], "press"],
  [".downloads-chevron", ["transform"], "press"],
  [".faq-list summary svg", ["transform"], "press"],
];

function transitionsOf(selector) {
  const found = new Map();
  for (const rule of rulesFor(selector)) {
    const shorthand = declaration(rule.declarations, "transition");
    if (shorthand) {
      const [property, duration, easing] = shorthand.split(/\s+(?![^(]*\))/);
      found.set(property, { duration, easing });
    }
    const properties = declaration(rule.declarations, "transition-property")?.split(/\s*,\s*/);
    const durations = declaration(rule.declarations, "transition-duration")
      ?.split(/,\s*(?![^(]*\))/)
      .map((value) => value.trim());
    const easing = declaration(rule.declarations, "transition-timing-function");
    properties?.forEach((property, index) =>
      found.set(property, { duration: durations?.[index] ?? durations?.[0], easing }),
    );
  }
  return found;
}

test("every landing control has a transition sized by its frequency tier", () => {
  for (const [selector, properties, tier] of controls) {
    const transitions = transitionsOf(selector);
    assert.ok(transitions.size > 0, `${selector} has no transition`);
    for (const property of properties) {
      const transition = transitions.get(property);
      assert.ok(transition, `${selector} does not transition ${property}`);
      const expected = tier ? TIER[tier] : PRESS.includes(property) ? TIER.press : TIER.control;
      assert.equal(transition.duration, expected, `${selector} ${property} duration`);
      assert.match(transition.easing ?? "", /^var\(--ease-(?:standard|out)\)$/, selector);
    }
    assert.ok(!transitions.has("all"), `${selector} animates every property`);
  }
});

test("every pill button carries the shared control transition with the same tiers", () => {
  const utility = globalCss.match(/@utility control-transition\s*\{([^}]+)\}/)[1];
  const properties = declaration(utility, "transition-property").split(/\s*,\s*/);
  for (const property of [...COLOUR, "opacity", "scale"]) assert.ok(properties.includes(property));
  assert.match(declaration(utility, "transition-duration"), /^var\(--duration-hover-control\)/);
  const primitive = readFileSync("src/components/PillButton.astro", "utf8");
  assert.equal(primitive.match(/control-transition/g).length, 2, "both the link and the button");
});

test("no stylesheet animates every property or forces a transition outside reduced motion", () => {
  for (const [name, source] of [
    ["global.css", globalCss],
    ["landing.css", landingCss],
  ]) {
    assert.ok(!/transition(?:-property)?\s*:\s*all\b/.test(source), `${name} animates all`);
    assert.ok(!/@keyframes/.test(source), `${name} declares keyframes`);
  }
  for (const rule of rules) {
    const reducedBlock = rule.conditions.some((text) => text.includes("prefers-reduced-motion"));
    if (!reducedBlock)
      assert.ok(!/transition[^;]*!important/.test(rule.declarations), rule.selector);
  }
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
