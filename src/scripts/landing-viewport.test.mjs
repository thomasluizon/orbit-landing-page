import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const css = readFileSync("src/styles/landing.css", "utf8");
const code = readFileSync("src/scripts/scroll.ts", "utf8");

function harness(reduced = false) {
  const frames = [];
  const listeners = new Map();
  const preference = { matches: reduced };
  const result = { imports: 0, mounts: 0, disposals: 0 };
  let resolveImport;
  const loaded = new Promise((resolve) => {
    resolveImport = resolve;
  });
  const window = {
    matchMedia: () => preference,
    requestAnimationFrame: (callback) => frames.push(callback),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    window,
    require() {
      result.imports++;
      return loaded;
    },
  });
  return {
    result,
    preference,
    listeners,
    paint() {
      frames.shift()();
      frames.shift()();
    },
    async resolve() {
      resolveImport({
        mountLandingMotion() {
          result.mounts++;
          return () => result.disposals++;
        },
      });
      await loaded;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("motion loads once after paint and interaction, with page lifecycle cleanup", async () => {
  const h = harness();
  assert.equal(h.result.imports, 0);
  h.paint();
  assert.equal(h.result.imports, 0);
  const pending = h.listeners.get("scroll")();
  h.listeners.get("wheel")();
  await Promise.resolve();
  assert.equal(h.result.imports, 1);
  await h.resolve();
  await pending;
  assert.equal(h.result.mounts, 1);
  h.listeners.get("pagehide")();
  assert.equal(h.result.disposals, 1);
  await h.listeners.get("pageshow")({ persisted: true });
  await h.resolve();
  assert.equal(h.result.mounts, 2);
});

test("reduced motion imports nothing and never creates a scroll driver", async () => {
  const h = harness(true);
  h.paint();
  for (const event of ["scroll", "wheel", "touchstart", "keydown"]) await h.listeners.get(event)();
  assert.deepEqual(h.result, { imports: 0, mounts: 0, disposals: 0 });
});

test("a reduced motion change during import cannot mount movement or prevent a later restart", async () => {
  const h = harness();
  h.paint();
  const pending = h.listeners.get("scroll")();
  h.preference.matches = true;
  await h.resolve();
  await pending;
  assert.equal(h.result.mounts, 0);
  h.preference.matches = false;
  await h.listeners.get("scroll")();
  assert.equal(h.result.mounts, 1);
});

test("a page left during import cannot mount a scroll driver", async () => {
  const h = harness();
  h.paint();
  const pending = h.listeners.get("scroll")();
  h.listeners.get("pagehide")();
  await h.resolve();
  await pending;
  assert.equal(h.result.mounts, 0);
});

test("the static layout scrolls vertically and keeps product content visible before animation", () => {
  assert.doesNotMatch(
    css,
    /(?:block-size|height):\s*100dvh|overflow(?:-y)?:\s*hidden|opacity:\s*0(?:;|\s*})|visibility:\s*hidden|dashed/,
  );
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(css, /opacity:\s*1\s*!important/);
  for (const [, declarations] of css.matchAll(/\.hero\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(declarations, /grid-template-columns:(?!\s*minmax\(0, 1fr\))/);
  }
  assert.match(css, /--hero-device-width:\s*360px/);
});

test("every scroll driver is preference scoped and reveals only transform and opacity", () => {
  const source = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.equal((source.match(/media\.add\(/g) ?? []).length, 3);
  assert.equal((source.match(/prefers-reduced-motion: no-preference/g) ?? []).length, 3);
  assert.match(source, /media\.revert\(\)/);
  assert.match(source, /lenis\.destroy\(\)/);
  assert.match(source, /pin:\s*true/);
  assert.match(source, /scrub:/);
  assert.doesNotMatch(source, /(?:^|[,{]\s*)(?:height|width|top|left|filter|clipPath):/m);
});

test("the server-rendered hero reserves its pin travel before deferred motion mounts", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.match(hero, /class="hero-pin-range">\s*<div class="hero-stage" id="hero-stage">/);
  const range = css.match(
    /@media \(prefers-reduced-motion: no-preference\) and \(min-width: 56rem\) and \(min-height: 46rem\)\s*\{\s*\.hero-pin-range\s*\{([^}]+)\}/,
  );
  assert.ok(range, "static pin reservation uses the same motion and viewport conditions as GSAP");
  const distance = motion.match(/end:\s*"\+=(\d+)"/)[1];
  assert.match(range[1], new RegExp(`padding-block-end:\\s*${distance}px;`));
  assert.match(motion, /pinSpacing:\s*false/);
  assert.doesNotMatch(motion, /pinReparent:\s*true|scrollTo\(|location\.hash/);
});

test("hero cards stay opaque before and after their scroll travel", () => {
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  const floatingCards = motion.slice(
    motion.indexOf("cards.forEach"),
    motion.indexOf('media.add("(prefers', motion.indexOf("cards.forEach")),
  );
  assert.doesNotMatch(floatingCards, /opacity:\s*0(?:\.|\b)|autoAlpha:\s*0/);
  assert.doesNotMatch(css, /\.(?:hero-float|hero-phrase)\s*\{[^}]*opacity:\s*0/);
});

test("the Astra conversation sits in a full phone with status chrome and a home indicator", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.match(hero, /class="device-status" aria-hidden="true"/);
  assert.match(hero, /data-mock>9:41/);
  assert.match(hero, /class="device-home"/);
  assert.match(hero, /class="device-screen"/);
  assert.match(css, /\.hero-device\s*\{[^}]*block-size:\s*auto/);
  assert.match(css, /\.hero-device\s*\{[^}]*padding:\s*var\(--hero-device-bezel\)/);
  assert.match(css, /\.hero-device\s*\{[^}]*border-radius:\s*56px/);
  assert.match(
    css,
    /\.device-screen\s*\{[^}]*border-radius:\s*calc\(56px - var\(--hero-device-bezel\)\)/,
  );
  assert.match(css, /\.device-speaker\s*\{[^}]*inline-size:\s*96px;\s*block-size:\s*28px/);
});

test("the hero conversation starts below its header and sizes the phone around the proposal", () => {
  assert.match(css, /\.astra-demo\s*\{[^}]*gap:\s*24px;[^}]*padding:\s*12px 12px 16px/);
  assert.match(css, /\.demo-exchange\s*\{[^}]*margin-block-start:\s*0/);
  assert.match(css, /\.demo-exchange\s*\{[^}]*gap:\s*16px/);
  assert.match(css, /\.demo-response\s*\{[^}]*gap:\s*12px/);
  assert.match(css, /\.demo-request\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  assert.match(css, /\.device-home\s*\{[^}]*position:\s*absolute;[^}]*inset-block-end:\s*8px/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.doesNotMatch(mobile, /\.(?:hero-device|device-screen)\s*\{[^}]*min-block-size:/);
  assert.doesNotMatch(mobile, /\.astra-demo\s*\{[^}]*(?:gap|padding):/);
  assert.doesNotMatch(mobile, /\.demo-(?:exchange|request)\s*\{[^}]*(?:gap|font-size):/);
});

test("marketing paragraphs use the body role and feature titles have the reference weight", () => {
  for (const selector of [
    "section-description",
    "promise-copy p",
    "plan-description",
    "plan-card li",
    "footer-brand p",
  ]) {
    const declarations = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))[1];
    assert.match(declarations, /font-size:\s*var\(--fs-base\)/, selector);
  }
});

test("section grids follow their headings without oversized empty bands", () => {
  assert.match(
    css,
    /\.section,\s*\.final-section\s*\{\s*padding-block:\s*var\(--landing-section-gap\) 0;/,
  );
  assert.match(css, /\.section-inner\s*\{[^}]*gap:\s*32px;/);
  for (const selector of ["section-heading", "feature-copy"]) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*gap:\\s*24px;`));
  }
  assert.match(css, /\.feature-row\s*\{[^}]*gap:\s*32px/);
  assert.match(css, /\.final-section \.section-inner\s*\{[^}]*gap:\s*24px/);
  assert.doesNotMatch(css, /min-block-size:\s*(?:280|300|480)px/);
  assert.match(css, /\.feature-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("feature and promise icons are bare 24px Tabler outlines without tiles", () => {
  const icon = readFileSync("src/components/OutlineIcon.astro", "utf8");
  assert.match(icon, /width="24"/);
  assert.match(icon, /height="24"/);
  assert.match(icon, /stroke-width="1.5"/);
  assert.match(icon, /fill="none"/);
  assert.match(icon, /aria-hidden="true"/);
  for (const name of ["Features", "Security"]) {
    const source = readFileSync(`src/components/${name}.astro`, "utf8");
    assert.doesNotMatch(source, /@lucide|class="(?:feature|promise)-icon"/);
    assert.match(source, /<OutlineIcon name=\{icon\}/);
  }
  const glyph = css.match(/\.card-icon\s*\{([^}]+)\}/)[1];
  assert.match(glyph, /color:\s*var\(--color-fg-2\)/);
  assert.doesNotMatch(glyph, /border|background|shadow|padding/);
});

test("wide hero cards overlap exactly the phone bezel and never the conversation", () => {
  assert.match(css, /--hero-device-width:\s*360px/);
  assert.match(css, /--hero-device-bezel:\s*12px/);
  for (const selector of ["float-today", "phrase-start"]) {
    assert.match(
      css,
      new RegExp(
        `\\.${selector}\\s*\\{[^}]*inset-inline-end:\\s*calc\\(50% \\+ var\\(--hero-device-width\\) / 2 - var\\(--hero-device-bezel\\)\\)`,
      ),
    );
  }
  for (const selector of ["hero-right", "phrase-restart"]) {
    assert.match(
      css,
      new RegExp(
        `\\.${selector}\\s*\\{[^}]*inset-inline-start:\\s*calc\\(50% \\+ var\\(--hero-device-width\\) / 2 - var\\(--hero-device-bezel\\)\\)`,
      ),
    );
  }
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.match(motion, /x:\s*card\.dataset\.heroSide === "left" \? -48 : 48/);
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.equal((hero.match(/data-hero-side="left"/g) ?? []).length, 2);
  assert.equal((hero.match(/data-hero-side="right"/g) ?? []).length, 3);
  assert.doesNotMatch(css, /50% \+ 156px/);
  assert.match(css, /\.hero-float\s*\{[^}]*z-index:\s*3/);
  assert.match(css, /\.hero-device\s*\{[^}]*z-index:\s*2/);
  assert.doesNotMatch(css, /--hero-card-gap/);
});

test("compact hero cards overlap only the input area and grow the composition in flow", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.hero-device\s*\{[^}]*inline-size:\s*280px;\s*block-size:\s*auto/);
  assert.match(mobile, /\.hero-stage\s*\{[^}]*grid-template-rows:\s*auto 32px auto auto/);
  assert.match(mobile, /\.hero-device\s*\{[^}]*grid-row:\s*1 \/ 3/);
  assert.match(mobile, /\.hero-right\s*\{[^}]*position:\s*static;[^}]*grid-row:\s*2 \/ 4/);
  assert.match(mobile, /\.demo-thread\s*\{[^}]*flex:\s*none;[^}]*overflow:\s*visible/);
  assert.match(css, /\.demo-exchange\s*\{[^}]*margin-block-start:\s*0/);
  assert.match(mobile, /\.float-today,\s*\.hero-phrase\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.hero-right \.hero-float\s*\{[^}]*position:\s*static/);
  assert.match(mobile, /\.float-week\s*\{[^}]*grid-row:\s*1 \/ 3/);
  assert.match(mobile, /\.float-reminder\s*\{[^}]*grid-row:\s*2 \/ 4/);
  assert.match(mobile, /\.hero-right\s*\{[^}]*grid-template-rows:\s*auto 32px auto/);
  assert.match(mobile, /\.hero-stage \.week-chart\s*\{[^}]*block-size:\s*96px/);
  assert.match(css, /\.hero\s*\{[^}]*padding-block:\s*96px 96px/);
  assert.match(css, /\.demo-composer\s*\{[^}]*min-block-size:\s*48px/);
  assert.match(css, /\.demo-composer\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  assert.match(css, /\.demo-send\s*\{[^}]*inline-size:\s*32px;\s*block-size:\s*32px/);
});

test("the hero, trust strip and feature heading share the compact reference transition", () => {
  assert.match(css, /\.hero-stage\s*\{[^}]*padding-block-end:\s*64px/);
  assert.match(css, /\.hero\s*\{[^}]*padding-block:\s*96px 96px/);
  assert.match(css, /\.trust-content\s*\{[^}]*padding-block:\s*32px/);
  assert.match(css, /\.trust-strip \+ \.section\s*\{[^}]*padding-block-start:\s*96px/);
  assert.match(css, /#features \.section-heading\s*\{[^}]*gap:\s*16px/);
  assert.match(css, /\.section-title\s*\{[^}]*font-size:\s*var\(--fs-4xl\)/);
  assert.match(css, /\.section-inner\s*\{[^}]*gap:\s*32px/);
});

test("below 480px the phone, both product cards and reminder form one flowing cluster", () => {
  const compact = css.slice(
    css.indexOf("@media (max-width: 29.999rem)"),
    css.indexOf("@media (max-width: 23rem)"),
  );
  assert.match(
    compact,
    /\.hero-stage\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 180px\)\);[^}]*grid-template-rows:\s*auto 24px auto 16px auto auto;[^}]*column-gap:\s*12px;[^}]*padding:\s*0 16px/,
  );
  assert.match(compact, /\.hero-right\s*\{[^}]*display:\s*contents/);
  assert.match(compact, /\.hero-device\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*1 \/ 3/);
  assert.match(
    compact,
    /\.float-today,\s*\.hero-right \.hero-float\s*\{[^}]*position:\s*static;[^}]*display:\s*block;[^}]*inline-size:\s*100%;[^}]*max-inline-size:\s*none/,
  );
  assert.match(compact, /\.float-today\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2 \/ 5/);
  assert.match(compact, /\.float-week\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2 \/ 5/);
  assert.match(
    compact,
    /\.hero-right \.float-reminder\s*\{[^}]*z-index:\s*4;[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*4 \/ 6/,
  );
  assert.match(
    compact,
    /\.hero-phone > \.composition-caption\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*6;[^}]*padding-block-start:\s*12px/,
  );
  assert.match(compact, /\.hero\s*\{[^}]*padding-block-end:\s*48px/);
  assert.match(
    compact,
    /\.hero-stage \.product-card h3,\s*\.hero-stage \.habit-name,\s*\.hero-stage \.product-caption,\s*\.hero-stage \.chart-day\s*\{[^}]*font-size:\s*var\(--fs-sm\);[^}]*white-space:\s*nowrap/,
  );
  assert.match(
    compact,
    /\.float-today \.habit-emoji,\s*\.float-today \.product-caption\s*\{[^}]*display:\s*none/,
  );
  assert.match(compact, /\.hero-stage \.demo-examples\s*\{\s*display:\s*none/);
  for (const viewport of [320, 360, 384, 412, 479]) {
    const cardWidth = Math.min(180, (viewport - 32 - 12) / 2);
    const clusterWidth = 2 * cardWidth + 12;
    assert.ok(clusterWidth <= viewport - 32);
    assert.ok(cardWidth >= 138);
  }
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.feature-stack\s*\{[^}]*grid-template-rows:\s*auto 32px auto/);
});

test("the phone footer hides the install QR and shares the 16px content gutter", () => {
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(mobile, /\.footer-qr\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.site-footer\s*\{\s*--landing-gutter:\s*16px/);
  const footer = readFileSync("src/components/Footer.astro", "utf8");
  assert.match(footer, /href=\{appUrl\}[\s\S]*data-i18n="hero.web"/);
});

test("FAQ questions stay prominent and the chevron aligns with the first wrapped line", () => {
  const summary = css.match(/\.faq-list summary\s*\{([^}]+)\}/)[1];
  assert.match(summary, /font-size:\s*var\(--fs-xl\)/);
  assert.match(summary, /padding:\s*24px/);
  assert.match(summary, /align-items:\s*start/);
  assert.match(summary, /line-height:\s*var\(--lh-row\)/);
  assert.match(
    css,
    /\.faq-list summary svg\s*\{[^}]*margin-block-start:\s*calc\(\(1lh - 20px\) \/ 2\)/,
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.faq-list summary\s*\{[^}]*font-size:\s*var\(--fs-lg\)/);
  assert.doesNotMatch(mobile, /\.faq-list summary\s*\{[^}]*font-size:\s*var\(--fs-sm\)/);
});

test("the wide footer leads with a 240px marked QR while the hero sentence balances at 520px", () => {
  const footer = readFileSync("src/components/Footer.astro", "utf8");
  assert.match(footer, /class="footer-qr-code"/);
  assert.match(footer, /src="\/orbit-install-qr.svg" width="240" height="240"/);
  assert.match(footer, /class="footer-qr-mark"[^>]*aria-hidden="true"[^>]*set:html=\{orbitMark\}/);
  assert.match(css, /\.footer-qr\s*\{[^}]*gap:\s*12px;[^}]*font-size:\s*var\(--fs-sm\)/);
  assert.match(css, /\.footer-qr-code\s*\{[^}]*inline-size:\s*240px;[^}]*block-size:\s*240px/);
  assert.match(
    css,
    /\.footer-qr-mark\s*\{[^}]*inline-size:\s*48px;[^}]*block-size:\s*48px;[^}]*background:\s*var\(--color-bg\)/,
  );
  assert.match(css, /\.footer-content\s*\{[^}]*align-items:\s*start/);
  assert.doesNotMatch(css, /\.footer-qr\s*\{[^}]*padding:\s*8px/);
  assert.match(
    css,
    /\.hero-description\s*\{[^}]*max-inline-size:\s*520px;[^}]*font-size:\s*var\(--fs-md\);[^}]*text-wrap:\s*balance/,
  );
  assert.doesNotMatch(css, /\.hero-description\s*\{[^}]*max-inline-size:\s*29ch/);
});

test("wide hero side stacks start 48px below the phone and separate the phrase from the chart", () => {
  for (const selector of ["float-today", "hero-right"]) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*inset-block-start:\\s*48px`));
  }
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.match(
    hero,
    /class="hero-week-stack">\s*<p class="hero-phrase phrase-restart"[\s\S]*class="hero-float float-week"/,
  );
  assert.match(css, /\.hero-week-stack\s*\{[^}]*display:\s*grid;[^}]*gap:\s*12px/);
  assert.match(css, /\.hero-week-stack > \.hero-phrase\s*\{[^}]*position:\s*static/);
});

