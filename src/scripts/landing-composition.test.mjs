import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";
import { runnerImport } from "vite";

const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const componentNames = [
  "Hero",
  "DownloadsPanel",
  "OrbitDemo",
  "TrustStrip",
  "Features",
  "FeatureRows",
  "Security",
  "Pricing",
  "Faq",
  "FinalCta",
  "IosWaitlist",
  "Footer",
].filter((name) => existsSync(`src/components/${name}.astro`));
const components = new Map(
  await Promise.all(
    componentNames.map(async (name) => [
      name,
      (await parse(readFileSync(`src/components/${name}.astro`, "utf8"))).ast,
    ]),
  ),
);
const page = (await parse(readFileSync("src/pages/index.astro", "utf8"))).ast;
const viteOptions = { configFile: false, envPrefix: "PUBLIC_", logLevel: "silent" };
const { module: copyTables } = await runnerImport("/src/i18n/translations.ts", viteOptions);
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
    sections
      .filter((node) => node.name === "section")
      .map((node) => attributes(node)["data-section"]),
    ["hero", "trust", "features", "pricing", "ios", "faq", "final"],
  );
  assert.equal(nodes.filter((node) => node.name === "h1").length, 1);
  assert.doesNotMatch(readFileSync("src/pages/index.astro", "utf8"), /Connect/);
});

test("the feature section starts with the demo and the week, then six alternating rows, without a privacy product", () => {
  const features = sections.find((node) => attributes(node)["data-section"] === "features");
  assert.ok(features);
  const featureNodes = descendants(features);
  const rows = featureNodes.filter((node) => Object.hasOwn(attributes(node), "data-example-row"));
  assert.deepEqual(
    rows.map((node) => [attributes(node)["data-example-row"], attributes(node)["data-card-side"]]),
    [
      ["demo", "left"],
      ["week", "right"],
      ["calendar", "left"],
      ["metrics", "right"],
      ["breakdown", "left"],
      ["streak", "right"],
      ["goal", "left"],
      ["achievements", "right"],
    ],
  );
  assert.ok(
    featureNodes.every(
      (node) => node.name !== "OrbitProduct" || attributes(node).kind !== "privacy",
    ),
  );
});

test("each product surface has one primary intent and the viewport controller arbitrates their accent", () => {
  for (const section of sections) {
    const actions = descendants(section).filter(
      (node) => node.name === "PillButton" && (attributes(node).variant ?? "primary") === "primary",
    );
    assert.ok(actions.length <= (attributes(section)["data-section"] === "hero" ? 2 : 1));
  }
  const demo = descendants(components.get("OrbitDemo"));
  const actions = demo.filter((node) => node.name === "PillButton");
  assert.deepEqual(
    actions.map((node) => attributes(node).variant),
    ["ghost", "ghost", "primary"],
  );
});

test("proposal actions keep natural drawn widths and 44px logical height in one trailing row", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const selector = ".demo-preview-actions .pill-sm";
  const pills = rules.filter(([, selectors]) =>
    selectors.split(",").some((s) => s.trim() === selector),
  );
  assert.ok(pills.length > 0);
  let minimum;
  for (const [, , declarations] of pills) {
    const value = declarations.match(/min-inline-size:\s*([^;]+);/)?.[1];
    if (value !== undefined) {
      assert.match(value, /^(?:0|\d+(?:\.\d+)?px)$/);
      minimum = parseFloat(value);
    }
    assert.equal(minimum, 0, `${selector} must keep its natural drawn width`);
    assert.match(declarations, /font-size:\s*var\(--fs-sm\);/);
    assert.doesNotMatch(declarations, /display:\s*none|visibility:\s*hidden|opacity:\s*0\s*;/);
  }
  assert.match(pills[0][2], /flex-shrink:\s*0;/);
  assert.match(pills[0][2], /padding-inline:\s*18px;/);
  assert.match(pills[0][2], /border-radius:\s*var\(--radius-full\);/);
  const height = Number(pills[0][2].match(/(?:^|;)\s*block-size:\s*(\d+)px;/)?.[1]);
  assert.equal(height, 44);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(
    global,
    /\.pill-sm::before\s*\{[^}]*inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/,
  );
  const rows = rules.filter(([, selectors]) => selectors.trim() === ".demo-preview-actions");
  assert.ok(rows.length > 0);
  for (const [, , declarations] of rows) {
    assert.match(declarations, /flex-wrap:\s*nowrap;/);
    assert.match(declarations, /gap:\s*12px;/);
    assert.match(declarations, /justify-content:\s*flex-end;/);
  }
  const row = descendants(components.get("OrbitDemo")).find(
    (node) => attributes(node).class === "demo-preview-actions",
  );
  assert.deepEqual(
    descendants(row)
      .filter((node) => node.name === "PillButton")
      .map((node) => attributes(node).id),
    ["demo-reject", "demo-edit", "demo-approve"],
  );
});

