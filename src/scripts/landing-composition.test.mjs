import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const componentNames = [
  "Hero",
  "AstraDemo",
  "TrustStrip",
  "Features",
  "FeatureRows",
  "Security",
  "Pricing",
  "Faq",
  "FinalCta",
  "IosWaitlist",
  "Footer",
].filter((name) => existsSync(`src/components/${name}.astro`));
const components = new Map(
  await Promise.all(
    componentNames.map(async (name) => [
      name,
      (await parse(readFileSync(`src/components/${name}.astro`, "utf8"))).ast,
    ]),
  ),
);
const page = (await parse(readFileSync("src/pages/index.astro", "utf8"))).ast;
const copyTables = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: copyTables },
);
function expand(node) {
  const source = components.get(node.name);
  if (source) return expand(source);
  return [{ ...node, children: (node.children ?? []).flatMap(expand) }];
}
function descendants(node) {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}
const nodes = expand(page).flatMap(descendants);
const sections = nodes.filter((node) => attributes(node)["data-section"]);

test("calendar dates and padding cells expose complete weeks for measured composition fitting", async () => {
  const source = readFileSync("src/components/OrbitProduct.astro", "utf8");
  const cells = descendants((await parse(source)).ast).filter((node) =>
    Object.hasOwn(attributes(node), "data-calendar-week"),
  );
  assert.deepEqual(cells.map((node) => node.name).sort(), ["button", "span"]);
  assert.match(source, /cells\.map\(\(day, index\)/);
  for (let index = 0; index < 42; index++) {
    for (const cell of cells) {
      assert.equal(
        vm.runInNewContext(attributes(cell)["data-calendar-week"], { index }),
        Math.floor(index / 7),
      );
    }
  }
});

test("the owning page follows Pierre's section order with Orbit product compositions", () => {
  assert.deepEqual(
    sections
      .filter((node) => node.name === "section")
      .map((node) => attributes(node)["data-section"]),
    ["hero", "trust", "features", "pricing", "ios", "faq", "final"],
  );
  assert.equal(nodes.filter((node) => node.name === "h1").length, 1);
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /Connect/);
});

test("each product surface has one primary intent and the viewport controller arbitrates their accent", () => {
  for (const section of sections) {
    const actions = descendants(section).filter(
      (node) => node.name === "PillButton" && (attributes(node).variant ?? "primary") === "primary",
    );
    assert.ok(actions.length <= (attributes(section)["data-section"] === "hero" ? 2 : 1));
  }
  const demo = descendants(components.get("AstraDemo"));
  const actions = demo.filter((node) => node.name === "PillButton");
  assert.deepEqual(
    actions.map((node) => attributes(node).variant),
    ["ghost", "ghost", "primary"],
  );
});

test("proposal actions keep natural drawn widths and 44px logical height in one trailing row", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const selector = ".demo-preview-actions .pill-sm";
  const pills = rules.filter(([, selectors]) =>
    selectors.split(",").some((s) => s.trim() === selector),
  );
  assert.ok(pills.length > 0);
  let minimum;
  for (const [, , declarations] of pills) {
    const value = declarations.match(/min-inline-size:\s*([^;]+);/)?.[1];
    if (value !== undefined) {
      assert.match(value, /^(?:0|\d+(?:\.\d+)?px)$/);
      minimum = parseFloat(value);
    }
    assert.equal(minimum, 0, `${selector} must keep its natural drawn width`);
    assert.match(declarations, /font-size:\s*var\(--fs-sm\);/);
    assert.doesNotMatch(declarations, /display:\s*none|visibility:\s*hidden|opacity:\s*0\s*;/);
  }
  assert.match(pills[0][2], /flex-shrink:\s*0;/);
  assert.match(pills[0][2], /padding-inline:\s*18px;/);
  assert.match(pills[0][2], /border-radius:\s*var\(--radius-full\);/);
  const height = Number(pills[0][2].match(/(?:^|;)\s*block-size:\s*(\d+)px;/)?.[1]);
  assert.equal(height, 44);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(
    global,
    /\.pill-sm::before\s*\{[^}]*inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/,
  );
  const rows = rules.filter(([, selectors]) => selectors.trim() === ".demo-preview-actions");
  assert.ok(rows.length > 0);
  for (const [, , declarations] of rows) {
    assert.match(declarations, /flex-wrap:\s*nowrap;/);
    assert.match(declarations, /gap:\s*12px;/);
    assert.match(declarations, /justify-content:\s*flex-end;/);
  }
  const row = descendants(components.get("AstraDemo")).find(
    (node) => attributes(node).class === "demo-preview-actions",
  );
  assert.deepEqual(
    descendants(row)
      .filter((node) => node.name === "PillButton")
      .map((node) => attributes(node).id),
    ["demo-reject", "demo-edit", "demo-approve"],
  );
});

test("sibling small-pill rows stay within the audited proposal and consent actions", async () => {
  const rows = [];
  for (const directory of ["src/components", "src/pages"]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".astro"))) {
      const { ast } = await parse(readFileSync(`${directory}/${file}`, "utf8"));
      for (const node of descendants(ast)) {
        const pills = (node.children ?? []).filter(
          (child) => child.name === "PillButton" && (attributes(child).size ?? "sm") === "sm",
        );
        if (pills.length < 2) continue;
        rows.push({
          file,
          className: attributes(node).class,
          labels: pills.map(
            (pill) =>
              descendants(pill)
                .find((child) => attributes(child)["data-i18n"])
                .attributes.find(({ name }) => name === "data-i18n").value,
          ),
        });
      }
    }
  }
  assert.deepEqual(rows, [
    {
      file: "AstraDemo.astro",
      className: "demo-preview-actions",
      labels: ["demo.reject", "demo.edit", "demo.approve"],
    },
    {
      file: "ConsentBanner.astro",
      className: "flex shrink-0 gap-3",
      labels: ["consent.decline", "consent.accept"],
    },
  ]);
});