test("hero phrases keep intrinsic one-line width without recalculating the stage width inside a card", () => {
  const phrase = css.match(/^\.hero-phrase\s*\{([^}]+)\}/m)[1];
  assert.doesNotMatch(phrase, /max-inline-size:\s*var\(--hero-card-width\)/);
  assert.match(phrase, /inline-size:\s*max-content/);
  assert.match(phrase, /max-inline-size:\s*none/);
  assert.match(phrase, /flex-shrink:\s*0/);
  assert.match(phrase, /white-space:\s*nowrap/);
  assert.match(phrase, /overflow-wrap:\s*normal/);
  assert.match(phrase, /font-size:\s*var\(--fs-sm\)/);
  assert.match(phrase, /padding:\s*12px 16px/);
  for (const [, declarations] of css.matchAll(/[^{}]*\.hero-phrase[^{}]*\{([^}]+)\}/g)) {
    assert.doesNotMatch(declarations, /max-inline-size:\s*var\(--hero-card-width\)/);
    for (const [, value] of declarations.matchAll(/(?<![-\w])inline-size:\s*([^;]+)/g))
      assert.equal(value.trim(), "max-content");
    for (const [, value] of declarations.matchAll(/font-size:\s*([^;]+)/g))
      assert.equal(value.trim(), "var(--fs-sm)");
    for (const [, value] of declarations.matchAll(/padding:\s*([^;]+)/g))
      assert.equal(value.trim(), "12px 16px");
  }
  assert.match(css, /\.hero-week-stack\s*\{[^}]*grid-template-columns:\s*auto;[^}]*gap:\s*12px/);
});

