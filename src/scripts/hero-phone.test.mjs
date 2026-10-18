import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";
import ts from "typescript";
import vm from "node:vm";

const source = (name) => readFileSync(`src/components/${name}.astro`, "utf8");
const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const hero = (await parse(source("Hero"))).ast;
const css = readFileSync("src/styles/landing.css", "utf8");
const rules = (selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => s.trim() === selector))
    .map(([, , declarations]) => declarations);
const slides = descendants(hero).filter((node) => attributes(node)["data-phone-slide"]);

test("every phone screen shares the status, 56px app header and 16px content inset", async () => {
  const device = descendants(hero).find((node) => attributes(node).class === "device-screen");
  assert.deepEqual(
    device.children
      .filter((node) => node.name)
      .slice(0, 2)
      .map((node) => attributes(node).class),
    ["device-status", "phone-carousel"],
  );
  assert.ok(existsSync("src/components/PhoneHeader.astro"), "one header owns phone spacing");
  assert.match(source("PhoneHeader"), /<header class="phone-app-header">/);
  const header = rules(".phone-app-header");
  assert.equal(header.length, 1, "no width-specific header spacing");
  assert.match(header[0], /min-block-size:\s*56px;/);
  assert.match(header[0], /flex-shrink:\s*0;/);
  assert.match(header[0], /align-items:\s*center;/);
  assert.match(header[0], /gap:\s*12px;/);
  assert.match(header[0], /padding-inline:\s*16px;/);
  assert.match(rules(".phone-content").join("\n"), /padding-block-start:\s*16px;/);
  for (const slide of slides) {
    let children = slide.children.filter((node) => node.name);
    if (children[0]?.name === "AstraDemo") {
      const ast = (await parse(source("AstraDemo"))).ast;
      children = descendants(ast)
        .find((node) => attributes(node).id === "astra-demo")
        .children.filter((node) => node.name);
    }
    assert.equal(children[0]?.name, "PhoneHeader", attributes(slide)["data-phone-slide"]);
    assert.ok(attributes(children[1]).class?.split(" ").includes("phone-content"));
  }
  assert.match(source("AstraDemo"), /<PhoneHeader>\s*<AstraGlyph size=\{16\} \/>\s*<h2/);
});

test("proposal actions retain the app small pill geometry and separated targets", () => {
  const pills = rules(".demo-preview-actions .pill-sm");
  assert.ok(pills.length);
  assert.match(pills[0], /block-size:\s*40px;/);
  assert.match(pills[0], /border-radius:\s*var\(--radius-full\);/);
  assert.match(pills[0], /padding-inline:\s*18px;/);
  assert.match(pills[0], /flex-shrink:\s*0;/);
  for (const rule of pills) {
    for (const [, size] of rule.matchAll(/font-size:\s*([^;]+);/g))
      assert.equal(size.trim(), "var(--fs-sm)");
    assert.doesNotMatch(rule, /(?:scale|transform|overflow):/);
  }
  const shared = readFileSync("src/styles/global.css", "utf8");
  assert.match(shared, /\.pill-sm::before\s*\{[^}]*inset-block:\s*-4px;/);
  assert.match(shared, /inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  for (const row of rules(".demo-preview-actions")) {
    assert.match(row, /flex-wrap:\s*nowrap;/);
    assert.match(row, /gap:\s*12px;/);
    assert.match(row, /justify-content:\s*flex-end;/);
  }
  const actions = source("AstraDemo").match(
    /<div class="demo-preview-actions">([\s\S]*?)<\/div>/,
  )[1];
  assert.deepEqual(
    [...actions.matchAll(/id="demo-([^"]+)"/g)].map(([, id]) => id),
    ["reject", "edit", "approve"],
  );
  assert.deepEqual(
    [...actions.matchAll(/variant="([^"]+)"/g)].map(([, variant]) => variant),
    ["ghost", "ghost", "primary"],
  );
});

test("the phone and its pager contain exactly chat and Today", () => {
  assert.deepEqual(
    slides.map((node) => attributes(node)["data-phone-slide"]),
    ["chat", "today"],
  );
  assert.match(source("Hero"), /\(\["chat", "today"\] as const\)\.map/);
  assert.doesNotMatch(source("Hero"), /<ProductCard kind="today"/);
});

test("Today fills the screen with one Astra line and five mixed-state habit rows", () => {
  const today = slides.find((node) => attributes(node)["data-phone-slide"] === "today");
  const nodes = descendants(today);
  const rows = nodes.filter((node) => node.name === "HabitRow");
  assert.equal(rows.length, 5);
  assert.ok(rows.some((node) => attributes(node).timing === "done"));
  assert.ok(rows.some((node) => attributes(node).timing === "todo"));
  assert.ok(rows.some((node) => attributes(node).time));
  assert.ok(rows.some((node) => attributes(node).days));
  assert.equal(nodes.filter((node) => node.name === "AstraGlyph").length, 1);
  assert.equal(nodes.filter((node) => node.name === "ChevronLeft").length, 1);
  assert.equal(nodes.filter((node) => node.name === "ChevronRight").length, 1);
  assert.ok(nodes.some((node) => attributes(node).name === "today.date"));
  assert.match(rules(".phone-today-habits").join("\n"), /flex:\s*1;/);
  assert.match(
    rules(".phone-today-habits").join("\n"),
    /grid-template-rows:\s*repeat\(5, minmax\(64px, 1fr\)\);/,
  );
});

test("side cards balance two items per column", () => {
  const columns = descendants(hero).filter((node) =>
    Object.hasOwn(attributes(node), "data-hero-column"),
  );
  assert.deepEqual(
    columns.map(
      (column) =>
        descendants(column).filter((node) => Object.hasOwn(attributes(node), "data-hero-float"))
          .length,
    ),
    [2, 2],
  );
});

test("no side card repeats phone copy in either locale", async () => {
  const copy = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports: copy },
  );
  const columns = descendants(hero).filter((node) =>
    Object.hasOwn(attributes(node), "data-hero-column"),
  );
  const product = (await parse(source("ProductCard"))).ast;
  const templates = new Map([["AstraDemo", (await parse(source("AstraDemo"))).ast]]);
  async function texts(node, language) {
    const attrs = attributes(node);
    const table = copy.landingCopy[language];
    if (node.name === "Copy") return [table[attrs.name]];
    if (attrs["data-i18n"]) return [copy.translations[language][attrs["data-i18n"]]];
    if (node.name === "HabitRow")
      return [
        table[`product.${attrs.habit}`],
        table[`product.${attrs.timing ?? "morning"}`],
      ].filter(Boolean);
    if (node.name === "ProductCard") {
      const branch = descendants(product).find(
        (child) =>
          child.type === "expression" &&
          child.children?.some(
            (part) => part.type === "text" && part.value.includes(`kind === "${attrs.kind}"`),
          ),
      );
      assert.ok(branch, attrs.kind);
      return (
        await Promise.all((branch.children ?? []).map((child) => texts(child, language)))
      ).flat();
    }
    const template = templates.get(node.name);
    if (template) return texts(template, language);
    return (await Promise.all((node.children ?? []).map((child) => texts(child, language)))).flat();
  }
  for (const language of ["en", "pt-BR"]) {
    const phoneText = new Set(
      (await Promise.all(slides.map((slide) => texts(slide, language)))).flat(),
    );
    for (const column of columns) {
      for (const text of await texts(column, language))
        assert.ok(!phoneText.has(text), `${language}: ${text}`);
    }
  }
});
