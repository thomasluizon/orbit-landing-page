import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";

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