test("the hero reserves side-stack heights and keeps card travel above the trust strip", () => {
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  const floatingCards = motion.slice(
    motion.indexOf("cards.forEach"),
    motion.indexOf('media.add("(prefers', motion.indexOf("cards.forEach")),
  );
  const verticalTravel = [...floatingCards.matchAll(/\by:\s*(-?\d+)/g)].map(([, value]) =>
    Number(value),
  );
  assert.equal(verticalTravel.length, 2);
  assert.ok(
    verticalTravel.every((value) => value <= 0),
    "no card travels below its reserved resting position",
  );
  for (const selector of ["float-today", "hero-right"]) {
    const rule = css.match(new RegExp(`^\\.${selector}\\s*\\{([^}]+)\\}`, "m"))[1];
    assert.match(rule, /position:\s*relative/);
    assert.match(rule, /grid-area:\s*1 \/ 1/);
    assert.match(rule, /align-self:\s*start/);
    assert.match(rule, /inset-block-start:\s*48px/);
  }
  assert.match(css, /\.hero-phone\s*\{[^}]*grid-area:\s*1 \/ 1/);
  const reserve = Number(css.match(/\.hero-stage\s*\{[^}]*padding-block-end:\s*(\d+)px/)[1]);
  const heroGap = Number(css.match(/\.hero\s*\{[^}]*padding-block:\s*\d+px (\d+)px/)[1]);
  assert.ok(reserve >= 48, "the stage includes the side stacks' relative 48px offset");
  assert.ok(reserve - 48 + heroGap >= 48, "the lowest card clears the trust rule by at least 48px");
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.hero-right\s*\{[^}]*position:\s*static/);
  assert.match(mobile, /\.hero-right\s*\{[^}]*justify-self:\s*center/);
  assert.match(mobile, /\.hero-right \.hero-float\s*\{[^}]*position:\s*static/);
  assert.match(mobile, /\.hero\s*\{[^}]*padding-block-end:\s*48px/);
});
