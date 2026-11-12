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
const rulesFor = (selector) =>
  rules.filter((rule) => selectorParts(rule.selector).includes(selector));
const lastValue = (selector, property) =>
  rulesFor(selector)
    .map((rule) => declaration(rule.declarations, property))
    .filter(Boolean)
    .at(-1);
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
const FINE_POINTER = "@media (hover: hover) and (pointer: fine)";
const BORDER_CONTROL_RING = "inset 0 0 0 1px var(--color-border-control)";
const HAIRLINE_STRONG_RING = "inset 0 0 0 1px var(--color-hairline-strong)";
const textFields = ["#waitlist-email", ".demo-edit-form input", ".demo-edit-form select"];
const fieldHover = (field) => `${field}:hover:not(:focus-within)`;

test("the Ask Astra focus ring follows the pill shape inside the pill, as the canon composer draws it", () => {
  assert.equal(lastValue(".demo-composer", "border-radius"), "28px");
  assert.equal(lastValue(".demo-composer", "min-block-size"), "56px");
  const ring = ".demo-composer:has(input:focus-visible)";
  assert.equal(lastValue(ring, "outline"), "2px solid var(--color-primary)");
  assert.equal(lastValue(ring, "outline-offset"), "-2px");
  assert.equal(lastValue(".demo-composer input:focus-visible", "outline"), "none");
  assert.equal(lastValue(".demo-composer input", "border-radius"), undefined);
});

