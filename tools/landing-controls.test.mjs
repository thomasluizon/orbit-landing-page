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

test("an open FAQ card's question row takes the card's top corners, so its focus ring stays inside the card", () => {
  const card = lastValue(".faq-list > details[open]", "border-radius");
  assert.equal(card, "var(--radius-xl)");
  for (const corner of ["border-start-start-radius", "border-start-end-radius"]) {
    assert.equal(lastValue(".faq-list > details[open] > summary", corner), card, corner);
  }
  assert.equal(lastValue(".faq-list summary", "border-radius"), "var(--radius-sm)");
  assert.match(lastValue(".faq-list summary:focus-visible", "outline-offset") ?? "", /^-\d+px$/);
  const suppressed = rules.find(
    (rule) => rule.selector === ".faq-list details[open] summary:is(:hover, :active)",
  );
  assert.equal(
    declaration(suppressed?.declarations ?? "", "background"),
    "transparent",
    "the row paints no fill of its own while its card is painted",
  );
  assert.deepEqual(
    rules
      .filter((rule) => rule.selector.includes("data-closing") && rule.selector.includes("summary"))
      .filter((rule) =>
        /(?:^|[;\s])(?:background|border(?:-[a-z-]+)?-radius)\s*:/.test(rule.declarations),
      )
      .map((rule) => rule.selector),
    [],
    "the row's shape and fill change with the card radius, when the close settles",
  );
});

test("a closing FAQ item keeps its card radius until its fill and ring fade out with its height", () => {
  assert.equal(lastValue(".faq-list > details[open]", "border-radius"), "var(--radius-xl)");
  assert.deepEqual(
    rules
      .filter((rule) => rule.selector.includes("data-closing"))
      .filter((rule) => declaration(rule.declarations, "border-radius"))
      .map((rule) => rule.selector),
    [],
    "the radius holds while the item stays open through its close",
  );
  const fade = lastValue(".faq-list > details[data-closing]", "transition-duration") ?? "";
  const token = fade.match(/^var\((--duration-[a-z]+)\)$/)?.[1];
  assert.ok(token, "a closing item fades its fill and ring on a duration token");
  const { items, calls, press } = faqHarness({ reduced: false });
  const [one] = items;
  press(one);
  calls.find((call) => call.target === "one:height").onfinish();
  one.height = 160;
  press(one);
  const closing = calls.filter((call) => call.target === "one:height").at(-1);
  assert.equal(
    closing.timing.duration,
    Number.parseFloat(declaration(globalCss, token)),
    "the fill and ring fade over the same time as the height",
  );
  assert.ok(
    one.open && one.hasAttribute("data-closing"),
    "the card keeps its radius while closing",
  );
  closing.onfinish();
  assert.equal(one.open, false, "the radius goes when the close settles");
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

test("a section a header link focuses keeps focus for the next Tab and draws no focus ring", async () => {
  const { sections, press } = headerScrollHarness();
  press("#features");
  await settled();
  assert.equal(sections.features.focusOptions?.preventScroll, true, "focus moves to the section");
  assert.equal(sections.features.getAttribute("tabindex"), "-1");
  for (const id of ["features", "pricing"]) {
    assert.ok(
      sourceFiles("src/components").some((path) =>
        readFileSync(path, "utf8").includes(`<section id="${id}"`),
      ),
      `#${id} is a section`,
    );
  }
  const wayfinding = rules.filter(
    (rule) => rule.selector === ':where(section[id], main[id])[tabindex="-1"]:focus-visible',
  );
  assert.equal(wayfinding.length, 1, "one rule covers a focused section and the skip link target");
  assert.deepEqual(wayfinding[0].conditions, []);
  assert.equal(declaration(wayfinding[0].declarations, "outline"), "none");
  assert.equal(
    lastValue(":focus-visible", "outline"),
    "2px solid var(--color-primary)",
    "every control keeps the global ring",
  );
});

test("a section lands below the header, whose inset and height each have one source", () => {
  const declared = (property) =>
    rules.flatMap((rule) => {
      const value = declaration(rule.declarations, property);
      return value ? [{ selector: rule.selector, conditions: rule.conditions, value }] : [];
    });
  assert.deepEqual(declared("--header-offset"), [
    {
      selector: ".landing-shell",
      conditions: [],
      value: "calc(var(--header-inset) + var(--header-height) + 16px)",
    },
  ]);
  for (const property of ["--header-inset", "--header-height"]) {
    assert.deepEqual(
      [...new Set(declared(property).map(({ selector }) => selector))],
      [".landing-shell"],
      `${property} lives on the element that derives the offset`,
    );
  }
  for (const [selector, property, source] of [
    [".site-header", "inset-block-start", "var(--header-inset)"],
    [".header-content", "min-block-size", "var(--header-height)"],
  ]) {
    for (const rule of rulesFor(selector)) {
      const value = declaration(rule.declarations, property);
      if (value) assert.equal(value, source, `${selector} ${rule.conditions}`);
    }
  }
  assert.deepEqual(
    rules
      .filter((rule) => rule.declarations.includes("safe-area-inset-top"))
      .flatMap((rule) =>
        [...rule.declarations.matchAll(/([-\w]+)\s*:[^;]*safe-area-inset-top/g)].map(
          (match) => match[1],
        ),
      )
      .filter((property) => property !== "--header-inset"),
    [],
    "only the header inset reads the top safe area",
  );
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

const selectorParts = (selector) => selector.split(/,(?![^()]*\))/).map((part) => part.trim());
const pointerState = (selector) => {
  const hover = /:hover\b/.test(selector);
  if (hover === /:active\b/.test(selector)) return undefined;
  return hover ? "hover" : "active";
};
const withoutPointerState = (selector) =>
  selector
    .replace(/:is\([^()]*\)|:hover\b|:active\b/g, (match) =>
      /:hover|:active/.test(match) ? ":state" : match,
    )
    .replace(/\s+/g, " ");

test("a control's press fill comes after its hover fill, so a held mouse press paints it", () => {
  const fills = rules.flatMap((rule, order) =>
    declaration(rule.declarations, "background") ||
    declaration(rule.declarations, "background-color")
      ? selectorParts(rule.selector).flatMap((part) => {
          const state = pointerState(part);
          return state ? [{ order, state, control: withoutPointerState(part) }] : [];
        })
      : [],
  );
  const presses = fills.filter(({ state }) => state === "active");
  const hovers = fills.filter(
    ({ state, control }) => state === "hover" && presses.some((press) => press.control === control),
  );
  assert.ok(hovers.some(({ control }) => control === ".back-to-top:state"));
  assert.deepEqual(
    hovers
      .filter((hover) =>
        presses.some((press) => press.control === hover.control && press.order < hover.order),
      )
      .map(({ control }) => control),
    [],
    "a hover fill declared after the press fill of the same control hides the press",
  );
  assert.equal(lastValue(".back-to-top:hover", "background"), "var(--color-primary-hover)");
  assert.equal(lastValue(".back-to-top:active", "background"), "var(--color-primary-pressed)");
});
