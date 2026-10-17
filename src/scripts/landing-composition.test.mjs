import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
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
const copyTables = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: copyTables },
);
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

test("FAQ disclosure updates aria-expanded and controls its own answer without replacing native behavior", () => {
  const faq = descendants(components.get("Faq"));
  const summary = faq.find((node) => node.name === "summary");
  const answer = faq.find((node) => node.name === "p");
  assert.equal(attributes(summary)["aria-expanded"], "false");
  assert.equal(attributes(summary)["aria-controls"], attributes(answer).id);
  const chevron = faq.find((node) => node.name === "ChevronDown");
  assert.equal(attributes(chevron).size, "16");
  assert.equal(attributes(chevron)["aria-hidden"], "true");
  const source = readFileSync("src/components/Faq.astro", "utf8");
  const keys = vm.runInNewContext(source.match(/const questions = (\[[^\]]+\])/)[1]);
  const code = ts.transpileModule(readFileSync("src/scripts/faq.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const entry = readFileSync("src/pages/index.astro", "utf8");
  assert.match(entry, /import "\.\.\/scripts\/faq"/);
  for (const initiallyOpen of [false, true]) {
    const items = keys.map((key, index) => {
      const control = {
        attributes: {
          "aria-expanded": "false",
          "aria-controls": vm.runInNewContext(attributes(summary)["aria-controls"], { key }),
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
      const listeners = new Map();
      return {
        open: initiallyOpen && index === 0,
        control,
        listeners,
        answerId: vm.runInNewContext(attributes(answer).id, { key }),
        querySelector(selector) {
          assert.equal(selector, "summary");
          return control;
        },
        addEventListener(name, callback) {
          listeners.set(name, callback);
        },
      };
    });
    vm.runInNewContext(code, {
      document: {
        querySelectorAll(selector) {
          assert.equal(selector, ".faq-list details");
          return items;
        },
      },
    });
    assert.equal(new Set(items.map((item) => item.answerId)).size, keys.length);
    for (const item of items) {
      assert.equal(item.control.attributes["aria-controls"], item.answerId);
      assert.equal(item.control.attributes["aria-expanded"], String(item.open));
      assert.deepEqual([...item.listeners.keys()], ["toggle"]);
      for (const open of [true, false]) {
        item.open = open;
        item.listeners.get("toggle")();
        assert.equal(item.control.attributes["aria-expanded"], String(open));
      }
    }
  }
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
  assert.match(css, /\.trust-strip\s*\{[^}]*padding-inline:\s*var\(--landing-gutter\)/);
  const rules = [...css.matchAll(/\.trust-content\s*\{([^}]+)\}/g)];
  assert.equal(rules.length, 2, "trust facts stack only below their measured minimum width");
  assert.match(rules[0][1], /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(rules[0][1], /gap:\s*12px/);
  const stacked = css.slice(
    css.indexOf("@media (width < 38.625rem)"),
    css.indexOf("@media (max-width: 24.999rem)"),
  );
  assert.match(stacked, /\.trust-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(stacked, /\.trust-content\s*\{[^}]*justify-items:\s*center/);
  assert.match(stacked, /\.trust-content\s*\{[^}]*gap:\s*16px/);
  assert.equal(rules[1][1], stacked.match(/\.trust-content\s*\{([^}]+)\}/)[1]);
  assert.match(
    css,
    /\.trust-fact dt\s*\{[^}]*font-family:\s*var\(--font-display\);[^}]*font-size:\s*var\(--fs-2xl\)/,
  );
  assert.match(
    css,
    /\.trust-fact dd\s*\{[^}]*font-size:\s*var\(--fs-xs\);[^}]*color:\s*var\(--color-fg-3\)/,
  );
  assert.match(rules[0][1], /inline-size:\s*min\(var\(--landing-content\), 100%\)/);
  assert.match(rules[0][1], /padding-block:\s*32px/);
  assert.match(
    rules[0][1],
    /inset 0 1px 0 var\(--color-hairline\),\s*inset 0 -1px 0 var\(--color-hairline\)/,
  );
  assert.doesNotMatch(css.match(/\.trust-strip\s*\{([^}]+)\}/)[1], /shadow|border/);
  const narrow = css.slice(css.indexOf("@media (max-width: 24.999rem)"));
  assert.match(narrow, /\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-lg\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-xl\)/);
  assert.match(css, /\.trust-fact dt\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.trust-fact dd\s*\{[^}]*white-space:\s*nowrap/);
  const compact = css.slice(
    css.indexOf("@media (max-width: 39.999rem)"),
    css.indexOf("@media (width < 38.625rem)"),
  );
  assert.match(compact, /\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-sm\)/);
  assert.doesNotMatch(compact, /\.trust-content/);
  assert.match(css, /\.trust-fact dt\s*\{[^}]*font-weight:\s*500/);
});