test("every text field keeps its 3:1 boundary on hover and draws the inset 2px primary focus ring", () => {
  assert.match(globalCss, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-primary\)/);
  for (const selector of textFields) {
    assert.match(lastValue(selector, "border-radius") ?? "", /^var\(--radius-(?:sm|md|lg|xl)\)$/);
    assert.equal(lastValue(selector, "box-shadow"), BORDER_CONTROL_RING, selector);
    assert.equal(
      lastValue(fieldHover(selector), "box-shadow"),
      BORDER_CONTROL_RING,
      `${selector} hover retains the control boundary`,
    );
    assert.equal(lastValue(`${selector}:focus-visible`, "outline-offset"), "-2px", selector);
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

const subjectOf = (part) =>
  part
    .replace(/:(?:has|not|is|where)\((?:[^()]|\([^()]*\))*\)/g, "")
    .split(/\s*[>+~]\s*|\s+/)
    .at(-1);

test("an open FAQ card lights under its question row and stops when the close starts", () => {
  const card = ".faq-list > details[open]:not([data-closing])";
  const hover = rules.find((rule) => rule.selector === `${card}:has(> summary:hover)`);
  const press = rules.find((rule) => rule.selector === `${card}:has(> summary:active)`);
  assert.deepEqual(hover?.conditions, [FINE_POINTER]);
  assert.equal(declaration(hover.declarations, "background"), "var(--color-bg-hover)");
  assert.deepEqual(press?.conditions, [], "the press fill shows on touch");
  assert.equal(declaration(press.declarations, "background"), "var(--color-bg-hover)");
  assert.ok(rules.indexOf(press) > rules.indexOf(hover), "the press comes after the hover");
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
      .filter((rule) => rule.selector.includes("data-closing"))
      .filter((rule) =>
        selectorParts(rule.selector).some((part) => subjectOf(part).startsWith("summary")),
      )
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
const BG_HOVER = "var(--color-bg-hover)";
const PRIMARY_HOVER = "var(--color-primary-hover)";
const PRIMARY_PRESSED = "var(--color-primary-pressed)";
const FG_1 = "var(--color-fg-1)";
const OPEN_CARD = ".faq-list > details[open]:not([data-closing])";
const ROLES = {
  field: { tier: "control", animates: ["box-shadow"] },
  control: { tier: "control", animates: ["background-color"] },
  surface: { tier: "surface", animates: ["background-color"] },
  link: { tier: "surface", animates: ["color"] },
  mark: { tier: "control", animates: ["background-color"] },
};
const role = (name, base, options = {}) => ({
  role: name,
  base,
  hover: `${base}:hover`,
  press: name === "field" ? undefined : `${base}:active`,
  focus: "inset",
  ...options,
});
const controlRoles = new Map([
  [".brand", role("control", ".brand")],
  [".language-toggle", role("control", ".language-toggle", { scale: true })],
  [".billing-option", role("control", ".billing-option", { scale: true })],
  [".demo-chip", role("control", ".demo-chip", { scale: true })],
  [
    ".demo-send",
    role("control", ".demo-send", {
      hover: ".demo-composer[data-has-text] .demo-send:hover",
      press: ".demo-composer[data-has-text] .demo-send:active",
      focus: ".demo-composer .demo-send:focus-visible",
      scale: true,
    }),
  ],
  [".demo-save", role("control", ".demo-save", { scale: true })],
  [".back-to-top", role("control", ".back-to-top", { scale: true, focus: "outward" })],
  [".skip-to-content", role("control", ".skip-to-content")],
  [
    ".calendar-nav-button",
    role("control", ".calendar-nav-button", {
      press: ".calendar-nav-button:is(:active, :focus-visible)",
    }),
  ],
  [
    ".calendar-month-title",
    role("control", ".calendar-month-title", {
      hover: '.calendar-month-title:not([aria-disabled="true"]):hover',
      press: '.calendar-month-title:not([aria-disabled="true"]):is(:active, :focus-visible)',
    }),
  ],
  [
    ".habit-row[data-habit-toggle]",
    role("surface", ".habit-row[data-habit-toggle]", { rest: ".habit-row" }),
  ],
  [".faq-list summary", role("surface", ".faq-list summary")],
  [
    ".faq-list summary in an open card",
    role("surface", ".faq-list > details", {
      hover: `${OPEN_CARD}:has(> summary:hover)`,
      press: `${OPEN_CARD}:has(> summary:active)`,
      focus: ".faq-list summary:focus-visible",
      rest: OPEN_CARD,
    }),
  ],
  [".downloads-entry", role("surface", ".downloads-entry")],
  [".downloads-qr", role("surface", ".downloads-qr")],
  [
    ".header-links a",
    role("link", ".header-links a", {
      underline: ".header-links a > span::after",
      underlineHover: ".header-links a:hover > span::after",
      underlinePress: ".header-links a:active > span::after",
      focus: "outward",
    }),
  ],
  [".text-link", role("link", ".text-link", { focus: "outward" })],
  [
    ".demo-continue .text-link",
    role("link", ".text-link", {
      hover: ".demo-continue .text-link:hover",
      press: ".demo-continue .text-link:active",
      focus: "outward",
    }),
  ],
  [
    ".carousel-segment",
    role("mark", ".carousel-marker", {
      hover: ".carousel-segment:hover .carousel-marker",
      press: ".carousel-segment:active .carousel-marker",
      markPaint: lastValue('.carousel-segment[aria-current="true"] .carousel-marker', "background"),
      focus: "outward",
    }),
  ],
  [
    ".metric-bar-track",
    role("mark", ".metric-bar", {
      hover: "button.metric-bar-track:hover .metric-bar",
      press: "button.metric-bar-track:active .metric-bar",
      markPaint: lastValue('.metric-bar[data-selected="true"]', "background"),
      focus: "button.metric-bar-track:focus-visible",
    }),
  ],
  [
    ".day-cell",
    role("mark", ".day-cell-circle", {
      hover: ".day-cell:hover .day-cell-circle:not(.is-selected)",
      press: ".day-cell:active .day-cell-circle:not(.is-selected)",
      markPaint: BG_HOVER,
      focus: ".day-cell:focus-visible .day-cell-circle",
    }),
  ],
  [
    ".demo-composer",
    role("field", ".demo-composer", {
      hover: ".demo-composer:hover:not(:focus-within, :has(button:hover))",
      focus: ".demo-composer:has(input:focus-visible)",
      wraps: ["button"],
    }),
  ],
  ...textFields.map((field) => [field, role("field", field, { hover: fieldHover(field) })]),
]);
const STATE_TRANSITIONS = [".downloads-chevron", ".faq-list summary svg"];
const SUPPRESSIONS = new Map([
  [
    ".faq-list details[open] summary:is(:hover, :active)",
    "an open card paints its question row's hover and press, so the row itself stays clear",
  ],
]);
const withoutPointerFeedback = new Map([
  [
    "main#main-content",
    "the skip link's focus target, not a control: DESIGN.md gives a hover state only to an interactive surface",
  ],
]);

function transitionsOf(selector) {
  const found = new Map();
  for (const rule of rulesFor(selector)) {
    const shorthand = declaration(rule.declarations, "transition");
    if (shorthand) {
      for (const item of shorthand.split(/,\s*(?![^(]*\))/)) {
        const [property, duration, easing] = item.trim().split(/\s+(?![^(]*\))/);
        found.set(property, { duration, easing });
      }
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

const paints = (rule) =>
  /(?:^|[;\s])(?:background(?:-color)?|color|box-shadow)\s*:/.test(rule.declarations);
const paintedBy = (part) =>
  rules
    .map((rule, order) => ({ rule, order }))
    .filter(({ rule }) => paints(rule) && selectorParts(rule.selector).includes(part));
const paintOf = (found) =>
  Object.fromEntries(
    found.flatMap(({ rule }) =>
      [
        ...rule.declarations.matchAll(
          /(?:^|[;\s])(background(?:-color)?|color|box-shadow)\s*:\s*([^;]+);/g,
        ),
      ].map(([, property, value]) => [property.replace("-color", ""), value.trim()]),
    ),
  );

function rolePaint(control, hover) {
  if (control.role === "field") return { hover: { "box-shadow": BORDER_CONTROL_RING } };
  if (control.role === "link") return { hover: { color: FG_1 }, press: { color: FG_1 } };
  if (control.role === "mark") {
    return { hover: { background: control.markPaint }, press: { background: control.markPaint } };
  }
  if (control.role === "surface") {
    const paint = {
      background: BG_HOVER,
      ...(control.rest ? { "box-shadow": HAIRLINE_STRONG_RING } : {}),
    };
    return { hover: paint, press: paint };
  }
  return hover.background === PRIMARY_HOVER
    ? { hover: { background: PRIMARY_HOVER }, press: { background: PRIMARY_PRESSED } }
    : { hover: { background: BG_HOVER }, press: { background: BG_HOVER } };
}

test("every interactive element paints exactly the hover and press its one role gives it", () => {
  for (const [name, control] of controlRoles) {
    const label = `${name} (${control.role})`;
    const hovers = paintedBy(control.hover);
    assert.ok(hovers.length > 0, `${label} has no hover state`);
    for (const { rule } of hovers) {
      assert.deepEqual(rule.conditions, [FINE_POINTER], `${label} hover waits for a fine pointer`);
      assert.doesNotMatch(rule.declarations, /(?:^|[;\s])(?:transform|translate|scale)\s*:/, label);
    }
    const expected = rolePaint(control, paintOf(hovers));
    assert.deepEqual(paintOf(hovers), expected.hover, `${label} hover paint`);
    if (control.role === "mark") {
      assert.equal(subjectOf(control.hover), control.base, `${label} hover paints its own mark`);
    }
    if (control.role === "field") {
      assert.match(
        control.hover,
        /:not\([^)]*:focus-within/,
        `${label} hovers while it holds focus`,
      );
      assert.equal(control.press, undefined, `${label} has a press fill`);
      continue;
    }
    const presses = paintedBy(control.press);
    assert.ok(presses.length > 0, `${label} has no press state`);
    for (const { rule } of presses) {
      assert.deepEqual(
        rule.conditions,
        [],
        `${label} press shows on touch and under reduced motion`,
      );
    }
    assert.deepEqual(paintOf(presses), expected.press, `${label} press paint`);
    assert.ok(
      Math.min(...presses.map(({ order }) => order)) >
        Math.max(...hovers.map(({ order }) => order)),
      `${label} press comes after its hover`,
    );
    if (control.role === "surface") {
      assert.ok(
        presses.some(({ rule }) => declaration(rule.declarations, "transition") === "none"),
        `${label} press paints at once, as the app's rows do`,
      );
    }
  }
});

test("a surface moves its hairline only when it draws one, and a link either keeps its underline or draws it on hover", () => {
  for (const [name, control] of controlRoles) {
    if (control.role === "surface" && control.rest) {
      assert.match(
        lastValue(control.rest, "box-shadow") ?? "",
        /^inset 0 0 0 1px var\(--color-hairline(?:-ghost)?\)$/,
        `${name} rests on a hairline`,
      );
    } else if (control.role === "surface") {
      assert.equal(lastValue(control.base, "box-shadow"), undefined, `${name} draws no hairline`);
    }
    if (control.role !== "link") continue;
    if (lastValue(control.base, "text-decoration") === "underline") continue;
    assert.ok(control.underline, `${name} needs an underline that scales from its leading edge`);
    assert.equal(lastValue(control.underline, "transform"), "scaleX(0)");
    assert.equal(lastValue(control.underline, "transform-origin"), "left");
    assert.equal(lastValue(control.underline, "background"), "currentColor");
    for (const [selector, conditions] of [
      [control.underlineHover, [FINE_POINTER]],
      [control.underlinePress, []],
    ]) {
      const found = rulesFor(selector);
      assert.ok(found.length > 0, selector);
      for (const rule of found) {
        assert.deepEqual(rule.conditions, conditions, selector);
        assert.equal(declaration(rule.declarations, "transform"), "scaleX(1)", selector);
      }
    }
  }
});

test("every interactive element transitions on its role's frequency tier", () => {
  for (const [name, control] of controlRoles) {
    const transitions = transitionsOf(control.base);
    const { tier, animates } = ROLES[control.role];
    const properties = [...animates, ...(control.rest ? ["box-shadow"] : [])];
    for (const property of properties) {
      const transition = transitions.get(property);
      assert.ok(transition, `${name} does not transition ${property}`);
      assert.equal(transition.duration, TIER[tier], `${name} ${property} duration`);
      assert.equal(transition.easing, "var(--ease-standard)", `${name} ${property} easing`);
    }
    if (control.scale) assert.equal(transitions.get("scale")?.duration, TIER.press, name);
    if (control.underline) {
      assert.equal(transitionsOf(control.underline).get("transform")?.duration, TIER.surface);
    }
    assert.ok(!transitions.has("all"), `${name} animates every property`);
  }
  for (const selector of STATE_TRANSITIONS) {
    const transition = transitionsOf(selector).get("transform");
    assert.equal(transition?.duration, TIER.press, selector);
    assert.match(transition.easing ?? "", /^var\(--ease-(?:standard|out)\)$/, selector);
  }
});

test("every hover or press paint in the stylesheets belongs to one control and follows its role", () => {
  const declared = new Set(
    [...controlRoles.values()].flatMap((control) =>
      [control.hover, control.press, control.underlineHover, control.underlinePress].filter(
        Boolean,
      ),
    ),
  );
  const undeclared = [];
  for (const rule of rules) {
    if (!paints(rule) && !/(?:^|[;\s])transform\s*:/.test(rule.declarations)) continue;
    for (const part of selectorParts(rule.selector)) {
      if (!/:hover\b|:active\b/.test(part) || declared.has(part)) continue;
      if (SUPPRESSIONS.has(part)) {
        assert.equal(declaration(rule.declarations, "background"), "transparent", part);
        continue;
      }
      undeclared.push(part);
    }
  }
  assert.deepEqual(
    undeclared,
    [],
    "a hover or press paint needs a control and a role in the table",
  );
  const focusFills = rules
    .filter((rule) => /(?:^|[;\s])background(?:-color)?\s*:/.test(rule.declarations))
    .flatMap((rule) => selectorParts(rule.selector))
    .filter((part) => part.includes(":focus-visible"));
  for (const part of focusFills) {
    const owner = [...controlRoles.values()].find((control) => control.press === part);
    assert.equal(owner?.role, "control", `${part}: only a neutral control paints a focus fill`);
  }
});

test("a field, a surface, a mark cell and a crowded control draw their focus ring inside their own box", () => {
  for (const [name, control] of controlRoles) {
    if (control.focus === "outward") {
      assert.ok(!["field", "surface"].includes(control.role), `${name} rings outside its box`);
      continue;
    }
    const selector = control.focus === "inset" ? `${control.base}:focus-visible` : control.focus;
    assert.match(lastValue(selector, "outline-offset") ?? "", /^-\d+px$/, `${name} focus ring`);
  }
  for (const selector of [".demo-save:focus-visible", ".skip-to-content:focus-visible"]) {
    assert.equal(
      lastValue(selector, "outline-color"),
      "var(--color-fg-on-primary)",
      `${selector}: a ring inside a primary fill takes the label colour`,
    );
  }
  assert.equal(
    lastValue(".demo-composer .demo-send:focus-visible", "box-shadow"),
    "inset 0 0 0 4px var(--color-bg)",
    "the filled send separates its inset ring from its fill, as the app's composer does",
  );
  assert.ok(
    !transitionsOf(".demo-send").has("box-shadow"),
    "the send ring's canvas band appears with the ring",
  );
});

test("the Ask Astra composer hovers as a text field and leaves the fills to its send button", () => {
  assert.equal(lastValue(".demo-composer", "background"), "var(--color-bg-field)");
  assert.equal(lastValue(".demo-composer", "box-shadow"), BORDER_CONTROL_RING);
  const hover = ".demo-composer:hover:not(:focus-within, :has(button:hover))";
  const hovers = rulesFor(hover);
  assert.ok(hovers.length > 0, "the composer keeps its ring on hover");
  for (const rule of hovers) {
    assert.deepEqual(rule.conditions, [FINE_POINTER]);
    assert.deepEqual(paintOf([{ rule }]), { "box-shadow": BORDER_CONTROL_RING });
  }
  assert.deepEqual(
    rules
      .filter(paints)
      .flatMap((rule) => selectorParts(rule.selector))
      .filter(
        (part) =>
          /^\.demo-composer(?::|\[)/.test(part) && !subjectOf(part).startsWith(".demo-send"),
      )
      .filter((part) => /:hover|:active/.test(part.replace(/:has\(button:hover\)/, "")))
      .filter((part) => part !== hover),
    [],
    "the composer paints no other hover and no press",
  );
  assert.equal(
    lastValue(".demo-composer[data-has-text] .demo-send:hover", "background"),
    PRIMARY_HOVER,
  );
  assert.equal(
    lastValue(".demo-composer[data-has-text] .demo-send:active", "background"),
    PRIMARY_PRESSED,
  );
});

test("a control's press fill comes after its hover fill, so a held mouse press paints it", () => {
  const fills = rules.flatMap((rule, order) =>
    paints(rule)
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
  assert.equal(lastValue(".back-to-top:hover", "background"), PRIMARY_HOVER);
  assert.equal(lastValue(".back-to-top:active", "background"), PRIMARY_PRESSED);
});

test("every pill button carries the shared control transition with the same tiers", () => {
  const utility = globalCss.match(/@utility control-transition\s*\{([^}]+)\}/)[1];
  const properties = declaration(utility, "transition-property").split(/\s*,\s*/);
  for (const property of ["background-color", "color", "box-shadow", "opacity", "scale"]) {
    assert.ok(properties.includes(property));
  }
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

const INTERACTIVE_TAGS = new Set(["a", "button", "summary", "input", "select", "textarea"]);
const COMPONENT_CONTROLS = {
  PillButton: "PillButton",
  HabitRow: ".habit-row[data-habit-toggle]",
  LanguageToggle: ".language-toggle",
};
const CONTROL_BY_ID = {
  "waitlist-email": "#waitlist-email",
  "demo-edit-name": ".demo-edit-form input",
  "demo-edit-schedule": ".demo-edit-form select",
  "demo-input": ".demo-composer",
  "main-content": "main#main-content",
};
const classesOf = (node) => (attributeOf(node, "class")?.value ?? "").split(/\s+/).filter(Boolean);
const isInteractive = (node) =>
  INTERACTIVE_TAGS.has(node.name) ||
  Object.hasOwn(COMPONENT_CONTROLS, node.name) ||
  attributeOf(node, "tabindex") !== undefined ||
  attributeOf(node, "role")?.value === "button";

function controlKey(node, ancestors) {
  if (COMPONENT_CONTROLS[node.name]) return COMPONENT_CONTROLS[node.name];
  const id = attributeOf(node, "id")?.value;
  if (CONTROL_BY_ID[id]) return CONTROL_BY_ID[id];
  if (node.name === "summary") return ".faq-list summary";
  const classes = classesOf(node);
  if (classes.includes("habit-row")) return ".habit-row[data-habit-toggle]";
  const known = classes.map((name) => `.${name}`).find((key) => controlRoles.has(key));
  if (known) return known;
  if (
    node.name === "a" &&
    ancestors.some((ancestor) => classesOf(ancestor).includes("header-links"))
  )
    return ".header-links a";
  return [node.name, id && `#${id}`, ...classes.map((name) => `.${name}`)].filter(Boolean).join("");
}

function controlsIn(node, ancestors = []) {
  return [
    ...(isInteractive(node) ? [{ key: controlKey(node, ancestors), node }] : []),
    ...(node.children ?? []).flatMap((child) => controlsIn(child, [...ancestors, node])),
  ];
}

async function landingMarkup() {
  const found = [];
  for (const directory of ["src/components", "src/pages", "src/layouts"]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".astro"))) {
      if (file === "PillButton.astro") continue;
      const { ast } = await parse(readFileSync(`${directory}/${file}`, "utf8"));
      found.push({ file, ast });
    }
  }
  return found;
}

test("every interactive element the landing renders has a role in the pointer feedback table", async () => {
  const found = new Set();
  for (const { ast } of await landingMarkup()) {
    for (const { key } of controlsIn(ast)) found.add(key);
  }
  for (const file of readdirSync("src/scripts").filter((name) => /^[\w-]+\.ts$/.test(name))) {
    for (const [, classes] of readFileSync(`src/scripts/${file}`, "utf8").matchAll(
      /<(?:a|button|summary|input|select)\b[^>]*\bclass="([^"]+)"/g,
    )) {
      found.add(
        classes
          .split(/\s+/)
          .map((name) => `.${name}`)
          .find((key) => controlRoles.has(key)) ?? classes,
      );
    }
  }
  assert.ok(found.has(".day-cell"), "the scripts render the calendar day cells");
  assert.deepEqual(
    [...found].filter(
      (key) => key !== "PillButton" && !controlRoles.has(key) && !withoutPointerFeedback.has(key),
    ),
    [],
    "each interactive element needs a role entry, or an allowlist reason",
  );
});

test("a control that holds other controls drops its own hover while one of them is under the pointer", async () => {
  const held = new Map();
  for (const { ast } of await landingMarkup()) {
    for (const node of nodesOf(ast)) {
      const key = classesOf(node)
        .map((name) => `.${name}`)
        .find((candidate) => controlRoles.has(candidate));
      if (!key) continue;
      const own = controlRoles.get(key).role === "field" ? new Set(["input"]) : new Set();
      const tags = nodesOf(node)
        .slice(1)
        .filter(isInteractive)
        .map((child) => child.name)
        .filter((tag) => !own.has(tag));
      held.set(key, new Set([...(held.get(key) ?? []), ...tags]));
    }
  }
  assert.ok(held.get(".demo-composer")?.has("button"), "the composer holds its send button");
  for (const [key, tags] of held) {
    assert.deepEqual(
      [...tags].sort(),
      [...(controlRoles.get(key).wraps ?? [])].sort(),
      `${key} lists the controls it holds`,
    );
  }
  for (const [name, control] of controlRoles) {
    for (const tag of control.wraps ?? []) {
      assert.match(
        control.hover,
        new RegExp(`:not\\(.*:has\\(${tag}:hover\\)`),
        `${name} lights while its ${tag} is under the pointer`,
      );
    }
  }
});

test("a disabled control never lights under the pointer or a press", async () => {
  const disabled = new Set();
  for (const { ast } of await landingMarkup()) {
    for (const { key, node } of controlsIn(ast)) {
      if (attributeOf(node, "disabled") || attributeOf(node, "aria-disabled")) disabled.add(key);
    }
  }
  assert.deepEqual([...disabled].sort(), [".calendar-month-title", ".demo-send", "PillButton"]);
  const ENABLED = /:enabled|:not\(:disabled\)|:not\(\[aria-disabled="true"\]\)|\[data-has-text\]/;
  for (const key of disabled) {
    if (key === "PillButton") continue;
    const control = controlRoles.get(key);
    for (const selector of [control.hover, control.press]) {
      assert.match(selector, ENABLED, `${key} lights while disabled: ${selector}`);
    }
  }
  assert.match(
    readFileSync("src/scripts/demo.ts", "utf8"),
    /toggleAttribute\("data-has-text", hasText\);\s*if \(send\) send\.disabled = !hasText;/,
    "the send is enabled exactly when the composer has text",
  );
  const primitive = readFileSync("src/components/PillButton.astro", "utf8");
  for (const variant of ["primary", "secondary", "ghost"]) {
    const classes = primitive.match(new RegExp(`${variant}:\\s*\\n?\\s*"([^"]+)"`))?.[1] ?? "";
    assert.match(classes, /(?:^|\s)not-disabled:hover:bg-/, `${variant} pill hover`);
    assert.match(classes, /(?:^|\s)not-disabled:active:bg-/, `${variant} pill press fill`);
    assert.doesNotMatch(
      classes,
      /(?:^|\s)(?:hover|active):/,
      `${variant} pill lights while disabled`,
    );
  }
});

test("a focus ring keeps 8px from its neighbours: grouped rows inset it and the hero controls reserve it", () => {
  const global = rules.find(
    (rule) => rule.selector === ":focus-visible" && !rule.conditions.length,
  );
  const width = Number.parseFloat(declaration(global.declarations, "outline"));
  const extension = width + Number.parseFloat(declaration(global.declarations, "outline-offset"));
  assert.ok(extension > 0, "the global ring draws outside the control");
  assert.match(
    lastValue(".habit-row[data-habit-toggle]:focus-visible", "outline-offset") ?? "",
    /^-\d+px$/,
  );
  assert.ok(
    Number.parseFloat(lastValue(".hero-controls", "gap")) >= 8 + extension,
    "the downloads toggle ring needs 8px to the hero action fills",
  );
  for (const [selector, property] of [
    [".demo-continue", "gap"],
    [".faq-list p .text-link", "margin-block-start"],
  ]) {
    assert.ok(
      Number.parseFloat(lastValue(selector, property)) >= 8 + extension,
      `${selector}: a text link's ring needs 8px to the sentence beside it`,
    );
  }
});

test("a chip and a day in the dense week row draw their focus ring inside their own box", () => {
  assert.match(lastValue(".demo-chip:focus-visible", "outline-offset") ?? "", /^-\d+px$/);
  assert.equal(
    lastValue(".week-days", "gap"),
    "0",
    "the week row days touch, so no ring may draw outside",
  );
  assert.equal(
    lastValue(".week-days .day-cell:focus-visible", "outline"),
    "2px solid var(--color-fg-1)",
  );
  assert.match(lastValue(".week-days .day-cell:focus-visible", "outline-offset") ?? "", /^-\d+px$/);
  assert.equal(lastValue(".week-days .day-cell:focus-visible .day-cell-circle", "outline"), "none");
});

test("a selected bar and a hovered bar take the canon's selected-bar foreground, never the accent text colour", () => {
  assert.equal(controlRoles.get(".metric-bar-track").markPaint, FG_1);
  assert.deepEqual(
    rules
      .filter((rule) =>
        /(?:^|[;\s])background(?:-color)?\s*:\s*var\(--color-primary-soft\)/.test(
          rule.declarations,
        ),
      )
      .map((rule) => rule.selector),
    [],
    "DESIGN.md keeps --primary-soft for accent text",
  );
});
