import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { stylesheetRules } from "./lib/stylesheet-rules.mjs";

const html = readFileSync("dist/index.html", "utf8");
const css = [
  ...[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"/g)].map(([, href]) =>
    readFileSync(`dist${href}`, "utf8"),
  ),
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, body]) => body),
].join("\n");
const rules = stylesheetRules(css);
const values = (block, property) =>
  [...block.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map(([, value]) =>
    value.trim(),
  );

test("the built stylesheet keeps each scroll timeline as a longhand that the browser accepts", () => {
  for (const rule of rules) {
    for (const shorthand of values(rule.declarations, "animation")) {
      assert.doesNotMatch(
        shorthand,
        /\b(?:view|scroll)\(/,
        `${rule.selector}: a browser drops an animation shorthand that holds a timeline`,
      );
    }
  }
  const scrolled = rules.filter((rule) =>
    values(rule.declarations, "animation-timeline").includes("view()"),
  );
  for (const rule of scrolled) {
    assert.ok(
      rule.conditions.some((condition) =>
        /prefers-reduced-motion:\s*no-preference/.test(condition),
      ),
      `${rule.selector} scrolls outside the motion preference`,
    );
  }
  assert.deepEqual(
    [...new Set(scrolled.flatMap((rule) => values(rule.declarations, "animation-name")))].sort(),
    [
      ...["orbit-arrive", "orbit-counter-spin", "orbit-line-arrive"],
      ...["orbit-moon-back", "orbit-moon-front", "orbit-spin", "orbit-tilt", "section-arrive"],
    ],
    "each guide Orbit, line and section arrival ships with its scroll timeline",
  );
});

test("each built Orbit moon sits on one ring: the counter scale undoes the ring opening", () => {
  const layers = [
    ...html.matchAll(
      /class="orbit-moon orbit-moon-(?:back|front)"><g class="orbit-tilt"><g transform="rotate\(([^)]+)\) scale\(1 ([^)]+)\)">[\s\S]*?translate\(([^ )]+) 0\)[\s\S]*?transform="scale\(1 ([^)]+)\)"/g,
    ),
  ].map(([, tilt, opening, radius, counter]) => ({ tilt, opening, radius, counter }));
  assert.ok(layers.length >= 12, "the hero and each guide draw a back and a front moon");
  assert.equal(new Set(layers.map((layer) => JSON.stringify(layer))).size, 1);
  const [{ opening, counter }] = layers;
  assert.ok(Math.abs(Number(opening) * Number(counter) - 1) < 1e-4, `${opening} x ${counter}`);
});

test("a container with a focusable control ends its scroll arrival while focus is inside", () => {
  const arriving = rules
    .filter((rule) => values(rule.declarations, "animation-name").includes("section-arrive"))
    .flatMap((rule) => rule.selector.split(",").map((selector) => selector.trim()));
  const focusable = arriving.filter((selector) =>
    /plan-card|faq-list|waitlist-form/.test(selector),
  );
  assert.ok(focusable.length >= 3, "the plans, the questions and the waitlist form arrive");
  const settled = new Set(
    rules
      .filter((rule) => values(rule.declarations, "animation-name").includes("none"))
      .flatMap((rule) => rule.selector.split(",").map((selector) => selector.trim())),
  );
  for (const selector of focusable) {
    assert.ok(
      settled.has(`${selector}:focus-within`),
      `${selector} stays faded while a control inside holds focus`,
    );
  }
});

test("each guide line names Orbit as the speaker for assistive technology", () => {
  const lines = [...html.matchAll(/<p class="orbit-line-text">([\s\S]*?)<\/p>/g)].map(
    ([, body]) => body,
  );
  assert.equal(lines.length, 4, "the four section guides with a line");
  for (const body of lines) {
    assert.match(
      body,
      /^\s*<span class="sr-only" translate="no">\s*Orbit:\s*<\/span>/,
      "the line starts with a hidden speaker name",
    );
  }
});
