import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { documentFrom, moduleLoader } from "./lib/mini-dom.mjs";

const html = readFileSync("dist/index.html", "utf8");
const fixtures = moduleLoader({})("src/config/product-examples.ts");
const { landingCopy } = moduleLoader({})("src/i18n/translations.ts");

function interactive(element) {
  let hidden = element.hasAttribute("hidden");
  Object.defineProperty(element, "hidden", {
    get: () => hidden,
    set: (value) => {
      hidden = Boolean(value);
      if (hidden) element.setAttribute("hidden", "");
      else element.removeAttribute("hidden");
    },
  });
  Object.defineProperty(element, "tabIndex", {
    get: () => Number(element.getAttribute("tabindex")),
    set: (value) => element.setAttribute("tabindex", value),
  });
  element.style = {};
  element.click = () => element.dispatch("click");
  element.key = (key) => {
    let prevented = false;
    element.dispatch("keydown", {
      key,
      preventDefault() {
        prevented = true;
      },
    });
    return prevented;
  };
  return element;
}

function metricsHarness() {
  const document = documentFrom(html);
  const block = document.querySelector('[data-example-block="metrics"]');
  assert.ok(block, "the built page holds the interactive metrics block");
  const chart = block.querySelector("[data-metric-chart]");
  const readout = interactive(block.querySelector(".metric-readout"));
  const days = block.querySelectorAll("[data-metric-day]").map(interactive);
  const readouts = block.querySelectorAll("[data-metric-readout]").map(interactive);
  const bars = days.map((day) => day.querySelector(".metric-bar"));
  readout.offsetWidth = 128;
  chart.clientWidth = 384;
  days.forEach((day, index) => {
    day.offsetLeft = index * 56;
    day.offsetWidth = 48;
  });
  moduleLoader({
    document,
    window: {
      requestAnimationFrame: (callback) => callback(),
      addEventListener: () => {},
    },
    ResizeObserver: class {
      observe(element) {
        assert.equal(element, chart);
      }
    },
  })("src/scripts/product-metrics.ts");
  return {
    document,
    days,
    bars,
    readouts,
    readout,
  };
}

function doneLabel(language, index) {
  const { done, total } = fixtures.exampleDays[index];
  return landingCopy[language]["blocks.metrics.done"]
    .replace("{done}", String(done))
    .replace("{total}", String(total));
}

test("the built AI examples expose selectable bars, a static breakdown and a derived goal", () => {
  const document = documentFrom(html);
  const kinds = document
    .querySelectorAll("[data-product-kind]")
    .map((block) => block.getAttribute("data-product-kind"));
  for (const kind of ["metrics", "breakdown", "goal"]) assert.ok(kinds.includes(kind), kind);
  const metrics = document.querySelector('[data-example-block="metrics"]');
  assert.ok(metrics.querySelector(".metric-readout"));
  assert.equal(metrics.querySelectorAll("input").length, 0);
  const chart = metrics.querySelector(".metric-bars");
  assert.equal(chart.getAttribute("role"), "radiogroup");
  const options = chart.querySelectorAll("button");
  assert.equal(options.length, fixtures.exampleWeek.length);
  options.forEach((option, index) => {
    const last = index === options.length - 1;
    assert.equal(option.getAttribute("role"), "radio");
    assert.equal(option.getAttribute("aria-checked"), String(last));
    assert.equal(option.getAttribute("tabindex"), last ? "0" : "-1");
    assert.equal(
      option.getAttribute("data-clock-label-en"),
      `{date}, ${fixtures.exampleWeek[index]}%, ${doneLabel("en", index)}`,
    );
  });
  const breakdown = document
    .querySelectorAll("[data-product-kind]")
    .find((block) => block.getAttribute("data-product-kind") === "breakdown");
  assert.equal(breakdown.querySelectorAll(".habit-row").length, 0);
  assert.equal(breakdown.querySelectorAll("button").length, 0);
  const goal = document
    .querySelectorAll("[data-product-kind]")
    .find((block) => block.getAttribute("data-product-kind") === "goal");
  assert.ok(goal.querySelector('[role="progressbar"]'));
  assert.ok(goal.textContent.includes(String(fixtures.exampleGoal.linkedHabitCount)));
});

test("chart bars select days by click and keyboard with one tab stop", () => {
  const h = metricsHarness();
  const assertSelection = (index) => {
    assert.deepEqual(
      h.days.map((day) => day.getAttribute("aria-checked")),
      h.days.map((_, n) => String(n === index)),
    );
    assert.deepEqual(
      h.days.map((day) => day.tabIndex),
      h.days.map((_, n) => (n === index ? 0 : -1)),
    );
    assert.deepEqual(
      h.bars.map((bar) => bar.getAttribute("data-selected")),
      h.days.map((_, n) => String(n === index)),
    );
    assert.deepEqual(
      h.readouts.map((item) => item.hidden),
      h.days.map((_, n) => n !== index),
    );
  };
  assertSelection(6);
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
    const forward = key === "ArrowRight" || key === "ArrowDown";
    const start = forward ? 6 : 0;
    const target = forward ? 0 : 6;
    h.days[start].click();
    assert.equal(h.days[start].key(key), true);
    assertSelection(target);
    assert.equal(h.document.activeElement, h.days[target]);
  }
  h.days[6].key("Home");
  assertSelection(0);
  h.days[0].key("End");
  assertSelection(6);
  assert.equal(h.days[6].key("Tab"), false);
  assertSelection(6);
});

test("the built 7-day readout owns the row between the title and the bars", () => {
  const chart = html.slice(html.indexOf("data-metric-chart"));
  assert.ok(
    chart.indexOf('class="metric-readout-row"') < chart.indexOf('class="metric-bars"'),
    "the readout row comes before the bars",
  );
});