test("pricing actions stay at the bottom independently of list length and hug their labels", () => {
  const plans = descendants(components.get("Pricing")).filter((node) => node.name === "article");
  assert.equal(plans.length, 2);
  for (const plan of plans) {
    const children = plan.children.filter((node) => node.name);
    const action = children.at(-1);
    assert.equal(attributes(action).class, "plan-action");
    assert.equal(descendants(action).filter((node) => node.name === "PillButton").length, 1);
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  const card = css.match(/\.plan-card\s*\{([^}]+)\}/)[1];
  assert.match(card, /display:\s*flex/);
  assert.match(card, /flex-direction:\s*column/);
  assert.match(card, /align-items:\s*flex-start/);
  assert.doesNotMatch(card, /grid-template-rows:/);
  assert.match(css, /\.plan-action\s*\{[^}]*margin-block-start:\s*auto/);
  assert.doesNotMatch(css, /\.plan-(?:card|action)[^{]*\{[^}]*inline-size:\s*100%/);
});

test("the hero keeps copy and actions above the centered device", () => {
  const hero = sections[0];
  assert.deepEqual(
    hero.children.filter((node) => node.name === "div").map((node) => attributes(node).class),
    ["hero-copy", "hero-controls", "hero-pin-range"],
  );
  const stage = descendants(hero).find((node) => attributes(node).id === "hero-stage");
  assert.ok(descendants(stage).some((node) => attributes(node).class === "hero-device"));
  assert.equal(
    descendants(stage).filter((node) => Object.hasOwn(attributes(node), "data-hero-float")).length,
    4,
  );
});

test("native FAQ disclosure and the original waitlist entry remain reachable", () => {
  const faq = components.get("Faq");
  assert.ok(
    descendants(faq).some(
      (node) => node.name === "details" && attributes(node).name === "orbit-questions",
    ),
  );
  assert.ok(
    nodes.some((node) => attributes(node).id === "ios-trigger" && attributes(node).href === "#ios"),
  );
});

test("FAQ disclosure updates aria-expanded and controls its own answer without replacing native behavior", () => {
  const faq = descendants(components.get("Faq"));
  const summary = faq.find((node) => node.name === "summary");
  const answer = faq.find((node) => node.name === "p");
  assert.equal(attributes(summary)["aria-expanded"], "false");
  assert.equal(attributes(summary)["aria-controls"], attributes(answer).id);
  const chevron = faq.find((node) => node.name === "ChevronDown");
  assert.equal(attributes(chevron).size, "16");
  assert.equal(attributes(chevron)["aria-hidden"], "true");
  const source = readFileSync("src/components/Faq.astro", "utf8");
  const keys = vm.runInNewContext(source.match(/const questions = (\[[^\]]+\])/)[1]);
  const code = ts.transpileModule(readFileSync("src/scripts/faq.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const entry = readFileSync("src/pages/index.astro", "utf8");
  assert.match(entry, /import "\.\.\/scripts\/faq"/);
  for (const initiallyOpen of [false, true]) {
    const items = keys.map((key, index) => {
      const control = {
        attributes: {
          "aria-expanded": "false",
          "aria-controls": vm.runInNewContext(attributes(summary)["aria-controls"], { key }),
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
      const listeners = new Map();
      return {
        open: initiallyOpen && index === 0,
        control,
        listeners,
        answerId: vm.runInNewContext(attributes(answer).id, { key }),
        querySelector(selector) {
          assert.equal(selector, "summary");
          return control;
        },
        addEventListener(name, callback) {
          listeners.set(name, callback);
        },
      };
    });
    vm.runInNewContext(code, {
      document: {
        querySelectorAll(selector) {
          assert.equal(selector, ".faq-list details");
          return items;
        },
      },
    });
    assert.equal(new Set(items.map((item) => item.answerId)).size, keys.length);
    for (const item of items) {
      assert.equal(item.control.attributes["aria-controls"], item.answerId);
      assert.equal(item.control.attributes["aria-expanded"], String(item.open));
      assert.deepEqual([...item.listeners.keys()], ["toggle"]);
      for (const open of [true, false]) {
        item.open = open;
        item.listeners.get("toggle")();
        assert.equal(item.control.attributes["aria-expanded"], String(open));
      }
    }
  }
});

test("the header opens Orbit while the hero has only its install action", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  const action = descendants(header).find((node) => node.name === "PillButton");
  assert.equal(attributes(action).href, "appUrl");
  assert.equal(attributes(action).variant, "secondary");
  assert.equal(attributes(action).analyticsEvent, "header_app_cta_clicked");
  assert.equal(
    descendants(sections[0]).filter(
      (node) => node.name === "a" && attributes(node).id !== "demo-continue-link",
    ).length,
    0,
  );
  for (const name of ["Faq", "FinalCta"]) {
    assert.ok(descendants(components.get(name)).some((node) => attributes(node).href === "#ios"));
  }
});

test("the trust strip keeps three compact values and hides captions below 618px", () => {
  const trust = descendants(components.get("TrustStrip"));
  assert.equal(trust.filter((node) => node.name === "dt").length, 3);
  assert.equal(trust.filter((node) => node.name === "dd").length, 3);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.trust-content\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*gap:\s*12px/,
  );
  const compact = css.slice(
    css.indexOf("@media (width < 38.625rem)"),
    css.indexOf("@media (width < 30rem)"),
  );
  assert.match(compact, /\.trust-fact dd\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(compact, /\.trust-content/);
  const stacked = css.slice(css.indexOf("@media (width < 30rem)"));
  assert.match(
    stacked,
    /\.trust-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*justify-items:\s*center;[^}]*gap:\s*12px/,
  );
  assert.match(
    css,
    /@media \(max-width: 39.999rem\)\s*\{\s*\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-sm\)/,
  );
  assert.doesNotMatch(css, /@media \(max-width: 24.999rem\)[^{]*\{\s*\.trust-fact dt/);
});

test("the trust strip renders the approved checkable facts in both locales", () => {
  const trust = descendants(components.get("TrustStrip"));
  for (const name of [
    "trust.free.title",
    "trust.free.caption",
    "trust.approval.title",
    "trust.approval.caption",
    "trust.platforms.caption",
  ]) {
    assert.ok(trust.some((node) => node.name === "Copy" && attributes(node).name === name));
  }
  assert.ok(trust.some((node) => attributes(node)["data-i18n"] === "hero.platforms"));
  for (const [lang, expected] of [
    [
      "en",
      [
        "Free plan",
        "Pro free for 7 days",
        "You approve",
        "every change first",
        "Android and web",
        "iPhone waitlist open",
      ],
    ],
    [
      "pt-BR",
      [
        "Plano grátis",
        "Pro grátis por 7 dias",
        "Você aprova",
        "cada mudança antes",
        "Android e web",
        "Lista de espera do iPhone aberta",
      ],
    ],
  ]) {
    const copy = { ...copyTables.translations[lang], ...copyTables.landingCopy[lang] };
    assert.deepEqual(
      [
        "trust.free.title",
        "trust.free.caption",
        "trust.approval.title",
        "trust.approval.caption",
        "hero.platforms",
        "trust.platforms.caption",
      ].map((key) => copy[key]),
      expected,
    );
  }
});

test("How it works lands on the feature grid at the retained 96px offset", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  assert.ok(descendants(header).some((node) => attributes(node).href === "#features"));
  assert.equal(attributes(sections[2]).id, "features");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /scroll-margin-block-start:\s*96px/);
});

test("the recommended plan keeps its canonical inset ring and selected tint", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.plan-pro\s*\{[^}]*background:\s*var\(--color-primary-dim\);[^}]*box-shadow:\s*inset 0 0 0 1\.5px var\(--color-primary\)/,
  );
});