test("the measured trust copy determines the smallest whole-pixel stacking breakpoint", () => {
  const measurements = [
    ["trust.free.title", ["Free to start", 84.448], ["Comece grátis", 96.95]],
    ["trust.free.caption", ["Pro adds more Astra", 111.504], ["O Pro libera mais Astra", 124.692]],
    ["trust.approval.title", ["You approve", 83.314], ["Você aprova", 82.936]],
    [
      "trust.approval.caption",
      ["every change Astra proposes", 158.988],
      ["cada mudança que a Astra propõe", 187.26],
    ],
    ["hero.platforms", ["Android and web", 113.722], ["Android e web", 96.236]],
    [
      "trust.platforms.caption",
      ["iPhone waitlist open", 110.484],
      ["lista do iPhone aberta", 118.572],
    ],
  ];
  const widths = [];
  for (const [key, en, pt] of measurements) {
    for (const [lang, [text, width]] of [
      ["en", en],
      ["pt-BR", pt],
    ]) {
      assert.equal(
        { ...copyTables.translations[lang], ...copyTables.landingCopy[lang] }[key],
        text,
      );
      widths.push(width);
    }
  }
  const gutter = 16;
  const gap = 12;
  const columnAt = (viewport) => (viewport - gutter * 2 - gap * 2) / 3;
  for (const viewport of [400, 412]) assert.ok(widths.some((width) => width > columnAt(viewport)));
  const breakpoint = Math.ceil(Math.max(...widths) * 3 + gutter * 2 + gap * 2);
  assert.equal(breakpoint, 618);
  assert.ok(widths.every((width) => width <= columnAt(breakpoint)));
  assert.ok(widths.some((width) => width > columnAt(breakpoint - 1)));
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    new RegExp(`@media \\(width < ${breakpoint / 16}rem\\)\\s*\\{\\s*\\.trust-content`),
  );
});

test("the trust strip renders the approved checkable facts in both locales", () => {
  const trust = descendants(components.get("TrustStrip"));
  for (const name of [
    "trust.free.title",
    "trust.free.caption",
    "trust.approval.title",
    "trust.approval.caption",
    "trust.platforms.caption",
  ]) {
    assert.ok(trust.some((node) => node.name === "Copy" && attributes(node).name === name));
  }
  assert.ok(trust.some((node) => attributes(node)["data-i18n"] === "hero.platforms"));
  for (const [lang, expected] of [
    [
      "en",
      [
        "Free to start",
        "Pro adds more Astra",
        "You approve",
        "every change Astra proposes",
        "Android and web",
        "iPhone waitlist open",
      ],
    ],
    [
      "pt-BR",
      [
        "Comece grátis",
        "O Pro libera mais Astra",
        "Você aprova",
        "cada mudança que a Astra propõe",
        "Android e web",
        "lista do iPhone aberta",
      ],
    ],
  ]) {
    const copy = { ...copyTables.translations[lang], ...copyTables.landingCopy[lang] };
    assert.deepEqual(
      [
        "trust.free.title",
        "trust.free.caption",
        "trust.approval.title",
        "trust.approval.caption",
        "hero.platforms",
        "trust.platforms.caption",
      ].map((key) => copy[key]),
      expected,
    );
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

test("feature product surfaces alternate their overlap inside a centered 680px stage", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const art = css.match(/^\.feature-art\s*\{([^}]+)\}/m)[1];
  assert.doesNotMatch(art, /background|box-shadow|border(?:-radius)?:/);
  const row = css.match(/\.feature-row\s*\{([^}]+)\}/)[1];
  assert.match(row, /inline-size:\s*100%/);
  assert.match(row, /max-inline-size:\s*960px/);
  assert.match(row, /margin-inline:\s*auto/);
  assert.match(row, /gap:\s*32px/);
  assert.match(
    css,
    /\.feature-composition\s*\{[^}]*inline-size:\s*min\(680px, 100%\);[^}]*justify-self:\s*center/,
  );
  assert.doesNotMatch(css, /\[data-section="(?:progress|restart)"\] \.feature-composition/);
  assert.match(css, /\.feature-art-progress \.feature-primary\s*\{[^}]*justify-self:\s*end/);
  assert.match(css, /\.feature-art-progress \.feature-secondary\s*\{[^}]*justify-self:\s*start/);
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(mobile, /\.feature-composition\s*\{[^}]*inline-size:\s*100%/);
  assert.match(mobile, /\.feature-art\s*\{[^}]*max-inline-size:\s*none/);
  assert.match(mobile, /--landing-gutter:\s*16px/);
  assert.match(mobile, /\.feature-section\s*\{[^}]*padding-block-start:\s*64px/);
});

