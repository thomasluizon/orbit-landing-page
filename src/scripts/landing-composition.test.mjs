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