test("every section shares one heading scale and at most one supporting paragraph", () => {
  for (const section of sections) {
    if (["hero", "trust", "footer"].includes(attributes(section)["data-section"])) continue;
    const heading = descendants(section).find((node) =>
      ["section-heading", "feature-intro"].includes(attributes(node).class),
    );
    assert.ok(heading);
    assert.ok(descendants(heading).filter((node) => node.name === "p").length <= 1);
    assert.equal(
      descendants(heading).filter((node) => node.name === "h2" || node.name === "SentenceTitle")
        .length,
      1,
    );
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.section-title\s*\{[^}]*text-wrap:\s*balance/);
  assert.match(css, /\.section-description\s*\{[^}]*text-wrap:\s*pretty/);
  assert.doesNotMatch(css, /\.feature-copy \.section-title/);
});

function billingHarness(language = "en") {
  const pricing = descendants(components.get("Pricing"));
  const group = pricing.find((node) => attributes(node).role === "radiogroup");
  const element = (node) => {
    const attrs = attributes(node);
    const listeners = new Map();
    return {
      attributes: attrs,
      dataset: Object.fromEntries(
        Object.entries(attrs)
          .filter(([name]) => name.startsWith("data-"))
          .map(([name, value]) => [
            name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ]),
      ),
      textContent: "",
      hidden: Object.hasOwn(attrs, "hidden"),
      tabIndex: Number(attrs.tabindex),
      focused: false,
      closest() {
        return null;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      click() {
        listeners.get("click")();
      },
      focus() {
        this.focused = true;
      },
      key(key) {
        const event = {
          key,
          prevented: false,
          preventDefault() {
            this.prevented = true;
          },
        };
        listeners.get("keydown")(event);
        return event;
      },
    };
  };
  const options = descendants(group)
    .filter((node) => attributes(node).role === "radio")
    .map(element);
  const fields = Object.fromEntries(
    [
      "data-pro-price",
      "data-annual-saving",
      "data-billed-total",
      "data-billing-saving",
      "data-billing-monthly-price",
      "data-plan-recommendation",
    ].map((name) => [name, element(pricing.find((node) => Object.hasOwn(attributes(node), name)))]),
  );
  const free = element(pricing.find((node) => attributes(node)["data-price"] === "free"));
  const translated = pricing.filter((node) => attributes(node)["data-i18n"]).map(element);
  const copied = pricing
    .filter((node) => node.name === "Copy")
    .map((node) => {
      const field = element(node);
      field.dataset.copyEn = copyTables.landingCopy.en[attributes(node).name];
      field.dataset.copyPt = copyTables.landingCopy["pt-BR"][attributes(node).name];
      return field;
    });
  const listeners = new Map();
  const toggle = {
    addEventListener: (name, callback) => listeners.set(`toggle:${name}`, callback),
    setAttribute() {},
  };
  const document = {
    cookie: `orbit_lang=${language}`,
    documentElement: {},
    getElementById: (id) => (id === "lang-toggle" ? toggle : null),
    querySelectorAll: (selector) =>
      ({
        "[data-price]": [free],
        "[data-i18n]": translated,
        "[data-copy-en]": copied,
      })[selector] ?? [],
    querySelector(selector) {
      if (selector === "[data-billing-control]") return { querySelectorAll: () => options };
      return fields[selector.slice(1, -1)] ?? null;
    },
  };
  const context = vm.createContext({
    document,
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      dispatchEvent: (event) => listeners.get(event.type)?.(),
    },
    navigator: { language: language === "pt-BR" ? "pt-BR" : "en-US" },
    environment: { DEV: false },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    Intl,
  });
  const modules = new Map();
  function require(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(
      readFileSync(`src/scripts/${path}.ts`, "utf8").replaceAll("import.meta.env", "environment"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
    modules.set(path, exports);
    return exports;
  }
  const prices = require("../config/pricing");
  const { landingCopy } = require("../i18n/translations");
  for (const field of Object.values(fields)) {
    for (const [name, value] of Object.entries(field.dataset)) {
      if (value.startsWith("landingCopy"))
        field.dataset[name] = vm.runInNewContext(value, { landingCopy });
    }
  }
  require("./i18n");
  require("./pricing");
  return {
    options,
    fields,
    free,
    prices,
    landingCopy,
    translated,
    copied,
    changeLanguage(language) {
      while (document.documentElement.lang !== language) listeners.get("toggle:click")();
    },
  };
}

test("the free plan title and all plan mentions follow the actual language toggle", () => {
  const h = billingHarness();
  const title = h.translated.find((field) => field.getAttribute("data-i18n") === "plan.free");
  assert.ok(title, "the free plan heading must use a localized plan name");
  const description = h.copied.find((field) => field.attributes.name === "pricing.body");
  const caption = h.copied.find((field) => field.attributes.name === "trust.free");
  for (const language of ["en", "pt-BR", "en"]) {
    h.changeLanguage(language);
    assert.equal(title.textContent, language === "pt-BR" ? "Grátis" : "Free");
    assert.equal(
      caption.textContent,
      language === "pt-BR" ? "Comece no plano grátis" : "Start with Free",
    );
    assert.equal(
      description.textContent,
      language === "pt-BR"
        ? "O plano anual sai mais barato por dia."
        : "Pay less each day with Yearly.",
    );
  }
  for (const table of [copyTables.translations["pt-BR"], copyTables.landingCopy["pt-BR"]]) {
    for (const [key, value] of Object.entries(table)) assert.doesNotMatch(value, /\bFree\b/u, key);
  }
});

test("localized application offers use the same free plan name", () => {
  const h = billingHarness();
  assert.equal(h.prices.offersFor("en")[0].name, "Orbit Free");
  assert.equal(h.prices.offersFor("pt-BR")[0].name, "Orbit Grátis");
});

test("billing arrows wrap selection and focus, Home and End select endpoints, and Tab stays native", () => {
  const h = billingHarness();
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    h.options[0].click();
    assert.equal(h.options[0].key(key).prevented, true);
    assert.equal(h.options[1].attributes["aria-checked"], "true");
    assert.equal(h.options[1].focused, true);
    assert.equal(h.options[1].tabIndex, 0);
    assert.equal(h.options[0].tabIndex, -1);
    assert.equal(h.options[1].key(key).prevented, true);
    assert.equal(h.options[0].attributes["aria-checked"], "true");
    assert.equal(h.options[0].focused, true);
  }
  h.options[0].key("End");
  assert.equal(h.options[1].attributes["aria-checked"], "true");
  h.options[1].key("Home");
  assert.equal(h.options[0].attributes["aria-checked"], "true");
  assert.equal(h.options[0].key("Tab").prevented, false);
});

test("Astra examples expose selectable bars, a static breakdown and a derived goal", async () => {
  const source = readFileSync("src/components/AstraBlock.astro", "utf8");
  const block = descendants((await parse(source)).ast);
  assert.match(source, /kind === "metrics"/);
  assert.match(source, /kind === "breakdown"/);
  assert.match(source, /kind === "goal"/);
  assert.ok(block.some((node) => attributes(node).class === "metric-readout"));
  assert.ok(!block.some((node) => node.name === "input" && attributes(node).type === "range"));
  const chart = block.find((node) => attributes(node).class === "metric-bars");
  assert.equal(attributes(chart).role, 'interactive ? "radiogroup" : undefined');
  const option = descendants(chart).find((node) => node.name === "button");
  assert.ok(option, "each bar is its own selectable control");
  assert.equal(attributes(option).role, "radio");
  assert.equal(attributes(option)["aria-checked"], "index === exampleWeek.length - 1");
  assert.equal(attributes(option).tabindex, "index === exampleWeek.length - 1 ? 0 : -1");
  assert.match(source, /blocks.metrics.date0[\s\S]*blocks.metrics.date6/);
  assert.match(source, /blocks.metrics.completion/);
  assert.match(source, /blocks.metrics.active/);
  assert.doesNotMatch(source, /frequency-control|breakdown-approve|breakdown-reset/);
  assert.match(source, /blocks.goal.derived/);
  assert.match(source, /exampleGoal\.habits\.map/);
  assert.ok(block.some((node) => attributes(node).role === "progressbar"));
});

test("example figures derive from the chart and linked habit fixtures", () => {
  const fixture = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/config/product-examples.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports: fixture },
  );
  assert.equal(fixture.exampleWeek.length, 7);
  assert.equal(Math.round(fixture.exampleWeek.reduce((sum, point) => sum + point, 0) / 7), 78);
  assert.equal(fixture.exampleWeek.filter((value) => value > 0).length, 6);
  assert.equal(
    fixture.exampleGoal.progress,
    Math.min(...fixture.exampleGoal.habits.map((habit) => habit.streak)),
  );
  assert.equal(fixture.exampleGoal.progress, 9);
  assert.equal(fixture.exampleGoal.target, 30);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.metric-bar\s*\{[^}]*background:\s*var\(--color-fg-2\)/);
  assert.match(css, /\.goal-progress-fill\s*\{[^}]*background:\s*var\(--color-primary\)/);
  assert.doesNotMatch(css, /\.(?:astra-product|product-block|metric-|goal-)[^{]*\{[^}]*scale\(/);
});

