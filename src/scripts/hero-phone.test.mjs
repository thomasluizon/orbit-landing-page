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