test("How it works lands on the feature grid at the retained 96px offset", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  assert.ok(descendants(header).some((node) => attributes(node).href === "#features"));
  assert.equal(attributes(sections[2]).id, "features");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /scroll-margin-block-start:\s*96px/);
  assert.match(css, /\.trust-strip \+ \.section\s*\{\s*padding-block-start:\s*96px/);
});

test("the feature grid closes with one primary action and the feature rows use ghost actions", () => {
  const gridAction = descendants(components.get("Features")).find(
    (node) => node.name === "PillButton",
  );
  assert.ok(gridAction, "the grid has a closing Start free action");
  assert.equal(attributes(gridAction).variant, "primary");
  assert.equal(attributes(gridAction).class, "feature-grid-action");
  assert.equal(attributes(gridAction).href, "appUrl");
  assert.equal(attributes(gridAction).analyticsEvent, "hero_app_cta_clicked");
  assert.equal(attributes(gridAction).analyticsSurface, "features");
  assert.ok(descendants(gridAction).some((node) => attributes(node).name === "action.start"));
  const rows = descendants(components.get("FeatureRows")).filter(
    (node) => node.name === "PillButton",
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(attributes(row).variant, "ghost");
    assert.equal(attributes(row).analyticsEvent, attributes(gridAction).analyticsEvent);
    assert.equal(attributes(row).href, "appUrl");
    assert.ok(descendants(row).some((node) => attributes(node).name === "action.start"));
  }
  assert.deepEqual(
    rows.map((node) => attributes(node).analyticsSurface),
    ["details", "progress", "restart"],
  );
  const featureEntry = descendants(page).find((node) => node.name === "Features");
  assert.equal(attributes(featureEntry).appUrl, "appUrl");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.feature-grid-action\s*\{[^}]*justify-self:\s*center/);
  assert.match(css, /\.section-inner\s*\{[^}]*gap:\s*32px/);
});

test("the recommended plan keeps its canonical inset ring and selected tint", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.plan-pro\s*\{[^}]*background:\s*var\(--color-primary-dim\);[^}]*box-shadow:\s*inset 0 0 0 1\.5px var\(--color-primary\)/,
  );
});

test("section rhythm uses fixed spacing without viewport minimums or feature pin spacers", () => {
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
  assert.match(panel, /padding:\s*0/);
  assert.doesNotMatch(panel, /(?:min-)?block-size:/);
  const busy = descendants(components.get("FeatureRows")).find((node) =>
    attributes(node).class?.includes("feature-art-busy"),
  );
  assert.ok(busy, "the busy-day panel owns the overlapping composition");
  assert.match(
    css,
    /\.feature-stack\s*\{[^}]*inline-size:\s*calc\(440px \+ 280px - 48px\);[^}]*max-inline-size:\s*100%;[^}]*justify-self:\s*center/,
  );
  assert.match(css, /\.feature-primary\s*\{[^}]*grid-area:\s*1 \/ 1;[^}]*inline-size:\s*440px/);
  assert.match(
    css,
    /\.feature-secondary\s*\{[^}]*z-index:\s*2;[^}]*grid-area:\s*1 \/ 1;[^}]*justify-self:\s*end;[^}]*inline-size:\s*280px;[^}]*margin-block-start:\s*48px/,
  );
  for (const [selector, size] of [
    ["product-card h3", "lg"],
    ["product-reply", "base"],
    ["proactive-line", "base"],
    ["product-caption", "xs"],
  ]) {
    assert.match(
      css,
      new RegExp(`\\.feature-art \\.${selector}\\s*\\{[^}]*font-size:\\s*var\\(--fs-${size}\\)`),
    );
  }
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.feature-stack\s*\{[^}]*inline-size:\s*100%/);
  assert.match(
    mobile,
    /\.feature-primary,\s*\.feature-secondary\s*\{[^}]*grid-area:\s*auto;[^}]*inline-size:\s*100%/,
  );
  assert.match(mobile, /\.feature-secondary\s*\{[^}]*margin-block-start:\s*-16px/);
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