test("sibling small-pill rows stay within the audited proposal and consent actions", async () => {
  const rows = [];
  for (const directory of ["src/components", "src/pages"]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".astro"))) {
      const { ast } = await parse(readFileSync(`${directory}/${file}`, "utf8"));
      for (const node of descendants(ast)) {
        const pills = (node.children ?? []).filter(
          (child) => child.name === "PillButton" && (attributes(child).size ?? "sm") === "sm",
        );
        if (pills.length < 2) continue;
        rows.push({
          file,
          className: attributes(node).class,
          labels: pills.map(
            (pill) =>
              descendants(pill)
                .find((child) => attributes(child)["data-i18n"])
                .attributes.find(({ name }) => name === "data-i18n").value,
          ),
        });
      }
    }
  }
  assert.deepEqual(rows, [
    {
      file: "ConsentBanner.astro",
      className: "flex shrink-0 gap-3",
      labels: ["consent.decline", "consent.accept"],
    },
    {
      file: "OrbitDemo.astro",
      className: "demo-preview-actions",
      labels: ["demo.reject", "demo.edit", "demo.approve"],
    },
  ]);
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
  const phones = descendants(stage).filter((node) => attributes(node).class === "hero-device");
  assert.equal(phones.length, 3);
  assert.ok(
    descendants(stage).every((node) => !Object.hasOwn(attributes(node), "data-hero-float")),
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
  const entry = readFileSync("src/pages/index.astro", "utf8");
  assert.match(entry, /import\("\.\.\/scripts\/faq"\)/);
});

test("the header and hero preserve their app-entry intent", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  const action = descendants(header).find((node) => node.name === "PillButton");
  assert.equal(attributes(action).href, "appUrl");
  assert.equal(attributes(action).variant, "secondary");
  assert.equal(attributes(action).analyticsEvent, "header_app_cta_clicked");
  const heroAction = descendants(sections[0]).find((node) => node.name === "PillButton");
  assert.equal(attributes(heroAction).href, "appUrl");
  assert.equal(attributes(heroAction).analyticsEvent, "hero_app_cta_clicked");
  assert.equal(attributes(heroAction).analyticsSurface, "hero");
  assert.ok(Object.hasOwn(attributes(heroAction), "appEntry"));
  assert.ok(!Object.hasOwn(attributes(heroAction), "external"));
  const hero = descendants(sections[0]);
  const panel = hero.find((node) => attributes(node).id === "downloads-panel");
  assert.ok(panel);
  const insidePanel = new Set(descendants(panel));
  assert.deepEqual(
    hero
      .filter(
        (node) =>
          node.name === "a" &&
          attributes(node).id !== "demo-continue-link" &&
          !insidePanel.has(node),
      )
      .map((node) => attributes(node).href),
    [],
  );
  const toggle = hero.find((node) => attributes(node).id === "downloads-toggle");
  assert.equal(toggle.name, "button");
  assert.equal(attributes(toggle).type, "button");
  assert.equal(attributes(toggle)["aria-expanded"], "false");
  assert.equal(attributes(toggle)["aria-controls"], "downloads-panel");
  for (const name of ["Faq", "DownloadsPanel"]) {
    assert.ok(descendants(components.get(name)).some((node) => attributes(node).href === "#ios"));
  }
});

