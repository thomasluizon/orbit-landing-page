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
  assert.equal(
    descendants(sections[0]).filter(
      (node) => node.name === "a" && attributes(node).class !== "demo-composer",
    ).length,
    0,
  );
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
      row.children
        .filter((node) => node.name === "div")
        .map((node) => attributes(node).class.split(" ")[0]),
      ["feature-copy", "feature-composition"],
    );
  }
});

test("How it works lands on the feature grid at the retained 96px offset", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  assert.ok(descendants(header).some((node) => attributes(node).href === "#features"));
  assert.equal(attributes(sections[2]).id, "features");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /scroll-margin-block-start:\s*96px/);
  assert.match(
    css,
    /\.trust-strip \+ \.section\s*\{\s*padding-block-start:\s*calc\(var\(--landing-section-gap\) - 32px\)/,
  );
});

test("section rhythm uses fixed spacing without viewport minimums or feature pin spacers", () => {
  const gridAction = descendants(components.get("Features")).find(
    (node) => node.name === "PillButton",
  );
  assert.equal(attributes(gridAction).variant, "ghost");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /--landing-section-gap:\s*160px/);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*--landing-section-gap:\s*96px/);
  assert.match(
    css,
    /\.section,\s*\.final-section\s*\{[^}]*padding-block:\s*var\(--landing-section-gap\) 0/,
  );
  assert.doesNotMatch(css, /min-block-size:[^;}]*svh/);
  assert.doesNotMatch(
    readFileSync("src/scripts/landing-motion.ts", "utf8"),
    /trigger:\s*(?:row|composition)|pinSpacing:\s*true/,
  );
});

test("grids, pricing, FAQ and product panels share their container system", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  for (const [name, width] of [
    ["content", 1072],
    ["narrow", 896],
    ["panel", 640],
  ]) {
    assert.match(css, new RegExp(`--landing-${name}:\\s*${width}px`));
  }
  assert.match(css, /\.section-inner\s*\{[^}]*inline-size:\s*min\(var\(--landing-content\)/);
  assert.match(css, /\.pricing-grid\s*\{[^}]*max-inline-size:\s*var\(--landing-content\)/);
  assert.match(css, /\.faq-list\s*\{[^}]*max-inline-size:\s*var\(--landing-narrow\)/);
  assert.match(css, /\.header-content\s*\{[^}]*max-inline-size:\s*var\(--landing-narrow\)/);
  assert.match(
    css,
    /\.feature-art\s*\{[^}]*inline-size:\s*min\(var\(--landing-panel\), 100%\);[^}]*padding:\s*32px/,
  );
  assert.doesNotMatch(
    css,
    /\.section\[data-section="details"\] \.feature-art\s*\{[^}]*inline-size:\s*100%/,
  );
  const busy = descendants(components.get("FeatureRows")).find((node) =>
    attributes(node).class?.includes("feature-art-busy"),
  );
  assert.ok(busy, "the busy-day panel owns the overlapping composition");
  assert.match(css, /\.feature-art-busy > \.product-today\s*\{[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /\.feature-reminder\s*\{[^}]*grid-row:\s*5 \/ span 2/);
});

test("example disclosure belongs once below each composition, outside the product surfaces", async () => {
  const card = (await parse(readFileSync("src/components/ProductCard.astro", "utf8"))).ast;
  assert.ok(!descendants(card).some((node) => attributes(node).name === "product.example"));
  assert.ok(
    !descendants(components.get("AstraDemo")).some(
      (node) => attributes(node)["data-i18n"] === "demo.example",
    ),
  );
  assert.equal(
    descendants(sections[0]).filter((node) => attributes(node).class === "composition-caption")
      .length,
    1,
  );
  const panels = descendants(components.get("FeatureRows")).filter(
    (node) => attributes(node).class === "feature-composition",
  );
  assert.equal(panels.length, 3);
  for (const panel of panels) {
    const children = panel.children.filter((node) => node.name);
    assert.ok(attributes(children[0]).class.includes("feature-art"));
    assert.equal(attributes(children[1]).class, "composition-caption");
    assert.equal(
      descendants(children[1]).filter((node) => attributes(node).name === "product.example").length,
      1,
    );
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.composition-caption\s*\{[^}]*font-size:\s*var\(--fs-xs\)/);
});
