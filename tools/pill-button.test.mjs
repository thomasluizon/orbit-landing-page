import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "@astrojs/compiler";
import { compile } from "tailwindcss";

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

async function transitionDurations(path, tag) {
  const source = await readFile(path, "utf8");
  const { ast } = await parse(source);
  const element = findElement(ast, tag);
  const attribute = element.attributes.find(
    ({ name }) => name === "class" || name === "class:list",
  );
  const classes =
    attribute.kind === "expression" ? attribute.value.match(/"([^"]+)"/)[1] : attribute.value;
  const candidates = classes.split(/\s+/);
  const globalCss = await readFile("src/styles/global.css", "utf8");
  const compiler = await compile(
    globalCss.replace('@import "tailwindcss";', "@tailwind utilities;"),
  );
  const css = compiler.build(candidates);
  const declarations = Object.fromEntries(
    [...globalCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
  );
  for (const rule of css.matchAll(/^\.([^\n]+) \{\n((?: {2}[^{}\n]+\n)+)\}/gm)) {
    if (!candidates.includes(rule[1].replace(/\\(.)/g, "$1"))) continue;
    for (const declaration of rule[2].matchAll(/^ {2}([\w-]+): (.+);$/gm)) {
      declarations[declaration[1]] = declaration[2];
    }
  }
  const resolve = (value) =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name) => resolve(declarations[name]));
  const properties = declarations["transition-property"].split(/,\s*/);
  const durations = resolve(declarations["transition-duration"]).split(/,\s*/);
  return Object.fromEntries(
    properties.map((property, index) => [property, durations[index % durations.length]]),
  );
}

for (const [path, tag] of [
  ["src/components/PillButton.astro", "a"],
  ["src/components/PillButton.astro", "button"],
  ["src/components/IosWaitlist.astro", "button"],
]) {
  test(`${path} ${tag}: compiled hover colours use 240ms and press/release movement uses 160ms`, async () => {
    assert.deepEqual(await transitionDurations(path, tag), {
      "background-color": "240ms",
      color: "240ms",
      opacity: "160ms",
      "box-shadow": "160ms",
      transform: "160ms",
      translate: "160ms",
      scale: "160ms",
    });
  });
}