test("the trust strip keeps three compact values and hides captions below 618px", () => {
  const trust = descendants(components.get("TrustStrip"));
  assert.equal(trust.filter((node) => node.name === "dt").length, 3);
  assert.equal(trust.filter((node) => node.name === "dd").length, 3);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.trust-content\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*gap:\s*12px/,
  );
  const compact = css.slice(
    css.indexOf("@media (width < 38.625rem)"),
    css.indexOf("@media (width < 30rem)"),
  );
  assert.match(compact, /\.trust-fact dd\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(compact, /\.trust-content/);
  const stacked = css.slice(css.indexOf("@media (width < 30rem)"));
  assert.match(
    stacked,
    /\.trust-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*justify-items:\s*center;[^}]*gap:\s*12px/,
  );
  assert.match(
    css,
    /@media \(max-width: 39.999rem\)\s*\{\s*\.trust-fact dt\s*\{[^}]*font-size:\s*var\(--fs-sm\)/,
  );
  assert.doesNotMatch(css, /@media \(max-width: 24.999rem\)[^{]*\{\s*\.trust-fact dt/);
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
        "Free plan",
        "Pro free for 7 days",
        "You approve",
        "every change first",
        "Android, web and desktop",
        "iPhone waitlist open",
      ],
    ],
    [
      "pt-BR",
      [
        "Plano grátis",
        "Pro grátis por 7 dias",
        "Você aprova",
        "cada mudança antes",
        "Android, web e desktop",
        "Lista de espera do iPhone aberta",
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

test("How it works lands on the feature grid below the header", async () => {
  const header = (await parse(readFileSync("src/components/Header.astro", "utf8"))).ast;
  assert.ok(descendants(header).some((node) => attributes(node).href === "#features"));
  assert.equal(attributes(sections[2]).id, "features");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /scroll-margin-block-start:\s*var\(--header-offset\)/);
  assert.doesNotMatch(css, /scroll-margin-block-start:\s*\d+px/);
});

test("the recommended plan keeps its canonical inset ring and selected tint", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /\.plan-pro\s*\{[^}]*background:\s*var\(--color-primary-dim\);[^}]*box-shadow:\s*inset 0 0 0 1\.5px var\(--color-primary\)/,
  );
});

test("every section shares one heading scale and at most one supporting paragraph", () => {
  for (const section of sections) {
    if (["hero", "trust", "footer"].includes(attributes(section)["data-section"])) continue;
    const heading = descendants(section).find((node) =>
      ["section-heading", "feature-intro"].includes(attributes(node).class),
    );
    assert.ok(heading);
    assert.ok(descendants(heading).filter((node) => node.name === "p").length <= 1);
    assert.equal(
      descendants(heading).filter((node) => node.name === "h2" || node.name === "SentenceTitle")
        .length,
      1,
    );
  }
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.section-title\s*\{[^}]*text-wrap:\s*balance/);
  assert.match(css, /\.section-description\s*\{[^}]*text-wrap:\s*pretty/);
  assert.doesNotMatch(css, /\.feature-copy \.section-title/);
});

test("pt-BR copy names the free plan Grátis and never Free", () => {
  for (const table of [copyTables.translations["pt-BR"], copyTables.landingCopy["pt-BR"]]) {
    for (const [key, value] of Object.entries(table)) assert.doesNotMatch(value, /\bFree\b/u, key);
  }
});

test("localized application offers use the same free plan name", async () => {
  const { module: prices } = await runnerImport("/src/config/pricing.ts", viteOptions);
  assert.equal(prices.offersFor("en")[0].name, "Orbit Free");
  assert.equal(prices.offersFor("pt-BR")[0].name, "Orbit Grátis");
});

test("example figures derive from the chart and linked habit fixtures", async () => {
  const { module: fixture } = await runnerImport("/src/config/product-examples.ts", viteOptions);
  assert.equal(fixture.exampleWeek.length, 7);
  assert.equal(Math.round(fixture.exampleWeek.reduce((sum, point) => sum + point, 0) / 7), 78);
  assert.equal(fixture.exampleWeek.filter((value) => value > 0).length, 6);
  assert.equal(fixture.exampleGoal.linkedHabitCount, 3);
  assert.equal(fixture.exampleGoal.progress, 9);
  assert.equal(fixture.exampleGoal.target, 30);
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.metric-bar\s*\{[^}]*background:\s*var\(--color-fg-2\)/);
  assert.match(css, /\.goal-progress-fill\s*\{[^}]*background:\s*var\(--color-primary\)/);
  assert.doesNotMatch(css, /\.(?:ai-product|product-block|metric-|goal-)[^{]*\{[^}]*scale\(/);
});

test("chart targets fill their columns, empty days keep a stub and reduced motion freezes the readout", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /button\.metric-bar-track\s*\{[^}]*min-inline-size:\s*0/);
  assert.match(css, /\.metric-bar-track\s*\{[^}]*block-size:\s*128px/);
  assert.match(css, /\.metric-bar\s*\{[^}]*min-block-size:\s*4px/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.metric-readout\s*\{[^}]*transition:\s*left/,
  );
});

