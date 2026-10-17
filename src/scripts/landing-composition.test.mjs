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

test("pricing actions stay at the bottom independently of list length and hug their labels", () => {
  const plans = descendants(components.get("Pricing")).filter((node) => node.name === "article");
  assert.equal(plans.length, 2);
  for (const plan of plans) {
    const children = plan.children.filter((node) => node.name);
    const action = children.at(-1);
    assert.equal(attributes(action).class, "plan-action");
    assert.equal(descendants(action).filter((node) => node.name === "PillButton").length, 1);
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  const card = css.match(/\.plan-card\s*\{([^}]+)\}/)[1];
  assert.match(card, /display:\s*flex/);
  assert.match(card, /flex-direction:\s*column/);
  assert.match(card, /align-items:\s*flex-start/);
  assert.doesNotMatch(card, /grid-template-rows:/);
  assert.match(css, /\.plan-action\s*\{[^}]*margin-block-start:\s*auto/);
  assert.doesNotMatch(css, /\.plan-(?:card|action)[^{]*\{[^}]*inline-size:\s*100%/);
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
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.trust-strip\s*\{[^}]*padding:\s*24px 16px/);
  const rules = [...css.matchAll(/\.trust-content\s*\{([^}]+)\}/g)];
  assert.equal(rules.length, 1, "all viewports keep the same three-column layout");
  assert.match(rules[0][1], /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(rules[0][1], /gap:\s*8px/);
  assert.match(
    css,
    /\.trust-fact dt\s*\{[^}]*font-family:\s*var\(--font-display\);[^}]*font-size:\s*var\(--fs-xl\)/,
  );
  assert.match(css, /\.trust-fact dd\s*\{[^}]*font-size:\s*var\(--fs-xs\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-lg\)/);
  const copy = readFileSync("src/i18n/translations.ts", "utf8");
  for (const key of ["trust.free.title", "trust.approval.title", "hero.platforms"]) {
    const values = [
      ...copy.matchAll(new RegExp(`"${key.replaceAll(".", "\\.")}": "([^"]+)"`, "g")),
    ];
    assert.equal(values.length, 2);
    for (const [, value] of values) assert.ok(value.split(/\s+/u).length <= 2, value);
  }
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
  assert.match(css, /\.trust-strip \+ \.section\s*\{\s*padding-block-start:\s*96px/);
});

test("section rhythm uses fixed spacing without viewport minimums or feature pin spacers", () => {
  const gridAction = descendants(components.get("Features")).find(
    (node) => node.name === "PillButton",
  );
  assert.equal(
    gridAction,
    undefined,
    "the grid cannot repeat the next feature row's Start free action",
  );
  assert.equal(
    descendants(components.get("FeatureRows")).filter((node) => node.name === "PillButton").length,
    3,
  );
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
  ]) {
    assert.match(css, new RegExp(`--landing-${name}:\\s*${width}px`));
  }
  assert.match(css, /\.section-inner\s*\{[^}]*inline-size:\s*min\(var\(--landing-content\)/);
  assert.match(css, /\.pricing-grid\s*\{[^}]*max-inline-size:\s*var\(--landing-content\)/);
  assert.match(css, /\.faq-list\s*\{[^}]*max-inline-size:\s*var\(--landing-narrow\)/);
  assert.match(css, /\.header-content\s*\{[^}]*max-inline-size:\s*var\(--landing-narrow\)/);
  const panel = css.match(/\.feature-art\s*\{([^}]+)\}/)[1];
  assert.match(panel, /max-inline-size:\s*680px/);
  assert.match(panel, /padding:\s*48px/);
  assert.doesNotMatch(panel, /(?:min-)?block-size:/);
  const busy = descendants(components.get("FeatureRows")).find((node) =>
    attributes(node).class?.includes("feature-art-busy"),
  );
  assert.ok(busy, "the busy-day panel owns the overlapping composition");
  assert.match(
    css,
    /\.feature-stack\s*\{[^}]*grid-template-rows:\s*auto 48px auto;[^}]*inline-size:\s*400px;[^}]*max-inline-size:\s*100%;[^}]*justify-self:\s*center/,
  );
  assert.match(css, /\.feature-primary\s*\{[^}]*grid-row:\s*1 \/ 3/);
  assert.match(css, /\.feature-primary > \.product-card\s*\{[^}]*padding:\s*16px 16px 48px/);
  assert.match(
    css,
    /\.feature-secondary\s*\{[^}]*z-index:\s*2;[^}]*grid-row:\s*2 \/ 4;[^}]*justify-self:\s*end;[^}]*inset-inline-end:\s*48px;[^}]*inline-size:\s*240px/,
  );
  assert.match(
    css,
    /\.progress-reply\s*\{[^}]*justify-self:\s*start;[^}]*inset-inline-start:\s*48px;[^}]*inset-inline-end:\s*auto/,
  );
  for (const [selector, size] of [
    ["product-card h3", "lg"],
    ["product-reply", "base"],
    ["proactive-line", "base"],
    ["product-caption", "sm"],
  ]) {
    assert.match(
      css,
      new RegExp(`\\.feature-art \\.${selector}\\s*\\{[^}]*font-size:\\s*var\\(--fs-${size}\\)`),
    );
  }
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.feature-art\s*\{[^}]*padding:\s*24px/);
  assert.match(
    mobile,
    /\.feature-stack\s*\{[^}]*grid-template-rows:\s*auto 32px auto;[^}]*inline-size:\s*100%/,
  );
  assert.match(
    mobile,
    /\.feature-secondary\s*\{[^}]*inset-inline-end:\s*-8px;[^}]*inline-size:\s*min\(240px, calc\(100% \+ 16px\)\)/,
  );
  assert.match(mobile, /\.progress-reply\s*\{[^}]*inset-inline-start:\s*-8px/);
  const rows = readFileSync("src/components/FeatureRows.astro", "utf8");
  assert.match(rows, /class="feature-art feature-art-progress"/);
  assert.match(
    rows,
    /class="feature-art feature-art-restart"[\s\S]*kind="restart"[\s\S]*class="feature-secondary feature-return"[\s\S]*kind="walk"/,
  );
  const stacks = descendants(components.get("FeatureRows")).filter(
    (node) => attributes(node).class === "feature-stack",
  );
  assert.equal(stacks.length, 3);
  for (const stack of stacks) {
    const children = stack.children.filter((node) => node.name);
    assert.equal(attributes(children[0]).class, "feature-primary");
    assert.ok(attributes(children[1]).class.includes("feature-secondary"));
  }
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