async function metricsHarness() {
  const source = readFileSync("src/components/AstraBlock.astro", "utf8");
  const ast = descendants((await parse(source)).ast);
  const fixture = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/config/product-examples.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports: fixture },
  );
  const frontmatter = {};
  vm.runInNewContext(
    ts.transpileModule(
      `${source.split("---")[1]}\nexports.context = { exampleWeek, exampleDays, dateKeys, doneLabel, landingCopy };`,
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports: frontmatter,
      Astro: { props: { kind: "metrics", interactive: true } },
      require(path) {
        if (path === "../config/product-examples") return fixture;
        if (path === "../i18n/translations") return copyTables;
        return {};
      },
    },
  );
  const producer = frontmatter.context;
  const option = ast.find((node) => node.name === "button" && attributes(node).role === "radio");
  assert.ok(option, "the actual producer must render a radio for each chart day");
  const readoutNode = ast.find((node) => Object.hasOwn(attributes(node), "data-metric-readout"));
  const create = (node, index) => {
    const attrs = Object.fromEntries(
      node.attributes.map(({ name, value, kind }) => [
        name,
        kind === "expression"
          ? String(
              vm.runInNewContext(value, { ...producer, index, value: fixture.exampleWeek[index] }),
            )
          : value,
      ]),
    );
    const listeners = new Map();
    return {
      attrs,
      dataset: Object.fromEntries(
        Object.entries(attrs)
          .filter(([key]) => key.startsWith("data-"))
          .map(([key, value]) => [
            key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()),
            value,
          ]),
      ),
      hidden: false,
      tabIndex: Number(attrs.tabindex),
      focused: false,
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
      getAttribute(key) {
        return this.attrs[key];
      },
      addEventListener(key, callback) {
        listeners.set(key, callback);
      },
      click() {
        listeners.get("click")();
      },
      focus() {
        this.focused = true;
      },
      key(key) {
        let prevented = false;
        listeners.get("keydown")({
          key,
          preventDefault() {
            prevented = true;
          },
        });
        return prevented;
      },
    };
  };
  const bars = fixture.exampleWeek.map(() => ({
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
  }));
  const days = fixture.exampleWeek.map((_, index) => ({
    ...create(option, index),
    querySelector: () => bars[index],
  }));
  const readouts = fixture.exampleWeek.map((_, index) => create(readoutNode, index));
  const readout = { style: {}, offsetWidth: 128, offsetHeight: 64 };
  const chart = { clientWidth: 384 };
  const block = {
    querySelector: (selector) =>
      ({ "[data-metric-chart]": chart, ".metric-readout": readout })[selector],
    querySelectorAll: (selector) =>
      ({ "[data-metric-day]": days, "[data-metric-readout]": readouts })[selector] ?? [],
  };
  const resize = (width) => {
    chart.clientWidth = width;
    const columns = Number(
      readFileSync("src/styles/landing.css", "utf8").match(
        /\.metric-bars\s*\{[^}]*repeat\((\d+),/,
      )[1],
    );
    const columnWidth = (width - (columns - 1) * 8) / columns;
    days.forEach((day, index) => {
      day.offsetLeft = (index % columns) * (columnWidth + 8);
      day.offsetWidth = columnWidth;
      day.offsetTop = 96 + Math.floor(index / columns) * 224;
      bars[index].offsetTop =
        day.offsetTop + 128 - Math.max(4, (fixture.exampleWeek[index] / 100) * 128);
    });
  };
  resize(384);
  const events = new Map();
  let observer;
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/product-examples.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      document: {
        querySelector: () => null,
        querySelectorAll: (selector) =>
          selector === '[data-example-block="metrics"]' ? [block] : [],
      },
      window: { addEventListener: (name, callback) => events.set(name, callback) },
      require: () => ({ getLang: () => "en" }),
      ResizeObserver: class {
        constructor(callback) {
          observer = callback;
        }
        observe(element) {
          assert.equal(element, chart);
        }
      },
    },
  );
  return {
    days,
    bars,
    readouts,
    readout,
    fixture,
    producer,
    events,
    resize(width) {
      resize(width);
      observer();
    },
  };
}