test("every translation key has a source consumer and retired copy is removed", () => {
  const files = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? files(path) : [path];
    });
  const source = files("src")
    .filter((path) => /\.(?:astro|ts)$/.test(path) && !path.endsWith("translations.ts"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const patterns = [...source.matchAll(/`([^`]+)`/g)].map(([, value]) => {
    const segments = value.split(/\$\{[^}]+\}/);
    return new RegExp(
      `^${segments.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\w]+")}$`,
    );
  });
  for (const table of [copyTables.translations.en, copyTables.landingCopy.en]) {
    for (const key of Object.keys(table)) {
      assert.ok(
        source.includes(key) || patterns.some((pattern) => pattern.test(key)),
        `unused translation: ${key}`,
      );
      assert.doesNotMatch(
        key,
        /^features\.(?:remember|act|restart)\.|^security\.|^remember\.|^understand\.|^restart\.|^blocks\.habits\./,
      );
    }
  }
});

test("the Pro price derives from the configured monthly and yearly plan prices", () => {
  const source = readFileSync("src/config/pricing.ts", "utf8");
  assert.match(source, /plan\.monthly \/ 30 \/ 100/);
  assert.match(source, /plan\.yearly \/ 365 \/ 100/);
});

test("billing options share one row with equal single-line segments and Yearly selected first", () => {
  const group = descendants(components.get("Pricing")).find(
    (node) => attributes(node).role === "radiogroup",
  );
  const options = descendants(group).filter((node) => attributes(node).role === "radio");
  assert.deepEqual(
    options.map((node) => attributes(node)["data-billing-period"]),
    ["yearly", "monthly"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node)["aria-checked"]),
    ["true", "false"],
  );
  assert.deepEqual(
    options.map((node) => attributes(node).tabindex),
    ["0", "-1"],
  );
  assert.equal(
    descendants(options[0]).filter((node) => Object.hasOwn(attributes(node), "data-billing-saving"))
      .length,
    1,
  );
  assert.equal(descendants(options[1]).filter((node) => node.name === "Copy").length, 1);
  const css = readFileSync("src/styles/landing.css", "utf8");
  const optionRules = [...css.matchAll(/(?:^|\n)\.billing-option\s*\{([^}]+)\}/g)];
  assert.equal(optionRules.length, 1);
  const rule = optionRules[0][1];
  assert.match(rule, /display:\s*flex/);
  assert.match(rule, /min-block-size:\s*48px/);
  assert.match(rule, /border-radius:\s*var\(--radius-sm\)/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.doesNotMatch(rule, /flex-wrap:\s*wrap|flex-direction:\s*column/);
  assert.match(
    css,
    /\.billing-option\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--color-bg-hover\);[^}]*box-shadow:\s*inset 0 0 0 2px var\(--color-primary\)/,
  );
  assert.match(
    css,
    /\.billing-control\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("the footer groups product and legal links with no download list and no source-code link", () => {
  const footer = readFileSync("src/components/FinalCta.astro", "utf8");
  assert.doesNotMatch(footer, /footer\.source|github\.com|Source code|Código-fonte/);
  for (const key of ["footer.description", "footer.product", "footer.legal", "footer.controller"])
    assert.ok(footer.includes(key));
  assert.doesNotMatch(footer, /desktopDownloads|footer\.android|googlePlayUrl|orbit-install-qr/);
  assert.doesNotMatch(footer, /data-(?:desktop-download|download-target|ios-trigger)/);
  const legalColumn = descendants(components.get("FinalCta")).find(
    (node) =>
      node.name === "div" &&
      attributes(node).class === "footer-column" &&
      descendants(node).some((child) => attributes(child).name === "footer.legal"),
  );
  assert.ok(legalColumn);
  assert.equal(
    descendants(legalColumn).filter((node) => node.name === "CookiePreferences").length,
    1,
  );
});

test("the closing call to action centers its column and label-hugging button at every width", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  for (const selector of ["\\.closing-copy", "\\.closing-copy \\.section-heading"]) {
    const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, "g"))];
    assert.ok(rules.length);
    for (const [, declarations] of rules) {
      assert.match(declarations, /justify-items:\s*center/);
      assert.match(declarations, /text-align:\s*center/);
    }
  }
  assert.match(css, /\.section-title\s*\{[^}]*max-inline-size:\s*23ch/);
  assert.match(css, /\.section-description\s*\{[^}]*max-inline-size:\s*55ch/);
  const closing = descendants(components.get("FinalCta")).find(
    (node) => attributes(node).class === "closing-copy",
  );
  const action = closing.children.find((node) => node.name === "PillButton");
  assert.ok(action);
  assert.equal(attributes(action).class, undefined);
});

