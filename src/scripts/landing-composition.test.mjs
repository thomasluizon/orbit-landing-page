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

test("the owning page follows Pierre's section order with Orbit product compositions", () => {
  assert.deepEqual(
    sections
      .filter((node) => node.name === "section")
      .map((node) => attributes(node)["data-section"]),
    ["hero", "trust", "features", "pricing", "faq", "final"],
  );
  assert.equal(nodes.filter((node) => node.name === "h1").length, 1);
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /Connect/);
});

async function productInstances(name, props = {}) {
  const source = readFileSync(`src/components/${name}.astro`, "utf8");
  if (!/\b(?:ProductCard|OrbitProduct|AstraBlock|FeatureVignette)\b/.test(source)) return [];
  const { ast } = await parse(source);
  const context = vm.createContext({
    Astro: { props },
    require: () => copyTables,
    exports: {},
  });
  vm.runInContext(
    ts.transpileModule(source.split("---")[1], {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    context,
  );
  const serialize = (node) => {
    if (["ProductCard", "OrbitProduct", "AstraBlock", "FeatureVignette"].includes(node.name)) {
      const kind = node.attributes.find((attribute) => attribute.name === "kind");
      return `{ component: ${JSON.stringify(node.name)}, kind: ${kind.kind === "expression" ? kind.value : JSON.stringify(kind.value)} }`;
    }
    if (node.type === "text" || node.type === "frontmatter") return "[]";
    if (node.type === "expression") {
      if (!node.children.some((child) => child.type !== "text")) return "[]";
      return `(${node.children.map((child) => (child.type === "text" ? child.value : serialize(child))).join("")})`;
    }
    return `[${(node.children ?? []).map(serialize).join(",")}]`;
  };
  const instances = vm.runInContext(serialize(ast), context).flat(Infinity).filter(Boolean);
  return (
    await Promise.all(
      instances.map((instance) =>
        instance.component === "FeatureVignette"
          ? productInstances(instance.component, { kind: instance.kind })
          : instance,
      ),
    )
  ).flat();
}

test("no product card kind repeats, including Today variants and hero floating cards", async () => {
  const instances = (
    await Promise.all(
      descendants(page)
        .filter((node) => componentNames.includes(node.name))
        .map((node) => productInstances(node.name)),
    )
  ).flat();
  const counts = new Map();
  for (const { component, kind } of instances) {
    const key =
      (component === "ProductCard" && kind === "today") ||
      (component === "AstraBlock" && kind === "habits") ||
      (component === "OrbitProduct" && kind === "steps")
        ? "today"
        : `${component}:${kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.deepEqual(
    [...counts].filter(([, count]) => count > 1),
    [],
    "repeated product cards, including copies of hero floating cards",
  );
});

test("exactly seven example rows pair one square card with one sentence and alternate sides", () => {
  const rows = nodes.filter((node) => attributes(node)["data-example-row"]);
  assert.equal(rows.length, 7, "the owning page must render seven example rows");
  assert.deepEqual(
    rows.map((node) => attributes(node)["data-example-row"]),
    ["calendar", "data", "metrics", "breakdown", "streak", "goal", "achievements"],
  );
  for (const [index, row] of rows.entries()) {
    const cards = descendants(row).filter((node) => node.name === "ExampleCard");
    const sentences = descendants(row).filter(
      (node) => attributes(node).class === "example-sentence",
    );
    assert.equal(cards.length, 1);
    assert.equal(sentences.length, 1);
    assert.equal(attributes(row)["data-card-side"], index % 2 ? "right" : "left");
    assert.equal(descendants(row).filter((node) => node.name === "PillButton").length, 0);
  }
  const card = readFileSync("src/components/ExampleCard.astro", "utf8");
  assert.match(card, /class="example-card"/);
  assert.match(
    readFileSync("src/styles/landing.css", "utf8"),
    /\.example-card\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/,
  );
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
    6,
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
      (node) => node.name === "a" && attributes(node).class !== "demo-composer",
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

test("section rhythm uses fixed spacing without viewport minimums or feature pin spacers", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /--landing-section-gap:\s*96px/);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*--landing-section-gap:\s*96px/);
  assert.match(
    css,
    /\.section,\s*\.final-section\s*\{[^}]*padding-block:\s*var\(--landing-section-gap\) 0/,
  );
  assert.doesNotMatch(css, /min-block-size:[^;}]*svh/);
  assert.doesNotMatch(
    readFileSync("src/scripts/landing-motion.ts", "utf8"),
    /trigger:\s*(?:row|composition)|pinSpacing:\s*true/,
  );
});

test("each week bar and its localized weekday share one of seven equal columns", async () => {
  const product = (await parse(readFileSync("src/components/ProductCard.astro", "utf8"))).ast;
  const column = descendants(product).find((node) => attributes(node).class === "chart-column");
  assert.ok(column, "the shared hero and feature chart owns a column for each day");
  const children = descendants(column);
  assert.ok(children.some((node) => attributes(node).class === "chart-bar"));
  const label = children.find((node) => attributes(node).class === "chart-day");
  assert.ok(attributes(label)["data-copy-en"]);
  assert.ok(attributes(label)["data-copy-pt"]);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.week-chart\s*\{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(
    css,
    /\.chart-column\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*8px/,
  );
  assert.match(css, /\.chart-day\s*\{[^}]*font-size:\s*var\(--fs-xs\);[^}]*text-align:\s*center/);
  assert.doesNotMatch(css, /word-spacing:|\.chart-days/);
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
    ["data-pro-price", "data-annual-saving", "data-annual-equivalent"].map((name) => [
      name,
      element(pricing.find((node) => Object.hasOwn(attributes(node), name))),
    ]),
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
        : "Annual costs less per day.",
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

test("example cards share a square frame, reduced app view and one alternating responsive rhythm", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.example-card\s*\{[^}]*inline-size:\s*min\(440px, 100%\);[^}]*aspect-ratio:\s*1 \/ 1;[^}]*padding:\s*24px;[^}]*border-radius:\s*var\(--radius-xl\)/,
  );
  assert.match(
    css,
    /\.example-app\s*\{[^}]*inline-size:\s*440px;[^}]*transform:\s*translate\(-50%, -50%\) scale\(0\.64\)/,
  );
  assert.match(css, /\.example-rows\s*\{[^}]*gap:\s*96px/);
  assert.match(
    css,
    /\.example-row\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*gap:\s*64px/,
  );
  assert.match(
    css,
    /\.example-sentence\s*\{[^}]*font-size:\s*var\(--fs-3xl\);[^}]*text-wrap:\s*balance/,
  );
  assert.match(
    css,
    /@media \(width < 48rem\)[^{]*\{\s*\.example-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(css, /\.example-sentence\s*\{[^}]*grid-row:\s*1;/);
  const features = descendants(components.get("FeatureRows"));
  const heading = features.find((node) => attributes(node).class === "section-heading");
  assert.equal(descendants(heading).filter((node) => node.name === "p").length, 0);
});

test("annual billing leads with configured daily and monthly equivalents and rounded-down savings", () => {
  const pricing = descendants(components.get("Pricing"));
  const options = pricing.filter((node) => attributes(node).role === "radio");
  assert.deepEqual(
    options.map((node) => attributes(node)["aria-checked"]),
    ["false", "true"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node).tabindex),
    ["-1", "0"],
  );
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.plan-name h3\s*\{[^}]*font-size:\s*var\(--fs-3xl\)/);
  assert.match(
    css,
    /\.billing-option\[aria-checked="true"\]\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--color-primary\)/,
  );
  for (const language of ["en", "pt-BR"]) {
    const h = billingHarness(language);
    const annual = h.prices.offersFor(language)[2].price;
    const monthly = h.prices.offersFor(language)[1].price;
    const formatter = new Intl.NumberFormat(language === "en" ? "en-US" : "pt-BR", {
      style: "currency",
      currency: language === "en" ? "USD" : "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    assert.equal(h.prices.formatPrice(language, "dailyEquivalent"), formatter.format(annual / 365));
    assert.equal(
      h.prices.formatPrice(language, "monthlyEquivalent"),
      formatter.format(annual / 12),
    );
    assert.equal(h.prices.annualSavings(language), Math.floor((1 - annual / (monthly * 12)) * 100));
    const free = h.free.textContent;
    for (const [index, period] of [
      [1, "yearly"],
      [0, "monthly"],
      [1, "yearly"],
    ]) {
      h.options[index].click();
      const display = h.prices.pricingFor(language, period);
      assert.equal(h.fields["data-pro-price"].textContent, display.primary);
      assert.equal(h.fields["data-annual-equivalent"].textContent, display.equivalent);
      assert.equal(h.fields["data-annual-saving"].textContent, display.saving);
      assert.equal(h.fields["data-annual-equivalent"].hidden, period === "monthly");
      assert.equal(h.fields["data-annual-saving"].hidden, period === "monthly");
      assert.equal(h.free.textContent, free);
    }
    for (const other of ["pt-BR", "en"]) {
      h.changeLanguage(other);
      assert.equal(
        h.fields["data-pro-price"].textContent,
        h.prices.pricingFor(other, "yearly").primary,
      );
      assert.equal(h.options[1].attributes["aria-checked"], "true");
    }
    h.options[0].click();
    h.changeLanguage(language);
    assert.equal(
      h.fields["data-pro-price"].textContent,
      h.prices.pricingFor(language, "monthly").primary,
    );
    assert.equal(h.options[0].attributes["aria-checked"], "true");
  }
  const source =
    readFileSync("src/components/Pricing.astro", "utf8") +
    readFileSync("src/scripts/pricing.ts", "utf8");
  assert.match(source, /import \{[^}]*pricingFor[^}]*\} from "\.\.\/config\/pricing"/);
  assert.match(readFileSync("src/config/pricing.ts", "utf8"), /plan\.yearly \/ 365 \/ 100/);
  for (const text of [source, readFileSync("src/i18n/translations.ts", "utf8")])
    assert.doesNotMatch(text, /(?:\$|R\$)\s*\d|69\.99|9\.99|19900|6999/);
});

test("one closing block contains the last action, install QR and data and cookie controls", () => {
  const closing = descendants(components.get("FinalCta"));
  assert.equal(closing.filter((node) => node.name === "PillButton").length, 1);
  assert.equal(nodes.filter((node) => node.name === "footer").length, 1);
  assert.ok(
    closing.some(
      (node) =>
        attributes(node).id === "cookie-preferences" &&
        attributes(node)["aria-controls"] === "consent-banner",
    ),
  );
  assert.ok(closing.some((node) => attributes(node).href === "mailto:contact@useorbit.org"));
  assert.ok(closing.some((node) => attributes(node).src === "/orbit-install-qr.svg"));
  for (const key of ["footer.controller", "footer.requests", "footer.cookies"])
    assert.ok(closing.some((node) => attributes(node).name === key));
  assert.doesNotMatch(
    readFileSync("src/components/FinalCta.astro", "utf8"),
    /orbit-lockup|hero\.web/,
  );
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /<Footer|<Security|<Features/);
});