test("chart bars select days by click and keyboard with one tab stop, a clamped moving readout and localized counts", async () => {
  const h = await metricsHarness();
  const assertSelection = (index) => {
    assert.deepEqual(
      h.days.map((day) => day.attrs["aria-checked"]),
      h.days.map((_, n) => String(n === index)),
    );
    assert.deepEqual(
      h.days.map((day) => day.tabIndex),
      h.days.map((_, n) => (n === index ? 0 : -1)),
    );
    assert.deepEqual(
      h.bars.map((bar) => bar.attrs["data-selected"]),
      h.days.map((_, n) => String(n === index)),
    );
    assert.deepEqual(
      h.readouts.map((item) => item.hidden),
      h.days.map((_, n) => n !== index),
    );
  };
  assertSelection(6);
  assert.equal(h.readout.style.left, "256px");
  for (const language of ["en", "pt-BR"]) {
    for (const [index, day] of h.days.entries()) {
      day.click();
      assertSelection(index);
      const count = h.producer.doneLabel(language, index);
      const label = day.dataset[language === "en" ? "copyLabelEn" : "copyLabelPt"];
      assert.ok(label.includes(count));
      assert.ok(label.includes(`${h.fixture.exampleWeek[index]}%`));
      assert.ok(label.includes(copyTables.landingCopy[language][`blocks.metrics.date${index}`]));
      h.events.get("orbit:language-changed")();
      assertSelection(index);
    }
  }
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
    const forward = key === "ArrowRight" || key === "ArrowDown";
    const start = forward ? 6 : 0;
    const target = forward ? 0 : 6;
    h.days[start].click();
    assert.equal(h.days[start].key(key), true);
    assertSelection(target);
    assert.equal(h.days[target].focused, true);
  }
  h.days[6].key("Home");
  assertSelection(0);
  h.days[0].key("End");
  assertSelection(6);
  assert.equal(h.days[6].key("Tab"), false);
  assertSelection(6);
  h.days[3].click();
  assert.equal(h.readout.style.left, "128px");
  h.days[0].click();
  assert.equal(h.readout.style.left, "0px");
  h.days[6].click();
  h.resize(240);
  assert.equal(h.readout.style.left, "112px");
  assert.equal(h.readout.style.top, "24px");
  assertSelection(6);
  h.days[3].click();
  assert.equal(h.readout.style.left, "56px");
  assert.equal(h.readout.style.top, "148px");
});