test("each week bar and its localized weekday share one of seven equal columns", async () => {
  const product = (await parse(readFileSync("src/components/ProductCard.astro", "utf8"))).ast;
  const column = descendants(product).find((node) => attributes(node).class === "chart-column");
  assert.ok(column, "the shared hero and feature chart owns a column for each day");
  const children = descendants(column);
  assert.ok(children.some((node) => attributes(node).class === "chart-bar"));
  const label = children.find((node) => attributes(node).class === "chart-day");
  assert.ok(attributes(label)["data-copy-en"]);
  assert.ok(attributes(label)["data-copy-pt"]);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.week-chart\s*\{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(
    css,
    /\.chart-column\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*8px/,
  );
  assert.match(css, /\.chart-day\s*\{[^}]*font-size:\s*var\(--fs-xs\);[^}]*text-align:\s*center/);
  assert.doesNotMatch(css, /word-spacing:|\.chart-days/);
});

test("the compact week composition pairs Astra's line with one chart", () => {
  const composition = descendants(components.get("FeatureRows")).find((node) =>
    attributes(node).class?.includes("feature-art-progress"),
  );
  const nodes = descendants(composition);
  const primary = nodes.find((node) => attributes(node).class === "feature-primary");
  assert.ok(primary, "the request and chart form the primary product card group");
  const children = primary.children.filter((node) => node.name);
  assert.equal(children.length, 1);
  assert.equal(attributes(children[0]).kind, "week");
  const reply = nodes.find((node) => attributes(node).class?.includes("progress-reply"));
  assert.ok(descendants(reply).some((node) => node.name === "AstraGlyph"));
  assert.ok(descendants(reply).some((node) => attributes(node).name === "product.progressReply"));
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.progress-reply svg\s*\{[^}]*inline-size:\s*16px;[^}]*block-size:\s*16px/);
});

test("feature and promise grids share an icon-above-copy anatomy and content-sized cards", () => {
  for (const name of ["Features", "Security"]) {
    const card = descendants(components.get(name)).find((node) => node.name === "article");
    const icon = descendants(card).find((node) => node.name === "OutlineIcon");
    assert.ok(icon, `${name} uses a Tabler outline`);
    const copy = descendants(card).find((node) => attributes(node).class?.endsWith("-copy"));
    assert.ok(descendants(copy).some((node) => node.name === "h3"));
    assert.ok(descendants(copy).some((node) => node.name === "p"));
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.feature-card,\s*\.promise-card\s*\{[^}]*gap:\s*24px;[^}]*padding:\s*32px/);
  assert.match(css, /\.feature-card-copy,\s*\.promise-copy\s*\{[^}]*gap:\s*12px/);
  assert.match(
    css,
    /\.feature-card h3,\s*\.promise-copy h3\s*\{[^}]*font-family:\s*var\(--font-display\);[^}]*font-size:\s*var\(--fs-3xl\);[^}]*font-weight:\s*500/,
  );
  assert.match(css, /\.feature-card p,\s*\.promise-copy p\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  assert.doesNotMatch(
    css,
    /\.(?:feature|promise)-card\s*\{[^}]*(?:min-block-size|grid-template-columns):/,
  );
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(mobile, /\.feature-card,\s*\.promise-card\s*\{[^}]*padding:\s*24px/);
  assert.match(
    mobile,
    /\.feature-card h3,\s*\.promise-copy h3\s*\{[^}]*font-size:\s*var\(--fs-2xl\)/,
  );
  assert.match(
    mobile,
    /\.feature-grid,\s*\.security-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*16px/,
  );
});

test("feature demonstrations use compact rhythm and trim only their primary product content", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.feature-section\s*\{[^}]*padding-block-start:\s*96px/);
  assert.match(css, /\.feature-intro\s*\{[^}]*gap:\s*16px/);
  assert.match(css, /\.feature-copy\s*\{[^}]*gap:\s*24px/);
  assert.match(css, /\.feature-copy \.section-title\s*\{[^}]*font-size:\s*var\(--fs-4xl\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.feature-section\s*\{[^}]*padding-block-start:\s*64px/);
  const source = readFileSync("src/components/FeatureRows.astro", "utf8");
  assert.equal((source.match(/class="section feature-section"/g) ?? []).length, 3);
  assert.match(source, /kind="today" compact/);
  const product = readFileSync("src/components/ProductCard.astro", "utf8");
  assert.match(product, /!compact && \(\s*<div class="habit-row"/);
  assert.doesNotMatch(css.match(/\.feature-art\s*\{([^}]+)\}/)[1], /min-|block-size/);
});
