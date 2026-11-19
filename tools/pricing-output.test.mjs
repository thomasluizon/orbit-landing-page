import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runnerImport } from "vite";
import { documentFrom } from "./lib/mini-dom.mjs";

const viteOptions = { configFile: false, envPrefix: "PUBLIC_", logLevel: "silent" };

function interactive(element) {
  element.click = () => element.dispatch("click");
  element.key = (key) =>
    element.dispatch("keydown", {
      key,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    });
  return element;
}

async function builtPricing(language) {
  const document = documentFrom(readFileSync("dist/index.html", "utf8"));
  let cookie = `orbit_lang=${language}`;
  Object.defineProperty(document, "cookie", {
    get: () => cookie,
    set: (value) => (cookie = value),
  });
  document.getElementById = (id) => document.querySelector(`[id="${id}"]`);
  const listeners = new Map();
  Object.assign(globalThis, {
    document,
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      dispatchEvent: (event) => listeners.get(event.type)?.(),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "en-US" },
    configurable: true,
  });
  await runnerImport("/src/scripts/i18n.ts", viteOptions);
  await runnerImport("/src/scripts/pricing.ts", viteOptions);
  const toggle = interactive(document.getElementById("lang-toggle"));
  const options = document.querySelectorAll("[data-billing-period]").map(interactive);
  return {
    document,
    options,
    changeLanguage(next) {
      while (document.documentElement.lang !== next) toggle.click();
    },
  };
}

test("the built free plan title and caption follow the language toggle", async () => {
  const page = await builtPricing("en");
  const pricing = page.document.querySelector('[id="pricing"]');
  const title = pricing.querySelector('[data-i18n="plan.free"]');
  assert.ok(title, "the free plan heading uses a localized plan name");
  const caption = pricing.querySelector('[data-copy-en="For getting started."]');
  for (const language of ["en", "pt-BR", "en"]) {
    page.changeLanguage(language);
    assert.equal(title.textContent, language === "pt-BR" ? "Grátis" : "Free");
    assert.equal(
      caption.textContent,
      language === "pt-BR" ? "Para começar." : "For getting started.",
    );
  }
});

test("the built billing arrows wrap selection and focus, Home and End select endpoints, and Tab stays native", async () => {
  const { document, options } = await builtPricing("en");
  assert.equal(options.length, 2);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    options[0].click();
    assert.equal(options[0].key(key).prevented, true);
    assert.equal(options[1].getAttribute("aria-checked"), "true");
    assert.equal(document.activeElement, options[1]);
    assert.equal(options[1].tabIndex, 0);
    assert.equal(options[0].tabIndex, -1);
    assert.equal(options[1].key(key).prevented, true);
    assert.equal(options[0].getAttribute("aria-checked"), "true");
    assert.equal(document.activeElement, options[0]);
  }
  options[0].key("End");
  assert.equal(options[1].getAttribute("aria-checked"), "true");
  options[1].key("Home");
  assert.equal(options[0].getAttribute("aria-checked"), "true");
  assert.equal(options[0].key("Tab").prevented, false);
});

test("every built billing period shows its configured daily price and actual billed total", async () => {
  const page = await builtPricing("en");
  const { module: prices } = await runnerImport("/src/config/pricing-copy.ts", viteOptions);
  const field = (name) => page.document.querySelector(`[${name}]`);
  const [yearlyOption] = page.options;
  assert.equal(yearlyOption.getAttribute("data-billing-period"), "yearly");
  assert.equal(yearlyOption.querySelectorAll("[data-billing-saving]").length, 1);
  assert.equal(yearlyOption.querySelectorAll('[data-copy-en="Recommended"]').length, 0);
  for (const [language, yearly, monthly, totalYearly, totalMonthly] of [
    ["en", "$0.19/day", "$0.33/day", "$69.99 billed yearly", "$9.99 billed monthly"],
    ["pt-BR", "R$ 0,55/dia", "R$ 1,00/dia", "R$ 199 cobrados por ano", "R$ 29,90 cobrados por mês"],
  ]) {
    page.changeLanguage(language);
    assert.equal(prices.pricingFor(language, "yearly").primary, yearly);
    assert.equal(prices.pricingFor(language, "monthly").primary, monthly);
    page.options[0].click();
    assert.equal(field("data-pro-price").textContent, yearly);
    assert.equal(field("data-billed-total").textContent, totalYearly);
    page.options[1].click();
    assert.equal(field("data-pro-price").textContent, monthly);
    assert.equal(field("data-billed-total").textContent, totalMonthly);
    assert.equal(field("data-billed-total").hidden, false);
    assert.equal(
      field("data-billing-saving").textContent,
      prices.pricingFor(language, "yearly").savingShort,
    );
    assert.equal(field("data-plan-recommendation").hidden, false);
    page.options[0].click();
    assert.equal(field("data-plan-recommendation").hidden, false);
  }
});
