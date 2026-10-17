import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";

const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const componentNames = [
  "Hero",
  "AstraDemo",
  "TrustStrip",
  "Features",
  "FeatureRows",
  "Security",
  "Pricing",
  "Faq",
  "FinalCta",
  "Footer",
];
const components = new Map(
  await Promise.all(
    componentNames.map(async (name) => [
      name,
      (await parse(readFileSync(`src/components/${name}.astro`, "utf8"))).ast,
    ]),
  ),
);
const page = (await parse(readFileSync("src/pages/index.astro", "utf8"))).ast;
function expand(node) {
  const source = components.get(node.name);
  if (source) return expand(source);
  return [{ ...node, children: (node.children ?? []).flatMap(expand) }];
}
function descendants(node) {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}
const nodes = expand(page).flatMap(descendants);
const sections = nodes.filter((node) => attributes(node)["data-section"]);

test("the owning page follows Pierre's section order with Orbit product compositions", () => {
  assert.deepEqual(
    sections.map((node) => attributes(node)["data-section"]),
    [
      "hero",
      "trust",
      "features",
      "details",
      "progress",
      "restart",
      "security",
      "pricing",
      "faq",
      "final",
      "footer",
    ],
  );
  assert.equal(nodes.filter((node) => node.name === "h1").length, 1);
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /Connect/);
});

test("each section has at most one filled accent action, including the expanded Astra demo", () => {
  for (const section of sections) {
    const actions = descendants(section).filter(
      (node) => node.name === "PillButton" && (attributes(node).variant ?? "primary") === "primary",
    );
    assert.ok(
      actions.length <= 1,
      `${attributes(section)["data-section"]} has ${actions.length} accent actions`,
    );
  }
});

test("the hero keeps copy and actions above the centered device", () => {
  const hero = sections[0];
  assert.deepEqual(
    hero.children.filter((node) => node.name === "div").map((node) => attributes(node).class),
    ["hero-copy", "hero-controls", "hero-pin-range"],
  );
  const stage = descendants(hero).find((node) => attributes(node).id === "hero-stage");
  assert.ok(descendants(stage).some((node) => attributes(node).class === "hero-device"));
  assert.equal(
    descendants(stage).filter((node) => Object.hasOwn(attributes(node), "data-hero-float")).length,
    5,
  );
});

test("native FAQ disclosure and the original waitlist entry remain reachable", () => {
  const faq = components.get("Faq");
  assert.ok(
    descendants(faq).some(
      (node) => node.name === "details" && attributes(node).name === "orbit-questions",
    ),
  );
  assert.ok(
    nodes.some((node) => attributes(node).id === "ios-trigger" && attributes(node).href === "#ios"),
  );
});

test("the header opens Orbit while the hero has only its install action", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  const action = descendants(header).find((node) => node.name === "PillButton");
  assert.equal(attributes(action).href, "appUrl");
  assert.equal(attributes(action).variant, "secondary");
  assert.equal(attributes(action).analyticsEvent, "header_app_cta_clicked");
  assert.equal(descendants(sections[0]).filter((node) => node.name === "a").length, 0);
  for (const name of ["Faq", "Footer"]) {
    assert.ok(descendants(components.get(name)).some((node) => attributes(node).href === "#ios"));
  }
});

test("the trust strip gives each of its three facts a heading and a caption", () => {
  const trust = descendants(components.get("TrustStrip"));
  assert.equal(trust.filter((node) => node.name === "dt").length, 3);
  assert.equal(trust.filter((node) => node.name === "dd").length, 3);
});

test("feature copy precedes its centered product composition", () => {
  const rows = descendants(components.get("FeatureRows")).filter((node) =>
    attributes(node).class?.split(" ").includes("feature-row"),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.deepEqual(
      row.children.filter((node) => node.name === "div").map((node) => attributes(node).class),
      ["feature-copy", "feature-art"],
    );
  }
});

test("How it works lands on the feature grid at the retained 96px offset", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  assert.ok(descendants(header).some((node) => attributes(node).href === "#features"));
  assert.equal(attributes(sections[2]).id, "features");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /scroll-margin-block-start:\s*96px/);
  assert.match(css, /\.trust-strip \+ \.section\s*\{\s*padding-block-start:\s*80px/);
  assert.match(
    css,
    /@media \(max-width: 47\.999rem\)[\s\S]*\.trust-strip \+ \.section\s*\{\s*padding-block-start:\s*64px/,
  );
});
