import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";

const css = readFileSync("src/styles/global.css", "utf8");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const declarationsFor = (selector) =>
  rules.filter(([, selectors]) => selectors.split(",").some((part) => part.trim() === selector));

test("the owning hero places the conversation between the copy and the actions", async () => {
  const { ast } = await parse(readFileSync("src/components/Hero.astro", "utf8"));
  let hero;
  function visit(node) {
    if (node.name === "section") hero = node;
    for (const child of node.children ?? []) visit(child);
  }
  visit(ast);
  const children = hero.children.filter((node) => ["element", "component"].includes(node.type));
  assert.deepEqual(
    children.map((node) =>
      node.name === "AstraDemo"
        ? node.name
        : node.attributes.find(({ name }) => name === "class")?.value,
    ),
    ["hero-copy", "AstraDemo", "hero-controls"],
  );
});

test("no viewport turns the hero into side by side columns", () => {
  for (const [, , declarations] of declarationsFor(".hero")) {
    for (const [, value] of declarations.matchAll(/grid-template-columns:\s*([^;]+);/g)) {
      assert.equal(value.trim(), "minmax(0, 1fr)");
    }
    assert.doesNotMatch(declarations, /grid-(?:area|column|row):|flex-direction:\s*row/);
  }
});

test("Astra uses an open conversation surface", () => {
  for (const [, , declarations] of declarationsFor(".astra-demo")) {
    assert.doesNotMatch(declarations, /(?:background|border-radius|box-shadow):/);
    assert.doesNotMatch(declarations, /grid-template-columns:/);
  }
});

function activeDeclarations(selector, width, height) {
  const declarations = {};
  const blocks = [
    ["", css.split("@media")[0]],
    ...[...css.matchAll(/@media\s*([^{]+)\{([\s\S]*?)(?=\n@media|$)/g)].map(([, query, body]) => [
      query,
      body,
    ]),
  ];
  for (const [query, body] of blocks) {
    const conditions = [...query.matchAll(/\((min|max)-(width|height):\s*([\d.]+)(rem|px)\)/g)];
    if (
      (query && !conditions.length) ||
      conditions.some(([, limit, axis, size, unit]) => {
        const dimension = axis === "width" ? width : height;
        const pixels = Number(size) * (unit === "rem" ? 16 : 1);
        return limit === "min" ? dimension < pixels : dimension > pixels;
      })
    )
      continue;
    for (const [, selectors, values] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors.split(",").some((part) => part.trim() === selector)) continue;
      for (const [, property, value] of values.matchAll(/([\w-]+):\s*([^;]+);/g))
        declarations[property] = value;
    }
  }
  return declarations;
}

test("the owner's window and taller windows retain both conversation turns", () => {
  for (const [width, height] of [
    [320, 568],
    [1000, 565],
    [1512, 982],
  ]) {
    for (const selector of [".demo-request", "#demo-reply"]) {
      assert.notEqual(
        activeDeclarations(selector, width, height).display,
        "none",
        `${selector} at ${width}x${height}`,
      );
    }
  }
});

test("the conversation grows into the middle of tall windows within its content cap", () => {
  const demo = activeDeclarations(".astra-demo", 1512, 982);
  assert.equal(demo["block-size"], "100%");
  assert.equal(demo["max-block-size"], "560px");
  assert.match(demo["grid-template-rows"], /minmax\(0, 1fr\)/);
});

test("Astra keeps the app's row, body and secondary type roles", async () => {
  const source = readFileSync("src/components/AstraDemo.astro", "utf8");
  assert.match(source, /id="demo-title" class="t-row"/);
  assert.match(source, /id="demo-request" class="demo-request t-body"/);
  assert.match(source, /id="demo-reply" class="t-body"/);
  assert.match(source, /id="demo-habit" class="t-row"/);
  assert.match(source, /id="demo-repeat" class="t-secondary"/);
});

test("every example chip has the product's resting, selected and focus treatments", () => {
  for (const width of [320, 360, 768, 1512]) {
    const resting = activeDeclarations(".demo-chip", width, 568);
    assert.equal(resting.background, "var(--color-bg-elev)");
    assert.equal(resting["box-shadow"], "inset 0 0 0 1px var(--color-hairline)");
    assert.equal(resting.color, "var(--color-fg-2)");
    assert.equal(resting["font-size"], "var(--fs-sm)");
    assert.equal(resting["font-weight"], "500");
    assert.equal(resting["border-radius"], "var(--radius-full)");
    assert.equal(resting["white-space"], "nowrap");
    const selected = activeDeclarations('.demo-chip[aria-pressed="true"]', width, 568);
    assert.equal(selected.background, "var(--selection-bg)");
    assert.equal(selected.color, "var(--color-fg-1)");
    assert.equal(selected["box-shadow"], "inset 0 0 0 1px rgba(var(--primary-rgb), 0.45)");
    assert.equal(activeDeclarations(".demo-chip:focus-visible", width, 568)["box-shadow"], "none");
    assert.equal(
      activeDeclarations(":focus-visible", width, 568).outline,
      "2px solid var(--color-primary)",
    );
    assert.equal(
      activeDeclarations(".demo-examples", width, 568)["flex-wrap"] ?? "nowrap",
      "nowrap",
    );
  }
  assert.ok(
    declarationsFor(".demo-chip:hover").some(([, , declarations]) =>
      declarations.includes("background: var(--color-bg-hover)"),
    ),
  );
});
