import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "@astrojs/compiler";
import { compile } from "tailwindcss";

function findElement(node, name) {
  if (["element", "component"].includes(node.type) && node.name === name) return node;
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

async function compiledControl(tag, variant) {
  const source = await readFile("src/components/PillButton.astro", "utf8");
  const { ast } = await parse(source);
  const attribute = findElement(ast, tag).attributes.find(
    ({ name }) => name === "class" || name === "class:list",
  );
  const classes =
    attribute.kind === "expression" ? attribute.value.match(/"([^"]+)"/)[1] : attribute.value;
  const variantClasses = source.match(/const variantClasses[^=]*=\s*\{([^}]+)\}/)[1];
  const variantMatch = variantClasses.match(new RegExp(`${variant}:\\s*"([^"]+)"`));
  assert.ok(variantMatch, `${variant} variant has shipping classes`);
  const globalCss = await readFile("src/styles/global.css", "utf8");
  const compiler = await compile(
    globalCss
      .slice(0, globalCss.indexOf("\nhtml {"))
      .replace('@import "tailwindcss";', "@tailwind utilities;"),
  );
  return compiler.build([...classes.split(/\s+/), ...variantMatch[1].split(/\s+/)]);
}

for (const tag of ["a", "button"]) {
  for (const variant of ["primary", "secondary", "ghost"]) {
    test(`PillButton ${tag} ${variant}: a disabled pill shows no hover and no press`, async () => {
      const css = await compiledControl(tag, variant);
      const states = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
        .map(([, selector]) => selector.trim())
        .filter((selector) => /:(?:hover|active)\b/.test(selector));
      assert.ok(states.length >= 2, "the pill has hover and press rules");
      for (const selector of states) assert.match(selector, /:not\(:disabled\):(?:hover|active)$/);
    });
  }
}

test("IosWaitlist forwards submit and challenge state through PillButton", async () => {
  const { ast } = await parse(await readFile("src/components/IosWaitlist.astro", "utf8"));
  const submit = findElement(ast, "PillButton");
  assert.ok(submit, "the waitlist uses the shared pill");
  const attributes = Object.fromEntries(submit.attributes.map(({ name, value }) => [name, value]));
  assert.equal(attributes.id, "waitlist-submit");
  assert.equal(attributes.type, "submit");
  assert.ok(submit.attributes.some(({ name }) => name === "disabled"));
  const { ast: primitive } = await parse(await readFile("src/components/PillButton.astro", "utf8"));
  const button = findElement(primitive, "button");
  for (const name of ["type", "disabled"]) {
    const attribute = button.attributes.find((candidate) => candidate.name === name);
    assert.equal(attribute?.kind, "expression");
    assert.equal(attribute?.value, name);
  }
});