test("all app and install links and QR generation share environment-backed production defaults", async () => {
  const staging = {
    PUBLIC_APP_URL: "https://app-staging.useorbit.org",
    PUBLIC_ANDROID_INSTALL_URL:
      "https://play.google.com/store/apps/details?id=org.useorbit.app.staging",
  };
  async function withEnvironment(environment, path) {
    const saved = Object.keys(staging).map((name) => [name, process.env[name]]);
    for (const name of Object.keys(staging)) delete process.env[name];
    Object.assign(process.env, environment);
    try {
      return (await runnerImport(path, viteOptions)).module;
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }
  const production = await withEnvironment({}, "/src/config/links.ts");
  assert.equal(production.appUrl, "https://app.useorbit.org");
  assert.equal(
    production.googlePlayUrl,
    "https://play.google.com/store/apps/details?id=org.useorbit.app",
  );
  const stagingLinks = await withEnvironment(staging, "/src/config/links.ts");
  assert.equal(stagingLinks.appUrl, staging.PUBLIC_APP_URL);
  assert.equal(stagingLinks.googlePlayUrl, staging.PUBLIC_ANDROID_INSTALL_URL);
  for (const path of [
    "src/layouts/Layout.astro",
    "src/pages/index.astro",
    "src/pages/waitlist-confirmed.astro",
    "src/pages/orbit-install-qr.svg.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /from "\.\.\/config\/links"/);
    assert.doesNotMatch(source, /https:\/\/(?:app\.useorbit|play\.google)/);
  }
  const { default: qrcode } = await import("qrcode-generator");
  const endpoint = await withEnvironment(staging, "/src/pages/orbit-install-qr.svg.ts");
  const expected = qrcode(0, "H");
  expected.addData(staging.PUBLIC_ANDROID_INSTALL_URL);
  expected.make();
  assert.equal(
    await endpoint.GET().text(),
    expected.createSvgTag({ cellSize: 4, margin: 16, scalable: true }),
  );
  const workflow = readFileSync(".github/workflows/release.yml", "utf8");
  assert.ok(workflow.includes(staging.PUBLIC_APP_URL));
  assert.ok(workflow.includes(staging.PUBLIC_ANDROID_INSTALL_URL));
});

test("every current copy key has locale parity and Pro states the approved weekly pool", () => {
  for (const table of [copyTables.translations, copyTables.landingCopy])
    assert.deepEqual(Object.keys(table.en).sort(), Object.keys(table["pt-BR"]).sort());
  for (const [language, pricing, faq] of [
    ["en", "250 AI messages a week", "250 AI messages a week and Google Calendar import."],
    [
      "pt-BR",
      "250 mensagens de IA por semana",
      "250 mensagens de IA por semana e a importação do Google Agenda.",
    ],
  ]) {
    assert.equal(copyTables.landingCopy[language]["pricing.pro.ai"], pricing);
    assert.equal(copyTables.landingCopy[language]["faq.plans.a"], faq);
  }
});

test("the language toggle keeps its 40px drawing with a centred target at least 44px in both axes", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const toggle = css.match(/\.language-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
  const target = css.match(/\.language-toggle::before\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(toggle, /position:\s*relative;/);
  assert.match(toggle, /block-size:\s*40px;/);
  assert.match(target, /content:\s*"";/);
  assert.match(target, /position:\s*absolute;/);
  assert.match(target, /inset-block:\s*-2px;/);
  assert.match(target, /inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  assert.match(target, /border-radius:\s*inherit;/);
  assert.doesNotMatch(target, /background/);
});

test("the downloads panel leaves the flow, moves only opacity and translate and stops under reduced motion", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  const rule = (selector) =>
    css.match(
      new RegExp(`${selector.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]+)\\}`),
    )?.[1] ?? "";
  const closed = rule(".downloads-panel");
  const open = rule('.downloads-toggle[aria-expanded="true"] + .downloads-panel');
  assert.match(closed, /position:\s*absolute/);
  assert.match(closed, /visibility:\s*hidden/);
  assert.match(closed, /opacity:\s*0/);
  assert.doesNotMatch(
    closed + open,
    /transition[^;]*\b(?:height|inline-size|block-size|margin|inset)\b/,
  );
  assert.match(closed, /opacity var\(--duration-fast\) var\(--ease-in\)/);
  assert.match(closed, /translate var\(--duration-fast\) var\(--ease-in\)/);
  assert.match(open, /opacity var\(--duration-normal\) var\(--ease-out\)/);
  assert.match(open, /translate var\(--duration-normal\) var\(--ease-out\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.downloads-panel,\s*\.downloads-toggle\[aria-expanded="true"\] \+ \.downloads-panel,\s*\.downloads-chevron\s*\{\s*transition:\s*none;\s*translate:\s*none;/,
  );
  assert.match(open, /visibility:\s*visible/);
  const downloads = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => /\.downloads-|\.platform-mark/.test(selectors))
    .map(([rule]) => rule)
    .join("\n");
  assert.doesNotMatch(downloads, /data-open/, "the toggle's aria-expanded is the one open state");
  assert.doesNotMatch(downloads, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(rule(".hero-controls"), /position:\s*relative/);
});

test("the live Orbit demo lives only in the features section and the hero holds none of its ids", () => {
  const features = sections.find((node) => attributes(node)["data-section"] === "features");
  const hero = sections.find((node) => attributes(node)["data-section"] === "hero");
  const demoId = (node) => /^(?:orbit-demo|demo-)/.test(attributes(node).id ?? "");
  const live = descendants(features).filter(demoId);
  assert.ok(live.some((node) => attributes(node).id === "orbit-demo"));
  assert.equal(live.filter((node) => attributes(node).id === "orbit-demo").length, 1);
  assert.equal(descendants(hero).filter(demoId).length, 0);
  assert.equal(existsSync("src/components/InertCopy.astro"), false);
});

test("the first two feature rows hold the interactive demo and the interactive week card", () => {
  const features = sections.find((node) => attributes(node)["data-section"] === "features");
  const [demo, week] = descendants(features).filter((node) =>
    Object.hasOwn(attributes(node), "data-example-row"),
  );
  assert.ok(descendants(demo).some((node) => attributes(node).id === "demo-approve"));
  assert.ok(
    descendants(week).some(
      (node) => node.name === "ProductCard" && attributes(node).kind === "week",
    ),
  );
  for (const row of [demo, week]) {
    const sentence = descendants(row).find((node) => attributes(node).class === "example-sentence");
    assert.ok(sentence);
  }
});

test("the page loads the demo for the features demo and the calendar views for the hero phones", () => {
  const entry = readFileSync("src/pages/index.astro", "utf8");
  assert.match(
    entry,
    /target\.matches\("#orbit-demo"\)\) void afterLoad\(\[\(\) => import\("\.\.\/scripts\/demo"\)\]\)/,
  );
  assert.match(
    entry,
    /target\.matches\("\.hero-fan"\)\)\s+void import\("\.\.\/scripts\/demo-views"\)\.catch/,
  );
  assert.match(entry, /'\.hero-fan, #orbit-demo, \[data-week-card\]/);
});

test("the demo and week sentences exist in both tables without dashes", () => {
  for (const language of ["en", "pt-BR"]) {
    for (const key of ["example.demo", "example.week"]) {
      const value = copyTables.landingCopy[language][key];
      assert.ok(value, `${language} ${key}`);
      assert.ok([...value].every((char) => ![8211, 8212].includes(char.charCodeAt(0))));
    }
  }
});