test("feature compositions keep real product dimensions and never shrink their typography", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.feature-art \.habit-row,\s*\.feature-vignette \.habit-row\s*\{[^}]*min-block-size:\s*68px;[^}]*padding:\s*8px 16px/,
  );
  assert.match(
    css,
    /\.feature-art \.habit-emoji,\s*\.feature-vignette \.habit-emoji\s*\{[^}]*inline-size:\s*46px;[^}]*block-size:\s*46px/,
  );
  assert.match(
    css,
    /\.feature-art \.status-ring,\s*\.feature-vignette \.status-ring\s*\{[^}]*inline-size:\s*30px;[^}]*block-size:\s*30px/,
  );
  assert.match(css, /\.habit-name\s*\{[^}]*font-size:\s*var\(--fs-base\);[^}]*font-weight:\s*500/);
  assert.match(
    css,
    /\.product-card\s*\{[^}]*padding:\s*24px;[^}]*border-radius:\s*var\(--radius-xl\)/,
  );
  assert.match(css, /\.progress-reply\s*\{[^}]*padding:\s*24px/);
  const global = readFileSync("src/styles/global.css", "utf8");
  const sizes = new Map(
    [...global.matchAll(/--fs-([\w]+):\s*(\d+)px/g)].map(([, role, size]) => [role, Number(size)]),
  );
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (
      !/\.(?:feature-(?:art|composition|stack|primary|secondary|vignette)|vignette-|progress-reply|product-|habit-|status-ring|chart-|week-chart|proactive-line|sample-message)/.test(
        selector,
      )
    )
      continue;
    assert.doesNotMatch(declarations, /scale\(|(?<![-\w])scale\s*:/, selector);
    for (const [, literal, role] of declarations.matchAll(
      /font-size:\s*(?:(\d+(?:\.\d+)?)px|var\(--fs-([\w]+)\))/g,
    )) {
      assert.ok((role ? sizes.get(role) : Number(literal)) >= 12, selector);
    }
  }
  assert.doesNotMatch(
    css,
    /\.feature-(?:primary|secondary)[^{]*\{[^}]*(?:padding|inset-inline|max-inline-size:\s*calc\(100vw)/,
  );
  assert.doesNotMatch(css, /\.feature-art-busy \.habit-row \.product-caption/);
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

test("feature and promise grids keep their title and body roles above content-sized cards", () => {
  for (const name of ["Features", "Security"]) {
    const card = descendants(components.get(name)).find((node) => node.name === "article");
    const copy = descendants(card).find((node) => attributes(node).class?.endsWith("-copy"));
    assert.ok(descendants(copy).some((node) => node.name === "h3"));
    assert.ok(descendants(copy).some((node) => node.name === "p"));
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.feature-card,\s*\.promise-card\s*\{[^}]*gap:\s*24px/);
  assert.match(css, /\.feature-card\s*\{[^}]*padding:\s*24px/);
  assert.match(css, /\.promise-card\s*\{[^}]*padding:\s*32px/);
  assert.match(css, /\.feature-card-copy,\s*\.promise-copy\s*\{[^}]*gap:\s*12px/);
  assert.match(
    css,
    /\.feature-card-copy h3,\s*\.promise-copy h3\s*\{[^}]*font-family:\s*var\(--font-display\);[^}]*font-size:\s*var\(--fs-3xl\);[^}]*font-weight:\s*500/,
  );
  assert.match(
    css,
    /\.feature-card-copy p,\s*\.promise-copy p\s*\{[^}]*font-size:\s*var\(--fs-base\)/,
  );
  assert.doesNotMatch(
    css,
    /\.(?:feature|promise)-card\s*\{[^}]*(?:min-block-size|grid-template-columns):/,
  );
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(mobile, /\.promise-card\s*\{[^}]*padding:\s*24px/);
  assert.match(
    mobile,
    /\.feature-card-copy h3,\s*\.promise-copy h3\s*\{[^}]*font-size:\s*var\(--fs-2xl\)/,
  );
  assert.match(
    mobile,
    /\.feature-grid,\s*\.security-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*16px/,
  );
});

