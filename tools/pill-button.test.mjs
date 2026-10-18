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

async function compiledControl(path, tag, variant, size) {
  const source = await readFile(path, "utf8");
  const { ast } = await parse(source);
  const element = findElement(ast, tag);
  const attribute = element.attributes.find(
    ({ name }) => name === "class" || name === "class:list",
  );
  const classes =
    attribute.kind === "expression" ? attribute.value.match(/"([^"]+)"/)[1] : attribute.value;
  const candidates = classes.split(/\s+/);
  if (variant) {
    assert.match(attribute.value, /variantClasses\[variant\]/);
    const variantClasses = source.match(/const variantClasses[^=]*=\s*\{([^}]+)\}/)[1];
    const variantMatch = variantClasses.match(new RegExp(`${variant}:\\s*"([^"]+)"`));
    assert.ok(variantMatch, `${variant} variant has shipping classes`);
    candidates.push(...variantMatch[1].split(/\s+/));
  }
  if (size) {
    assert.match(attribute.value, /sizeClasses\[size\]/);
    const sizes = source.match(/const sizeClasses[^=]*=\s*\{([^}]+)\}/)[1];
    const sizeMatch = sizes.match(new RegExp(`${size}:\\s*"([^"]+)"`));
    assert.ok(sizeMatch, `${size} size has shipping classes`);
    candidates.push(...sizeMatch[1].split(/\s+/));
  }
  const globalCss = await readFile("src/styles/global.css", "utf8");
  const compiler = await compile(
    globalCss
      .slice(0, globalCss.indexOf("\nhtml {"))
      .replace('@import "tailwindcss";', "@tailwind utilities;"),
  );
  const css = compiler.build(candidates);
  return { css, candidates, globalCss };
}

function transitionDurations({ css, candidates, globalCss }) {
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

function stateDeclarations(css, state) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.includes(`:${state}`))
    .flatMap(([, , body]) =>
      [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(([, property, value]) => [property, value]),
    );
}

for (const tag of ["a", "button"]) {
  test(`small ${tag} pills keep the app's 40px visible height and a separate 48px target`, async () => {
    const { css } = await compiledControl("src/components/PillButton.astro", tag, "ghost", "sm");
    assert.match(css, /height:\s*40px/);
    assert.doesNotMatch(css, /min-height:\s*48px/);
    assert.match(css, /\.pill-sm\s*\{[^}]*min-inline-size:\s*44px;/);
    assert.match(css, /justify-content:\s*center/);
    const global = await readFile("src/styles/global.css", "utf8");
    assert.match(global, /\.pill-sm::before\s*\{[^}]*inset-block:\s*-4px/);
  });
  for (const variant of ["primary", "secondary", "ghost"]) {
    const label = `PillButton ${tag} ${variant}`;
    const control = () => compiledControl("src/components/PillButton.astro", tag, variant);

    test(`${label}: hover changes fill or label colour only`, async () => {
      const hover = stateDeclarations((await control()).css, "hover");
      assert.ok(hover.length > 0, "hover colour feedback survives");
      assert.deepEqual(
        hover.filter(([property]) => ["transform", "translate", "scale"].includes(property)),
        [],
        "hover must not declare transform, translate or scale",
      );
      assert.ok(hover.every(([property]) => ["background-color", "color"].includes(property)));
    });

    test(`${label}: press retains scale movement`, async () => {
      const active = Object.fromEntries(stateDeclarations((await control()).css, "active"));
      assert.equal(active.scale, "0.96", "press must retain scale(0.96)");
    });

    test(`${label}: hover colours use 240ms and press/release movement uses 160ms`, async () => {
      assert.deepEqual(transitionDurations(await control()), {
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
}

test("small pills keep a 44px inline floor through every stylesheet override", async () => {
  const global = await readFile("src/styles/global.css", "utf8");
  const landing = await readFile("src/styles/landing.css", "utf8");
  const base = global.match(/\.pill-sm\s*\{([^}]+)\}/)?.[1];
  assert.ok(base, "the shared small pill must declare its inline floor");
  assert.match(base, /min-inline-size:\s*44px;/);
  for (const [, selector, declarations] of `${global}\n${landing}`.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    if (!/\.pill-sm(?![\w-])/.test(selector)) continue;
    for (const [, value] of declarations.matchAll(/min-(?:inline-size|width):\s*([^;]+);/g)) {
      assert.match(value, /^\d+(?:\.\d+)?px$/);
      assert.ok(parseFloat(value) >= 44, `${selector.trim()} lowers the inline floor to ${value}`);
    }
  }
});

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