test("chart targets fill their columns, empty days keep a stub and reduced motion freezes the readout", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /button\.metric-bar-track\s*\{[^}]*min-inline-size:\s*0/);
  assert.match(css, /\.metric-bar-track\s*\{[^}]*block-size:\s*128px/);
  assert.match(css, /\.metric-bar\s*\{[^}]*min-block-size:\s*4px/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.metric-readout\s*\{[^}]*transition:\s*left/,
  );
});

test("every translation key has a source consumer and retired copy is removed", () => {
  const files = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? files(path) : [path];
    });
  const source = files("src")
    .filter((path) => /\.(?:astro|ts)$/.test(path) && !path.endsWith("translations.ts"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const patterns = [...source.matchAll(/`([^`]+)`/g)].map(([, value]) => {
    const segments = value.split(/\$\{[^}]+\}/);
    return new RegExp(
      `^${segments.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\w]+")}$`,
    );
  });
  for (const table of [copyTables.translations.en, copyTables.landingCopy.en]) {
    for (const key of Object.keys(table)) {
      assert.ok(
        source.includes(key) || patterns.some((pattern) => pattern.test(key)),
        `unused translation: ${key}`,
      );
      assert.doesNotMatch(
        key,
        /^features\.(?:remember|act|restart)\.|^security\.|^remember\.|^understand\.|^restart\.|^blocks\.habits\./,
      );
    }
  }
});

test("every billing period shows its configured daily price and actual billed total", () => {
  const h = billingHarness();
  for (const [language, yearly, monthly, totalYearly, totalMonthly] of [
    ["en", "$0.19/day", "$0.33/day", "$69.99 billed yearly", "$9.99 billed monthly"],
    ["pt-BR", "R$ 0,55/dia", "R$ 1,00/dia", "R$ 199 cobrados por ano", "R$ 29,90 cobrados por mês"],
  ]) {
    h.changeLanguage(language);
    assert.equal(h.prices.pricingFor(language, "yearly").primary, yearly);
    assert.equal(h.prices.pricingFor(language, "monthly").primary, monthly);
    h.options[0].click();
    assert.equal(h.fields["data-pro-price"].textContent, yearly);
    assert.equal(h.fields["data-billed-total"].textContent, totalYearly);
    h.options[1].click();
    assert.equal(h.fields["data-pro-price"].textContent, monthly);
    assert.equal(h.fields["data-billed-total"].textContent, totalMonthly);
    assert.equal(h.fields["data-billed-total"].hidden, false);
    assert.equal(h.fields["data-billing-monthly-price"].textContent, monthly);
    assert.equal(
      h.fields["data-billing-saving"].textContent,
      h.prices.pricingFor(language, "yearly").saving,
    );
    assert.equal(h.fields["data-plan-recommendation"].hidden, true);
    h.options[0].click();
    assert.equal(h.fields["data-plan-recommendation"].hidden, false);
  }
  const source = readFileSync("src/config/pricing.ts", "utf8");
  assert.match(source, /plan\.monthly \/ 30 \/ 100/);
  assert.match(source, /plan\.yearly \/ 365 \/ 100/);
  const options = descendants(components.get("Pricing")).filter(
    (node) => attributes(node).role === "radio",
  );
  assert.equal(attributes(options[0])["data-billing-period"], "yearly");
  assert.equal(attributes(options[0])["aria-checked"], "true");
  assert.ok(
    descendants(options[0]).some((node) => attributes(node).name === "pricing.recommended"),
  );
  assert.ok(
    descendants(options[0]).some((node) => Object.hasOwn(attributes(node), "data-billing-saving")),
  );
  assert.match(readFileSync("src/components/Pricing.astro", "utf8"), /data-plan-recommendation/);
});