test("each feature grid card introduces its promise with a decorative product vignette", async () => {
  const card = descendants(components.get("Features")).find((node) => node.name === "article");
  const children = card.children.filter((node) => node.name);
  assert.equal(children[0].name, "FeatureVignette");
  assert.equal(attributes(children[0]).kind, "key");
  assert.equal(attributes(children[1]).class, "feature-card-copy");
  const source = readFileSync("src/components/FeatureVignette.astro", "utf8");
  const vignette = descendants((await parse(source)).ast);
  const root = vignette.find((node) => attributes(node).class === "feature-vignette");
  assert.equal(attributes(root)["aria-hidden"], "true");
  for (const node of descendants(root)) {
    assert.ok(
      !["a", "button", "input", "select", "textarea", "summary", "PillButton"].includes(node.name),
    );
    assert.ok(!Object.hasOwn(attributes(node), "tabindex"));
  }
  assert.match(
    source,
    /kind === "start"[\s\S]*data-i18n="demo.start.reply"[\s\S]*<HabitRow habit="walk" timing="morning"/,
  );
  assert.match(source, /kind === "remember" && <ProductCard kind="reminder"/);
  assert.match(source, /kind === "act"[\s\S]*<HabitRow habit="walk"[\s\S]*<HabitRow habit="read"/);
  assert.match(
    source,
    /kind === "restart"[\s\S]*name="phrase.restart"[\s\S]*data-i18n="demo.restart.reply"/,
  );
  const row = descendants((await parse(readFileSync("src/components/HabitRow.astro", "utf8"))).ast);
  assert.ok(row.some((node) => attributes(node).class === "habit-row"));
  assert.ok(row.some((node) => attributes(node).class === "habit-emoji"));
  assert.ok(row.some((node) => attributes(node).class === "habit-name"));
  assert.ok(row.some((node) => attributes(node).class === "product-caption"));
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.feature-vignette\s*\{[^}]*min-block-size:\s*120px;[^}]*pointer-events:\s*none/,
  );
  assert.match(css, /\.vignette-astra\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  assert.match(css, /\.feature-card\s*\{[^}]*grid-template-rows:\s*subgrid/);
  assert.doesNotMatch(css, /\.feature-card (?:h3|p)\s*[,\{]/);
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
  assert.match(product, /!compact && <HabitRow habit="water" timing="done"/);
  assert.doesNotMatch(css.match(/\.feature-art\s*\{([^}]+)\}/)[1], /min-|block-size/);
});

test("billing has a monthly default radio group and one configured Pro price", () => {
  const entry = readFileSync("src/pages/index.astro", "utf8");
  assert.ok(
    entry.indexOf('import "../scripts/i18n"') < entry.indexOf('import "../scripts/pricing"'),
    "billing mounts after initial locale selection",
  );
  const pricing = descendants(components.get("Pricing"));
  const group = pricing.find((node) => attributes(node).role === "radiogroup");
  assert.ok(group);
  const options = descendants(group).filter((node) => attributes(node).role === "radio");
  assert.deepEqual(
    options.map((node) => attributes(node)["data-billing-period"]),
    ["monthly", "yearly"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node)["aria-checked"]),
    ["true", "false"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node).tabindex),
    ["0", "-1"],
  );
  const pro = pricing.find((node) => attributes(node).class === "plan-card plan-pro");
  assert.equal(descendants(pro).filter((node) => attributes(node)["data-price"]).length, 1);
  assert.ok(
    descendants(pro).some(
      (node) =>
        Object.hasOwn(attributes(node), "data-annual-equivalent") &&
        Object.hasOwn(attributes(node), "hidden"),
    ),
  );
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.billing-option\s*\{[^}]*padding:\s*4px 8px;[^}]*font-size:\s*var\(--fs-sm\)/,
  );
  assert.match(
    css,
    /\.billing-option\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--color-bg-hover\);[^}]*box-shadow:\s*inset 0 0 0 2px var\(--color-primary\)/,
  );
  assert.match(css, /\.billing-option:focus-visible\s*\{[^}]*outline:/);
});

