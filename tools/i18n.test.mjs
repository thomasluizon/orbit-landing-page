import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function element(attributes = {}, textContent = "") {
  return {
    textContent,
    attributes: { ...attributes },
    listeners: new Map(),
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    },
  };
}

function harness({ cookie = "", language = "en-US", serverRendered = false } = {}) {
  const toggle = element();
  const label = element();
  const headline = element({ "data-i18n": "hero.title" });
  const continuation = element({ "data-i18n": "demo.start.request" });
  const placeholder = element({ "data-i18n-placeholder": "ios.placeholder" });
  const description = element({ "data-i18n-content": "meta.description" });
  const nav = element({ "data-i18n-label": "nav.label" });
  const graph = element(
    {},
    JSON.stringify({ "@graph": [{ "@type": "SoftwareApplication", offers: {} }] }),
  );
  const landingNode = element();
  const chartLabel = element();
  const displayedPrices = ["free", "monthly", "yearly"].map((period) => ({
    ...element(),
    dataset: { price: period },
  }));
  const languageEvents = [];
  const queries = [];
  const document = {
    cookie,
    documentElement: {},
    getElementById: (id) => ({ "lang-label": label, "lang-toggle": toggle })[id] ?? null,
    querySelectorAll: (selector) => {
      queries.push(selector);
      return (
        {
          "[data-i18n]": [headline, continuation],
          "[data-copy-en]": [landingNode],
          "[data-copy-label-en]": [chartLabel],
          "[data-price]": displayedPrices,
          "[data-i18n-placeholder]": [placeholder],
          "[data-i18n-content]": [description],
          "[data-i18n-label]": [nav],
          'script[type="application/ld+json"]': [graph],
        }[selector] ?? []
      );
    },
  };
  const context = vm.createContext({
    document,
    navigator: { language },
    environment: { DEV: false },
    Intl,
    window: { dispatchEvent: (event) => languageEvents.push(event.type) },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  const modules = new Map();
  function require(path) {
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(`src/scripts/${path}.ts`, "utf8");
    const code = ts.transpileModule(source.replaceAll("import.meta.env", "environment"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
    modules.set(path, exports);
    return exports;
  }
  const landingTables = require("../i18n/translations").landingCopy;
  landingNode.dataset = {
    copyEn: landingTables.en["nav.features"],
    copyPt: landingTables["pt-BR"]["nav.features"],
  };
  chartLabel.dataset = {
    copyLabelEn: landingTables.en["product.chart"],
    copyLabelPt: landingTables["pt-BR"]["product.chart"],
  };
  if (serverRendered) {
    document.documentElement.lang = "en";
    headline.textContent = require("../i18n/translations").translations.en["hero.title"];
    landingNode.textContent = landingNode.dataset.copyEn;
  }
  const module = require("./i18n");
  return {
    module,
    document,
    toggle,
    label,
    headline,
    continuation,
    placeholder,
    description,
    nav,
    graph,
    landingNode,
    chartLabel,
    displayedPrices,
    landingTables,
    languageEvents,
    queries,
    tables: require("../i18n/translations").translations,
    prices: require("../config/pricing"),
  };
}

test("matching server-rendered English avoids a full-page translation scan at startup", () => {
  const h = harness({ serverRendered: true });
  assert.deepEqual(h.queries, []);
  assert.equal(h.headline.textContent, h.tables.en["hero.title"]);
  assert.equal(h.landingNode.textContent, h.landingTables.en["nav.features"]);
  h.toggle.listeners.get("click")();
  assert.ok(h.queries.length > 0);
  assert.equal(h.headline.textContent, h.tables["pt-BR"]["hero.title"]);
  assert.equal(h.landingNode.textContent, h.landingTables["pt-BR"]["nav.features"]);
});

test("language cookies override the browser and invalid cookies use its language", () => {
  assert.equal(harness({ cookie: "orbit_lang=pt-BR", language: "en" }).module.getLang(), "pt-BR");
  assert.equal(harness({ cookie: "orbit_lang=en", language: "pt-BR" }).module.getLang(), "en");
  assert.equal(
    harness({ cookie: "orbit_lang=invalid", language: "pt-PT" }).module.getLang(),
    "pt-BR",
  );
  assert.equal(harness({ language: "fr-FR" }).module.getLang(), "en");
});

test("the actual toggle switches prose, placeholder, labels, metadata and structured data both ways", () => {
  const h = harness();
  for (const lang of ["en", "pt-BR", "en"]) {
    if (h.document.documentElement.lang !== lang) h.toggle.listeners.get("click")();
    const table = h.tables[lang];
    assert.equal(h.headline.textContent, table["hero.title"]);
    assert.equal(h.continuation.textContent, table["demo.start.request"]);
    assert.equal(h.placeholder.attributes.placeholder, table["ios.placeholder"]);
    assert.equal(h.nav.attributes["aria-label"], table["nav.label"]);
    assert.equal(h.description.attributes.content, table["meta.description"]);
    assert.equal(h.toggle.attributes["aria-label"], table["language.switch"]);
    assert.equal(h.label.textContent, lang === "en" ? "EN" : "pt-BR");
    assert.ok(
      h.toggle.attributes["aria-label"].includes(h.label.textContent),
      "the accessible name includes the visible language label",
    );
    assert.match(h.document.cookie, /path=\/;.*SameSite=Lax; Secure/);
    const app = JSON.parse(h.graph.textContent)["@graph"][0];
    assert.equal(app.offers[0].priceCurrency, lang === "en" ? "USD" : "BRL");
  }
});

test("application offers keep the verified amount and billing interval", () => {
  const { prices } = harness();
  for (const [lang, amounts, currency] of [
    ["en", [0, 9.99, 69.99], "USD"],
    ["pt-BR", [0, 29.9, 199], "BRL"],
  ]) {
    const offers = prices.offersFor(lang);
    assert.deepEqual(
      Array.from(offers, (offer) => offer.price),
      amounts,
    );
    assert.ok(offers.every((offer) => offer.priceCurrency === currency));
    assert.equal(offers[1].priceSpecification.billingDuration, "P1M");
    assert.equal(offers[2].priceSpecification.billingDuration, "P1Y");
  }
});

test("both locales have the same complete keys and no retired marketing", () => {
  const { tables } = harness();
  assert.deepEqual(Object.keys(tables.en), Object.keys(tables["pt-BR"]));
  for (const table of Object.values(tables)) {
    assert.ok(Object.values(table).every((text) => text.length > 0));
    assert.ok(
      !Object.keys(table).some((key) =>
        /mcp|proof\.(registrations|installs|paying|astraTools|mcpTools)|social|badge/.test(key),
      ),
    );
    assert.doesNotMatch(
      Object.values(table).join(" "),
      /[\u2013\u2014]|unlimited habits|AI memory|MCP|accountability|leaderboard|500 messages|20 AI/i,
    );
    assert.ok(
      !Object.keys(table).some((key) =>
        /^(faq|pricing|platforms|proof|features|mockup|preview|astra|cta)\./.test(key),
      ),
    );
  }
});

test("pt-BR always refers to Astra with feminine articles and contractions", () => {
  const { tables } = harness();
  for (const [key, text] of Object.entries(tables["pt-BR"])) {
    assert.doesNotMatch(text, /\b(?:o|do|no|ao|pelo)\s+Astra\b/iu, key);
  }
});

test("pt-BR demo repeat labels name every time of day with the same adverbial form", () => {
  const { tables } = harness();
  const repeatKeys = Object.keys(tables["pt-BR"]).filter((key) =>
    /^demo\..+\.(?:alternateRepeat|repeat|secondRepeat)$/u.test(key),
  );
  assert.ok(repeatKeys.length > 0);
  for (const key of repeatKeys) {
    const timeOfDay = tables["pt-BR"][key].split(" · ").at(-1);
    assert.match(timeOfDay, /^(?:De manhã|À tarde|À noite)$/u, key);
  }
});

test("switching the real language toggle updates every landing copy attribute, chart name and configured price", () => {
  const h = harness();
  for (const lang of ["en", "pt-BR", "en"]) {
    if (h.document.documentElement.lang !== lang) h.toggle.listeners.get("click")();
    assert.equal(h.landingNode.textContent, h.landingTables[lang]["nav.features"]);
    assert.equal(h.chartLabel.attributes["aria-label"], h.landingTables[lang]["product.chart"]);
    for (const price of h.displayedPrices)
      assert.equal(price.textContent, h.prices.formatPrice(lang, price.dataset.price));
  }
  assert.deepEqual(h.languageEvents, ["orbit:language-changed", "orbit:language-changed"]);
});

test("every new landing string exists in both languages and Astra remains feminine", () => {
  const { landingTables } = harness();
  assert.deepEqual(Object.keys(landingTables.en), Object.keys(landingTables["pt-BR"]));
  for (const [lang, table] of Object.entries(landingTables)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(value.length > 0, `${lang}: ${key}`);
      assert.doesNotMatch(value, /[\u2013\u2014!]/u, key);
      if (lang === "pt-BR") assert.doesNotMatch(value, /\b(?:o|do|no|ao|pelo)\s+Astra\b/iu, key);
    }
  }
});