test("billing options are compact single-line pills with Yearly recommended and selected first", () => {
  const group = descendants(components.get("Pricing")).find(
    (node) => attributes(node).role === "radiogroup",
  );
  const options = descendants(group).filter((node) => attributes(node).role === "radio");
  assert.deepEqual(
    options.map((node) => attributes(node)["data-billing-period"]),
    ["yearly", "monthly"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node)["aria-checked"]),
    ["true", "false"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node).tabindex),
    ["0", "-1"],
  );
  assert.ok(
    descendants(options[0]).some((node) => attributes(node).class === "billing-recommendation"),
  );
  assert.ok(
    descendants(options[1]).some((node) =>
      Object.hasOwn(attributes(node), "data-billing-monthly-price"),
    ),
  );
  const css = readFileSync("src/styles/landing.css", "utf8");
  const optionRules = [...css.matchAll(/(?:^|\n)\.billing-option\s*\{([^}]+)\}/g)];
  assert.equal(optionRules.length, 1);
  const rule = optionRules[0][1];
  assert.match(rule, /display:\s*flex/);
  assert.match(rule, /min-block-size:\s*56px/);
  assert.match(rule, /border-radius:\s*var\(--radius-full\)/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.doesNotMatch(rule, /flex-wrap:\s*wrap|flex-direction:\s*column/);
  assert.match(
    css,
    /\.billing-option\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--color-primary-dim\);[^}]*box-shadow:\s*inset 0 0 0 1\.5px var\(--color-primary\)/,
  );
  assert.match(css, /\.billing-recommendation\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/);
});

test("the footer groups product and legal links with its own QR and no source-code link", () => {
  const footer = readFileSync("src/components/FinalCta.astro", "utf8");
  assert.doesNotMatch(footer, /footer\.source|github\.com|Source code|Código-fonte/);
  for (const key of [
    "footer.description",
    "footer.product",
    "footer.legal",
    "footer.android",
    "footer.cookies",
    "footer.controller",
    "footer.qr",
  ])
    assert.ok(footer.includes(key));
  assert.match(footer, /href="#ios"/);
  assert.match(footer, /src="\/orbit-install-qr.svg"/);
});

test("the closing call to action centers its column and label-hugging button at every width", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  for (const selector of ["\\.closing-copy", "\\.closing-copy \\.section-heading"]) {
    const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, "g"))];
    assert.ok(rules.length);
    for (const [, declarations] of rules) {
      assert.match(declarations, /justify-items:\s*center/);
      assert.match(declarations, /text-align:\s*center/);
    }
  }
  assert.match(css, /\.section-title\s*\{[^}]*max-inline-size:\s*23ch/);
  assert.match(css, /\.section-description\s*\{[^}]*max-inline-size:\s*55ch/);
  const closing = descendants(components.get("FinalCta")).find(
    (node) => attributes(node).class === "closing-copy",
  );
  const action = closing.children.find((node) => node.name === "PillButton");
  assert.ok(action);
  assert.equal(attributes(action).class, undefined);
});

test("all app and install links and QR generation share environment-backed production defaults", async () => {
  const linkSource = readFileSync("src/config/links.ts", "utf8");
  function links(environment) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(linkSource.replaceAll("import.meta.env", "environment"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      { exports, environment },
    );
    return exports;
  }
  assert.equal(links({}).appUrl, "https://app.useorbit.org");
  assert.equal(
    links({}).googlePlayUrl,
    "https://play.google.com/store/apps/details?id=org.useorbit.app",
  );
  const staging = {
    PUBLIC_APP_URL: "https://app-staging.useorbit.org",
    PUBLIC_ANDROID_INSTALL_URL:
      "https://play.google.com/store/apps/details?id=org.useorbit.app.staging",
  };
  assert.equal(links(staging).appUrl, staging.PUBLIC_APP_URL);
  assert.equal(links(staging).googlePlayUrl, staging.PUBLIC_ANDROID_INSTALL_URL);
  for (const path of [
    "src/layouts/Layout.astro",
    "src/pages/index.astro",
    "src/pages/waitlist-confirmed.astro",
    "src/pages/orbit-install-qr.svg.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /from "\.\.\/config\/links"/);
    assert.doesNotMatch(source, /https:\/\/(?:app\.useorbit|play\.google)/);
  }
  const { default: qrcode } = await import("qrcode-generator");
  const endpoint = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/pages/orbit-install-qr.svg.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: endpoint,
      Response,
      require: (path) => (path === "qrcode-generator" ? { default: qrcode } : links(staging)),
    },
  );
  const expected = qrcode(0, "H");
  expected.addData(staging.PUBLIC_ANDROID_INSTALL_URL);
  expected.make();
  assert.equal(
    await endpoint.GET().text(),
    expected.createSvgTag({ cellSize: 4, margin: 16, scalable: true }),
  );
  const workflow = readFileSync(".github/workflows/release.yml", "utf8").split("  staging:")[1];
  assert.ok(workflow.includes(staging.PUBLIC_APP_URL));
  assert.ok(workflow.includes(staging.PUBLIC_ANDROID_INSTALL_URL));
  assert.match(workflow, /buildVariables/);
});

test("every current copy key has locale parity", () => {
  for (const table of [copyTables.translations, copyTables.landingCopy])
    assert.deepEqual(Object.keys(table.en).sort(), Object.keys(table["pt-BR"]).sort());
});

