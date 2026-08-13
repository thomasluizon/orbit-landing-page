import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "@astrojs/compiler";

function findElement(node, name) {
  if (node.type === "element" && node.name === name) return node;
  for (const child of node.children ?? []) {
    const element = findElement(child, name);
    if (element) return element;
  }
  return undefined;
}

test("button mode renders both analytics attributes", async () => {
  const source = await readFile("src/components/PillButton.astro", "utf8");
  const { ast, diagnostics } = await parse(source);
  assert.deepEqual(diagnostics, []);

  const button = findElement(ast, "button");
  assert.ok(button, "PillButton has a button branch");

  const analyticsAttributes = Object.fromEntries(
    button.attributes
      .filter((attribute) => attribute.name.startsWith("data-analytics-"))
      .map((attribute) => [attribute.name, { kind: attribute.kind, value: attribute.value }]),
  );
  assert.deepEqual(analyticsAttributes, {
    "data-analytics-event": { kind: "expression", value: "analyticsEvent" },
    "data-analytics-surface": { kind: "expression", value: "analyticsSurface" },
  });
});