function billingHarness(language = "en") {
  const pricing = descendants(components.get("Pricing"));
  const group = pricing.find((node) => attributes(node).role === "radiogroup");
  const element = (node) => {
    const attrs = attributes(node);
    const listeners = new Map();
    return {
      attributes: attrs,
      dataset: Object.fromEntries(
        Object.entries(attrs)
          .filter(([name]) => name.startsWith("data-"))
          .map(([name, value]) => [
            name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ]),
      ),
      textContent: "",
      hidden: Object.hasOwn(attrs, "hidden"),
      tabIndex: Number(attrs.tabindex),
      focused: false,
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      click() {
        listeners.get("click")();
      },
      focus() {
        this.focused = true;
      },
      key(key) {
        const event = {
          key,
          prevented: false,
          preventDefault() {
            this.prevented = true;
          },
        };
        listeners.get("keydown")(event);
        return event;
      },
    };
  };
  const options = descendants(group)
    .filter((node) => attributes(node).role === "radio")
    .map(element);
  const fields = Object.fromEntries(
    ["data-pro-price", "data-plan-period", "data-annual-equivalent"].map((name) => [
      name,
      element(pricing.find((node) => Object.hasOwn(attributes(node), name))),
    ]),
  );
  const free = element(pricing.find((node) => attributes(node)["data-price"] === "free"));
  const translated = pricing.filter((node) => attributes(node)["data-i18n"]).map(element);
  const copied = pricing
    .filter((node) => node.name === "Copy")
    .map((node) => {
      const field = element(node);
      field.dataset.copyEn = copyTables.landingCopy.en[attributes(node).name];
      field.dataset.copyPt = copyTables.landingCopy["pt-BR"][attributes(node).name];
      return field;
    });
  const listeners = new Map();
  const toggle = {
    addEventListener: (name, callback) => listeners.set(`toggle:${name}`, callback),
    setAttribute() {},
  };
  const document = {
    cookie: `orbit_lang=${language}`,
    documentElement: {},
    getElementById: (id) => (id === "lang-toggle" ? toggle : null),
    querySelectorAll: (selector) =>
      ({
        "[data-price]": [free, fields["data-pro-price"]],
        "[data-i18n]": translated,
        "[data-copy-en]": copied,
      })[selector] ?? [],
    querySelector(selector) {
      if (selector === "[data-billing-control]") return { querySelectorAll: () => options };
      return fields[selector.slice(1, -1)] ?? null;
    },
  };
  const context = vm.createContext({
    document,
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      dispatchEvent: (event) => listeners.get(event.type)?.(),
    },
    navigator: { language: language === "pt-BR" ? "pt-BR" : "en-US" },
    environment: { DEV: false },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    Intl,
  });
  const modules = new Map();
  function require(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(
      readFileSync(`src/scripts/${path}.ts`, "utf8").replaceAll("import.meta.env", "environment"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
    modules.set(path, exports);
    return exports;
  }
  const prices = require("../config/pricing");
  const { landingCopy } = require("../i18n/translations");
  for (const field of Object.values(fields)) {
    for (const [name, value] of Object.entries(field.dataset)) {
      if (value.startsWith("landingCopy"))
        field.dataset[name] = vm.runInNewContext(value, { landingCopy });
    }
  }
  require("./i18n");
  require("./pricing");
  return {
    options,
    fields,
    free,
    prices,
    landingCopy,
    translated,
    copied,
    changeLanguage(language) {
      while (document.documentElement.lang !== language) listeners.get("toggle:click")();
    },
  };
}

test("the free plan title and all plan mentions follow the actual language toggle", () => {
  const h = billingHarness();
  const title = h.translated.find((field) => field.getAttribute("data-i18n") === "plan.free");
  assert.ok(title, "the free plan heading must use a localized plan name");
  const description = h.copied.find((field) => field.attributes.name === "pricing.body");
  const caption = h.copied.find((field) => field.attributes.name === "trust.free");
  for (const language of ["en", "pt-BR", "en"]) {
    h.changeLanguage(language);
    assert.equal(title.textContent, language === "pt-BR" ? "Grátis" : "Free");
    assert.equal(
      caption.textContent,
      language === "pt-BR" ? "Comece no plano grátis" : "Start with Free",
    );
    assert.equal(
      description.textContent,
      language === "pt-BR"
        ? "Escolha o plano grátis ou o Pro. Os dois ajudam você a começar sua rotina."
        : "Choose Free or Pro. Both give you a place to start your routine.",
    );
  }
  assert.equal(
    copyTables.landingCopy["pt-BR"]["final.body"],
    "Conte à Astra o que você tem em mente. Comece no plano grátis.",
  );
  for (const table of [copyTables.translations["pt-BR"], copyTables.landingCopy["pt-BR"]]) {
    for (const [key, value] of Object.entries(table)) assert.doesNotMatch(value, /\bFree\b/u, key);
  }
});

test("localized application offers use the same free plan name", () => {
  const h = billingHarness();
  assert.equal(h.prices.offersFor("en")[0].name, "Orbit Free");
  assert.equal(h.prices.offersFor("pt-BR")[0].name, "Orbit Grátis");
});

test("billing switches one Pro price and configured arithmetic in both locales while Free stays outside the control", () => {
  for (const language of ["en", "pt-BR"]) {
    const h = billingHarness(language);
    const price = h.fields["data-pro-price"];
    const unit = h.fields["data-plan-period"];
    const equivalent = h.fields["data-annual-equivalent"];
    const copy = h.landingCopy[language];
    const freeBefore = h.free.textContent;
    assert.equal(price.textContent, h.prices.formatPrice(language, "monthly"));
    assert.equal(unit.textContent, copy["pricing.month"]);
    assert.equal(equivalent.hidden, true);
    h.options[1].click();
    assert.equal(price.textContent, h.prices.formatPrice(language, "yearly"));
    assert.equal(price.dataset.price, "yearly");
    assert.equal(unit.textContent, copy["pricing.year"]);
    assert.equal(equivalent.hidden, false);
    assert.equal(h.free.textContent, freeBefore);
    const annual = h.prices.offersFor(language).find((offer) => offer.name === "Orbit Pro yearly");
    const expected = new Intl.NumberFormat(language === "en" ? "en-US" : "pt-BR", {
      style: "currency",
      currency: annual.priceCurrency,
      minimumFractionDigits: (annual.price / 12) % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(annual.price / 12);
    assert.equal(h.prices.formatPrice(language, "monthlyEquivalent"), expected);
    assert.equal(equivalent.textContent, copy["pricing.equivalent"].replace("{price}", expected));
    h.options[0].click();
    assert.equal(price.textContent, h.prices.formatPrice(language, "monthly"));
    assert.equal(equivalent.hidden, true);
    assert.equal(h.free.textContent, freeBefore);
    assert.equal(
      h.prices.formatPrice(language, "free"),
      new Intl.NumberFormat(language === "en" ? "en-US" : "pt-BR", {
        style: "currency",
        currency: annual.priceCurrency,
        maximumFractionDigits: 0,
      }).format(0),
    );
  }
});

test("billing arrows wrap selection and focus, Home and End select endpoints, and Tab stays native", () => {
  const h = billingHarness();
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    h.options[0].click();
    assert.equal(h.options[0].key(key).prevented, true);
    assert.equal(h.options[1].attributes["aria-checked"], "true");
    assert.equal(h.options[1].focused, true);
    assert.equal(h.options[1].tabIndex, 0);
    assert.equal(h.options[0].tabIndex, -1);
    assert.equal(h.options[1].key(key).prevented, true);
    assert.equal(h.options[0].attributes["aria-checked"], "true");
    assert.equal(h.options[0].focused, true);
  }
  h.options[0].key("End");
  assert.equal(h.options[1].attributes["aria-checked"], "true");
  h.options[1].key("Home");
  assert.equal(h.options[0].attributes["aria-checked"], "true");
  assert.equal(h.options[0].key("Tab").prevented, false);
});

test("the selected billing period survives language changes with price, unit and equivalent together", () => {
  const h = billingHarness();
  h.options[1].click();
  for (const language of ["pt-BR", "en"]) {
    h.changeLanguage(language);
    assert.equal(h.fields["data-pro-price"].textContent, h.prices.formatPrice(language, "yearly"));
    assert.equal(h.fields["data-plan-period"].textContent, h.landingCopy[language]["pricing.year"]);
    assert.equal(
      h.fields["data-annual-equivalent"].textContent,
      h.landingCopy[language]["pricing.equivalent"].replace(
        "{price}",
        h.prices.formatPrice(language, "monthlyEquivalent"),
      ),
    );
    assert.equal(h.fields["data-annual-equivalent"].hidden, false);
    assert.equal(h.options[1].attributes["aria-checked"], "true");
  }
});