async function reachFeaturesWithoutPhone(loadProductExamples) {
  const featureSection = sections.find((node) => attributes(node)["data-section"] === "features");
  assert.ok(featureSection);
  const targets = [
    { matches: (selector) => selector === ".hero-device" },
    {
      matches: (selector) =>
        selector === `[data-section="${attributes(featureSection)["data-section"]}"]`,
    },
  ];
  const matches = (target, selector) =>
    selector.split(",").some((part) => target.matches(part.trim()));
  const observers = [];
  const imports = [];
  const script = readFileSync("src/pages/index.astro", "utf8").match(
    /<script>([\s\S]*?)<\/script>/,
  )[1];
  vm.runInNewContext(
    ts.transpileModule(script, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      document: {
        querySelector: (selector) => targets.find((target) => matches(target, selector)) ?? null,
        querySelectorAll: (selector) => targets.filter((target) => matches(target, selector)),
      },
      IntersectionObserver: class {
        observed = new Set();
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }
        observe(target) {
          this.observed.add(target);
        }
        unobserve(target) {
          this.observed.delete(target);
        }
        disconnect() {
          this.observed.clear();
        }
      },
      require(path) {
        imports.push(path);
        if (path === "../scripts/product-examples") loadProductExamples();
        return {};
      },
    },
  );
  assert.ok(!imports.includes("../scripts/product-examples"), "product previews stay deferred");
  for (const observer of observers) {
    observer.callback(
      [...observer.observed].map((target) => ({ target, isIntersecting: target === targets[1] })),
    );
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(
    imports.includes("../scripts/product-examples"),
    "reaching features must load their controls without the hero ever intersecting",
  );
  assert.ok(!imports.includes("../scripts/demo"), "the offscreen phone demo stays deferred");
}

test("habit checks, week bars, calendar days and data previews work when features are reached without the phone", async () => {
  const item = (extra = {}) => ({
    hidden: false,
    dataset: {},
    attrs: {},
    listeners: new Map(),
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name];
    },
    removeAttribute(name) {
      if (name === "hidden") this.hidden = false;
    },
    click() {
      this.listeners.get("click")();
    },
    ...extra,
  });
  const ring = {
    classList: {
      toggle(_name, value) {
        this.done = value;
      },
    },
  };
  const habit = item({ querySelector: () => ring });
  const weekDays = [0, 1].map((index) => item({ dataset: { weekDay: String(index) } }));
  const weekReadouts = [0, 1].map((index) => item({ dataset: { weekReadout: String(index) } }));
  const week = item({
    querySelectorAll: () => weekDays,
    closest: () => ({ querySelectorAll: () => weekReadouts }),
  });
  const dates = [17, 18].map((day) =>
    item({
      dataset: { calendarDay: String(day), copyLabelEn: `Day ${day}`, copyLabelPt: `Dia ${day}` },
    }),
  );
  const dayReadout = item(),
    calendarEvents = item();
  const calendar = item({
    querySelectorAll: () => dates,
    querySelector: (selector) =>
      selector === "[data-calendar-readout]" ? dayReadout : calendarEvents,
  });
  const panels = new Map([
    ["export-example", item()],
    ["delete-example", item()],
  ]);
  const privacy = ["export-example", "delete-example"].map((id) =>
    item({ dataset: { privacyToggle: id } }),
  );
  const cancel = item(),
    confirm = item(),
    actions = item(),
    deleted = item({ hidden: true });
  const querySelector = (selector) =>
    ({
      "[data-delete-cancel]": cancel,
      "[data-delete-example]": confirm,
      "[data-delete-result]": deleted,
      ".privacy-actions": actions,
      '[data-privacy-toggle="delete-example"]': privacy[1],
    })[selector] ?? null;
  await reachFeaturesWithoutPhone(() => {
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/product-examples.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports: {},
        require: () => ({}),
        window: { addEventListener() {}, dispatchEvent() {} },
        CustomEvent: class {},
        document: {
          documentElement: { lang: "pt-BR" },
          getElementById: (id) => panels.get(id),
          querySelector,
          querySelectorAll: (selector) =>
            ({
              "[data-week-chart]": [week],
              "[data-habit-toggle]": [habit],
              ".orbit-calendar": [calendar],
              "[data-privacy-toggle]": privacy,
            })[selector] ?? [],
        },
      },
    );
  });
  habit.click();
  assert.equal(habit.attrs["aria-pressed"], "true");
  assert.equal(ring.classList.done, true);
  habit.click();
  assert.equal(ring.classList.done, false);
  weekDays[0].click();
  assert.equal(weekReadouts[0].hidden, false);
  assert.equal(weekReadouts[1].hidden, true);
  assert.equal(weekDays[1].attrs["aria-pressed"], "false");
  dates[1].click();
  assert.equal(dayReadout.textContent, "Dia 18");
  assert.equal(calendarEvents.hidden, true);
  dates[0].click();
  assert.equal(calendarEvents.hidden, false);
  privacy[0].click();
  assert.equal(panels.get("export-example").hidden, true);
  privacy[0].click();
  assert.equal(panels.get("export-example").hidden, false);
  cancel.click();
  assert.equal(panels.get("delete-example").hidden, true);
  privacy[1].click();
  confirm.click();
  assert.equal(deleted.hidden, false);
  assert.equal(actions.hidden, true);
});

test("the language toggle keeps its 40px drawing with a centred target at least 44px in both axes", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const toggle = css.match(/\.language-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
  const target = css.match(/\.language-toggle::before\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(toggle, /position:\s*relative;/);
  assert.match(toggle, /block-size:\s*40px;/);
  assert.match(target, /content:\s*"";/);
  assert.match(target, /position:\s*absolute;/);
  assert.match(target, /inset-block:\s*-2px;/);
  assert.match(target, /inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  assert.match(target, /border-radius:\s*inherit;/);
  assert.doesNotMatch(target, /background/);
});
