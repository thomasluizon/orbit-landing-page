import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
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
