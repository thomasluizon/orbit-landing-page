import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
    /@media \(prefers-reduced-motion: no-preference\) and \(min-width: 67\.5rem\) and \(min-height: 46rem\)\s*\{\s*\.hero-pin-range\s*\{([^}]+)\}/,
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
  assert.match(
    css,
    /\.astra-demo\s*\{[^}]*gap:\s*calc\(24 \* var\(--mock-unit\)\);[^}]*padding:\s*calc\(16 \* var\(--mock-unit\)\)/,
  );
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
  for (const [selector, gap] of [
    ["section-heading", 16],
    ["feature-copy", 32],
  ]) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*gap:\\s*${gap}px;`));
  }
  assert.match(css, /\.feature-row\s*\{[^}]*gap:\s*64px/);
  assert.match(css, /\.final-section \.section-inner\s*\{[^}]*gap:\s*32px/);
  assert.doesNotMatch(css, /min-block-size:\s*(?:280|300|480)px/);
  assert.match(css, /\.feature-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("hero side columns fit only above their computed 1080px threshold", () => {
  const wide = css.slice(css.indexOf("@media (min-width: 67.5rem)"));
  assert.match(wide, /grid-template-columns:\s*296px 360px 296px/);
  assert.match(wide, /column-gap:\s*32px/);
  assert.match(wide, /inline-size:\s*min\(1016px, calc\(100% - 64px\)\)/);
  const widths = [
    ...wide.match(/grid-template-columns:\s*([\dpx ]+);/)[1].matchAll(/(\d+)px/g),
  ].map(([, n]) => Number(n));
  const gap = Number(wide.match(/column-gap:\s*(\d+)px/)[1]);
  const gutter = Number(wide.match(/calc\(100% - (\d+)px\)/)[1]) / 2;
  const threshold = widths.reduce((sum, width) => sum + width, 0) + 2 * gap + 2 * gutter;
  assert.equal(threshold, 1080);
  for (let viewport = 320; viewport <= 1920; viewport++) {
    if (viewport >= threshold)
      assert.ok(widths.reduce((sum, width) => sum + width, 0) + 2 * gap <= viewport - 2 * gutter);
  }
  assert.match(wide, /\.hero-phone\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/);
  assert.match(wide, /\.hero-left\s*\{[^}]*grid-column:\s*1/);
  assert.match(wide, /\.hero-right\s*\{[^}]*grid-column:\s*3/);
  assert.match(wide, /\.hero-side\s*\{[^}]*gap:\s*32px;[^}]*padding-block-start:\s*48px/);
  assert.doesNotMatch(
    css,
    /\.(?:hero-float|hero-phrase|hero-side|hero-left|hero-right|float-today|float-week|float-reminder|phrase-start|phrase-restart)[^{]*\{[^}]*(?:position:\s*(?:absolute|relative)|inset-|translate:|transform:|margin-block-start:\s*-)/,
  );
});

test("below the side-column threshold every product follows the centered phone in flow", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const base = css.slice(0, css.indexOf("@media (min-width: 67.5rem)"));
  assert.ok(hero.indexOf('class="hero-phone"') < hero.indexOf('class="hero-products"'));
  assert.match(
    base,
    /\.hero-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*16px/,
  );
  assert.match(
    base,
    /\.hero-products\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*16px/,
  );
  assert.match(base, /\.hero-side\s*\{[^}]*display:\s*contents/);
  assert.match(base, /\.hero-phone\s*\{[^}]*inline-size:\s*min\(343px, 100%\)/);
  assert.match(base, /\.hero-pin-range\s*\{[^}]*inline-size:\s*100%/);
  assert.match(
    base,
    /\.hero-stage\s*\{[^}]*inline-size:\s*min\(var\(--landing-content\), calc\(100% - 32px\)\)/,
  );
  for (const width of [320, 375, 412, 768, 1000, 1024, 1079]) {
    const available = width - 32;
    const gap = width >= 1024 ? 32 : 16;
    const columns = available >= 296 * 2 + gap ? 2 : 1;
    assert.ok((available - gap * (columns - 1)) / columns >= Math.min(296, available));
    assert.ok(Math.min(343, available) <= available);
  }
  assert.match(css, /@media \(min-width: 64rem\)\s*\{[^@]*\.hero-products\s*\{[^}]*gap:\s*32px/);
  assert.doesNotMatch(base, /\.(?:hero-float|hero-phrase)[^{]*\{[^}]*display:\s*none/);
});

test("the hero, trust strip and feature heading share the compact reference transition", () => {
  assert.match(css, /\.hero-stage\s*\{[^}]*padding-block-end:\s*32px/);
  assert.match(css, /\.hero\s*\{[^}]*padding-block:\s*96px 96px/);
  assert.match(css, /\.trust-content\s*\{[^}]*padding-block:\s*32px/);
  assert.match(css, /\.trust-strip \+ \.section\s*\{[^}]*padding-block-start:\s*96px/);
  assert.match(css, /#features \.section-heading\s*\{[^}]*gap:\s*16px/);
  assert.match(css, /\.section-title\s*\{[^}]*font-size:\s*var\(--fs-4xl\)/);
  assert.match(css, /\.section-inner\s*\{[^}]*gap:\s*32px/);
});

test("the hero moves whole side columns vertically without reducing any internal clearance", () => {
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  const columns = motion.slice(
    motion.indexOf("columns.forEach"),
    motion.indexOf('media.add("(prefers', motion.indexOf("columns.forEach")),
  );
  assert.match(motion, /querySelectorAll<HTMLElement>\("\[data-hero-column\]"\)/);
  assert.match(motion, /min-width: 67.5rem/);
  assert.match(columns, /\{ y: 16 \}/);
  assert.match(columns, /\{ y: 0, duration: 1, ease: "none" \}/);
  assert.doesNotMatch(columns, /\bx(?:Percent)?:|\.heroSide|scale:/);
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.equal((hero.match(/data-hero-column/g) ?? []).length, 2);
  assert.match(
    hero,
    /class="hero-side hero-left" data-hero-column[\s\S]*class="hero-float float-today"[\s\S]*class="hero-phrase phrase-start"/,
  );
  assert.match(
    hero,
    /class="hero-side hero-right" data-hero-column[\s\S]*class="hero-phrase phrase-restart"[\s\S]*class="hero-float float-week"[\s\S]*class="hero-float float-reminder"/,
  );
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

test("the FAQ is one compact list with separators only between rows", () => {
  const list = css.match(/\.faq-list\s*\{([^}]+)\}/)[1];
  assert.match(list, /gap:\s*0/);
  assert.match(
    css,
    /\.faq-list > details \+ details\s*\{[^}]*border-block-start:\s*1px solid var\(--color-hairline\)/,
  );
  assert.doesNotMatch(css, /\.faq-list details\s*\{[^}]*(?:background|box-shadow|border-radius)/);
  assert.doesNotMatch(css, /\.faq-list[^{}]*\{[^}]*border-block-end/);
  const summary = css.match(/\.faq-list summary\s*\{([^}]+)\}/)[1];
  assert.match(summary, /font-size:\s*var\(--fs-md\)/);
  assert.match(summary, /padding:\s*16px/);
  assert.match(summary, /min-block-size:\s*64px/);
  assert.match(summary, /border-radius:\s*var\(--radius-sm\)/);
  assert.match(summary, /align-content:\s*center/);
  assert.match(summary, /align-items:\s*start/);
  assert.match(summary, /line-height:\s*var\(--lh-row\)/);
  assert.match(summary, /transition:\s*background-color var\(--duration-hover-control\)/);
  assert.match(
    css,
    /\.faq-list summary svg\s*\{[^}]*inline-size:\s*16px;[^}]*block-size:\s*16px;[^}]*margin-block-start:\s*calc\(\(1lh - 16px\) \/ 2\)/,
  );
  assert.match(css, /\.faq-list details p\s*\{[^}]*padding:\s*4px 16px 16px/);
  assert.match(css, /\.faq-list summary:hover\s*\{[^}]*background:\s*var\(--color-bg-hover\)/);
  assert.match(css, /\.final-section\s*\{[^}]*padding-block-start:\s*64px/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.doesNotMatch(mobile, /\.faq-list summary\s*\{[^}]*font-size:/);
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
  assert.match(css, /\.footer-qr\s*\{[^}]*padding:\s*8px/);
  assert.match(
    css,
    /\.hero-description\s*\{[^}]*max-inline-size:\s*520px;[^}]*font-size:\s*var\(--fs-md\);[^}]*text-wrap:\s*balance/,
  );
  assert.doesNotMatch(css, /\.hero-description\s*\{[^}]*max-inline-size:\s*29ch/);
});

test("pinned content starts 32px below the measured header bottom", () => {
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.match(motion, /document.getElementById\("site-header"\)/);
  assert.match(motion, /getBoundingClientRect\(\).bottom/);
  assert.match(motion, /start:\s*\(\) => `top \$\{[^}]*bottom[^}]*\+ 32\}px`/);
});

test("hero phrases stay within their reserved column without touching another surface", () => {
  const phrase = css.match(/^\.hero-phrase\s*\{([^}]+)\}/m)[1];
  assert.match(phrase, /inline-size:\s*fit-content/);
  assert.match(phrase, /max-inline-size:\s*100%/);
  assert.match(phrase, /font-size:\s*var\(--fs-sm\)/);
  assert.match(phrase, /padding:\s*12px 16px/);
  assert.match(phrase, /overflow-wrap:\s*normal/);
});

test("the hero reserves every side column and its vertical travel above the trust strip", () => {
  const stage = css.match(/^\.hero-stage\s*\{([^}]+)\}/m)[1];
  assert.match(stage, /padding-block-end:\s*32px/);
  assert.match(stage, /margin-inline:\s*auto/);
  const wide = css.slice(css.indexOf("@media (min-width: 67.5rem)"));
  assert.match(wide, /\.hero-side\s*\{[^}]*grid-row:\s*1;[^}]*align-self:\s*start/);
  assert.match(css, /\.hero\s*\{[^}]*padding-block:\s*96px 96px/);
  assert.ok(32 >= 16, "the stage reserves the full 16px vertical column travel");
});

test("below 768px the 34px hero leads every 28px section heading without word breaks", () => {
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(
    mobile,
    /\.hero \.t-hero\s*\{[^}]*font-size:\s*var\(--fs-3xl\);[^}]*line-height:\s*1\.1;[^}]*max-inline-size:\s*380px/,
  );
  assert.match(
    mobile,
    /\.hero \.t-hero\s*\{[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal/,
  );
  assert.match(
    mobile,
    /\.section-title,\s*\.feature-copy \.section-title\s*\{[^}]*font-size:\s*var\(--fs-2xl\)/,
  );
  assert.match(mobile, /\.hero-copy\s*\{[^}]*gap:\s*24px;[^}]*padding-inline:\s*16px/);
  const narrower = css.slice(css.indexOf("@media (max-width: 40rem)"));
  assert.doesNotMatch(narrower, /\.(?:t-hero|section-title)\s*\{[^}]*font-size:/);
  assert.doesNotMatch(narrower, /\.t-hero\s*\{[^}]*max-inline-size:/);
  assert.match(css, /\.hero\s*\{[^}]*gap:\s*24px/);
  assert.match(css, /\.hero-copy\s*\{[^}]*gap:\s*24px/);
  assert.match(css, /\.hero-pin-range\s*\{[^}]*padding-block-start:\s*8px/);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(global, /\.t-hero\s*\{[^}]*font-family:\s*var\(--font-display\)/);
  assert.match(global, /--font-display:\s*var\(--font-space-grotesk\)/);
});

test("the narrow header scrolls in flow and every mobile section shares the 16px gutter", () => {
  const flow = css.slice(
    css.indexOf("@media (width < 67.5rem)"),
    css.indexOf("@media (max-width: 56rem)"),
  );
  assert.match(
    flow,
    /\.site-header\s*\{[^}]*position:\s*static;[^}]*padding-inline:\s*var\(--landing-gutter\)/,
  );
  const mobile = css.slice(
    css.indexOf("@media (max-width: 47.999rem)"),
    css.indexOf("@media (max-width: 40rem)"),
  );
  assert.match(mobile, /\.landing-shell\s*\{[^}]*--landing-gutter:\s*16px/);
  assert.match(mobile, /\.feature-stack\s*\{[^}]*gap:\s*16px/);
  assert.match(mobile, /\.feature-secondary\s*\{[^}]*margin-block-start:\s*0/);
  assert.doesNotMatch(mobile, /margin[^:]*:\s*-|grid-row:\s*\d+ \/ \d+/);
  assert.match(
    css,
    /\.section-inner\s*\{[^}]*inline-size:\s*min\(var\(--landing-content\), calc\(100% - 2 \* var\(--landing-gutter\)\)\)/,
  );
  assert.match(css, /\.trust-strip\s*\{[^}]*padding-inline:\s*var\(--landing-gutter\)/);
  const row = css.slice(css.indexOf("@media (max-width: 40rem)"));
  assert.match(
    row,
    /\.feature-grid,\s*\.security-grid,\s*\.pricing-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  const tables = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports: tables },
  );
  for (const locale of ["en", "pt-BR"]) {
    for (const width of [320, 375, 412]) {
      assert.ok(tables.translations[locale]["hero.title"]);
      assert.equal(width - 2 * 16, { 320: 288, 375: 343, 412: 380 }[width]);
      assert.ok(Math.min(343, width - 32) <= 343);
    }
  }
});

test("every landing pill uses the shared app geometry and only hero install is md", () => {
  const pill = readFileSync("src/components/PillButton.astro", "utf8");
  for (const [size, height, padding, font] of [
    ["sm", 40, 18, 14],
    ["md", 50, 26, 16],
  ]) {
    const classes = pill.match(new RegExp(`${size}:\\s*"([^"\\n]+)"`))[1];
    assert.ok(classes.includes(`h-[${height}px]`));
    assert.ok(classes.includes(`px-[${padding}px]`));
    assert.ok(classes.includes(`text-[${font}px]`));
    assert.doesNotMatch(classes, /min-h-|min-w-|size-/);
  }
  for (const file of readdirSync("src/components").filter((name) => name.endsWith(".astro"))) {
    const source = readFileSync(`src/components/${file}`, "utf8");
    for (const [tag] of source.matchAll(/<PillButton\b[^>]*>/g)) {
      const size = tag.match(/size="([^"]+)"/)?.[1] ?? "sm";
      assert.ok(["sm", "md"].includes(size), file);
      assert.equal(size, file === "Hero.astro" ? "md" : "sm", file);
      assert.doesNotMatch(tag, /class="[^"\n]*(?:min-h-|h-\[|py-|px-)/, file);
    }
  }
});

test("phone controls follow the screen-to-390 scale and keep one trailing action row", () => {
  assert.match(css, /\.device-screen\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(css, /\.astra-demo\s*\{[^}]*--mock-unit:\s*calc\(100cqi \/ 390\)/);
  const row = css.match(/\.demo-preview-actions\s*\{([^}]+)\}/)[1];
  assert.match(row, /flex-wrap:\s*nowrap/);
  assert.match(row, /justify-content:\s*flex-end/);
  assert.match(row, /gap:\s*calc\(12 \* var\(--mock-unit\)\)/);
  const button = css.match(/\.demo-preview-actions \.pill-sm\s*\{([^}]+)\}/)[1];
  for (const [property, size] of [
    ["block-size", 40],
    ["padding-inline", 18],
    ["font-size", 14],
  ]) {
    assert.match(button, new RegExp(`${property}:\\s*calc\\(${size} \\* var\\(--mock-unit\\)\\)`));
  }
  const demo = readFileSync("src/components/AstraDemo.astro", "utf8");
  assert.match(demo, /id="demo-approve" variant="primary" size="sm"/);
  const chip = css.match(/\.demo-chip\s*\{([^}]+)\}/)[1];
  assert.match(chip, /padding:\s*calc\(8 \* var\(--mock-unit\)\) calc\(12 \* var\(--mock-unit\)\)/);
  assert.match(chip, /border-radius:\s*calc\(8 \* var\(--mock-unit\)\)/);
  assert.match(chip, /white-space:\s*nowrap/);
  assert.doesNotMatch(chip, /min-block-size:\s*48px/);
  const language = css.match(/\.language-toggle\s*\{([^}]+)\}/)[1];
  assert.match(language, /block-size:\s*40px/);
  assert.match(language, /padding-inline:\s*12px/);
  assert.match(language, /font-size:\s*var\(--fs-sm\)/);
  assert.match(language, /border-radius:\s*var\(--radius-md\)/);
});

test("visible primary actions share one accent and the phone approval has priority", () => {
  const source = readFileSync("src/scripts/primary-actions.ts", "utf8");
  const actions = ["install", "demo-approve", "features", "pro", "final"].map((id) => ({
    id,
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  }));
  const observed = [];
  let update;
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      document: {
        querySelectorAll(selector) {
          assert.equal(selector, "[data-primary-action]");
          return actions;
        },
      },
      IntersectionObserver: class {
        constructor(callback) {
          update = callback;
        }
        observe(action) {
          observed.push(action);
        }
      },
    },
  );
  assert.deepEqual(observed, actions);
  for (let mask = 0; mask < 2 ** actions.length; mask++) {
    update(
      actions.map((target, index) => ({
        target,
        isIntersecting: Boolean(mask & (1 << index)),
        intersectionRect: { width: 100, height: 40 },
      })),
    );
    const active = actions.filter((action) => action.attrs["data-accent-active"] === "true");
    assert.equal(active.length, mask ? 1 : 0);
    if (mask & 2) assert.equal(active[0].id, "demo-approve");
  }
  update(
    actions.map((target) => ({
      target,
      isIntersecting: true,
      intersectionRect: { width: 0, height: 0 },
    })),
  );
  assert.ok(actions.every((action) => action.attrs["data-accent-active"] === "false"));
  const primitive = readFileSync("src/components/PillButton.astro", "utf8");
  assert.match(primitive, /data-primary-action=\{variant === "primary"/);
  assert.match(primitive, /import "\.\.\/scripts\/primary-actions"/);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(
    global,
    /\[data-primary-action\]\[data-accent-active="false"\]\s*\{[^}]*background-color:\s*var\(--color-bg-well\)/,
  );
});

test("every inline Astra glyph keeps its asset viewBox and the native 16px drawing", async () => {
  const { parse } = await import("@astrojs/compiler");
  const source = readFileSync("src/components/AstraGlyph.astro", "utf8");
  const { ast } = await parse(source);
  const nodes = (node) => [node, ...(node.children ?? []).flatMap(nodes)];
  const inline = nodes(ast).find(
    (node) => node.name === "svg" && node.attributes.some((a) => a.name === "viewBox"),
  );
  const attribute = inline.attributes.find((a) => a.name === "viewBox");
  for (const size of [16, 20, 24, 48]) {
    const asset = readFileSync(`public/brand/astra-mark${size === 16 ? "-16" : ""}.svg`, "utf8");
    const expected = asset.match(/viewBox="([^"]+)"/)[1];
    if (attribute.kind !== "expression") {
      assert.equal(
        attribute.value,
        expected,
        "inline viewBox must preserve the asset's orbital band and dot",
      );
      continue;
    }
    const context = vm.createContext({
      Astro: { props: { size } },
      exports: {},
      require(path) {
        assert.match(path, /^\.\.\/\.\.\/public\/brand\/astra-mark(?:-16)?\.svg\?raw$/);
        return { default: readFileSync(path.replace("../../", "").replace("?raw", ""), "utf8") };
      },
    });
    vm.runInContext(
      ts.transpileModule(source.split("---")[1], {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      context,
    );
    assert.equal(vm.runInContext(attribute.value, context), expected);
    const mark = vm.runInContext("mark", context);
    assert.deepEqual(
      [...mark.paths.matchAll(/d="([^"]+)"/g)].map(([, d]) => d),
      [...asset.matchAll(/d="([^"]+)"/g)].filter(([, d]) => d.startsWith("M")).map(([, d]) => d),
    );
  }
  assert.match(source, /astra-mark-16\.svg\?raw/);
  for (const symbol of nodes(ast).filter((node) => node.name === "symbol")) {
    const viewBox = symbol.attributes.find((a) => a.name === "viewBox");
    assert.equal(viewBox.kind, "expression");
  }
  const blocks = readFileSync("src/components/AstraBlock.astro", "utf8");
  assert.match(blocks, /<AstraGlyph size=\{16\}/);
});

test("Orbit marks retain the canonical full asset frames", () => {
  for (const [name, expected] of [
    ["orbit-mark-accent", "0 0 1024 1024"],
    ["orbit-mark-16", "0 0 16 16"],
  ]) {
    const asset = readFileSync(`public/brand/${name}.svg`, "utf8");
    assert.equal(asset.match(/viewBox="([^"]+)"/)[1], expected);
  }
  for (const component of ["Header", "Footer"]) {
    const source = readFileSync(`src/components/${component}.astro`, "utf8");
    assert.match(source, /orbit-lockup\.svg\?raw/);
    assert.doesNotMatch(source, /viewBox=/);
  }
});

test("every hover and press fill keeps at least 8px inline and 4px block clearance", () => {
  const global = readFileSync("src/styles/global.css", "utf8");
  const rules = [...(global + css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(
    ([, selectors, body]) =>
      selectors.split(",").map((selector) => ({
        selector: selector.trim(),
        declarations: Object.fromEntries(
          [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value]),
        ),
      })),
  );
  const pixels = (value) => {
    if (value.startsWith("calc("))
      return (Number(value.match(/calc\((-?\d+)/)[1]) * (320 - 32 - 24)) / 390;
    return Number(value.replace("px", ""));
  };
  const fills = rules.filter(
    ({ selector, declarations }) =>
      /:(?:hover|active|focus-visible)\b/.test(selector) &&
      (declarations.background || declarations["background-color"]),
  );
  assert.ok(fills.length >= 10);
  for (const { selector } of fills) {
    const base = selector.replace(/:(?:hover|active|focus-visible)\b/g, "");
    if (base.startsWith("[data-primary-action]")) continue;
    const style = Object.assign(
      {},
      ...rules.filter((rule) => rule.selector === base).map((rule) => rule.declarations),
    );
    const padding = (style.padding ?? "0").match(/calc\([^;]+?\)\)|[^\s]+/g).map(pixels);
    const inline = style["padding-inline"]
      ? style["padding-inline"].match(/calc\([^;]+?\)\)|[^\s]+/g).map(pixels)
      : [padding[1] ?? padding[0], padding[3] ?? padding[1] ?? padding[0]];
    const block = style["padding-block"]
      ? [pixels(style["padding-block"])]
      : [padding[0], padding[2] ?? padding[0]];
    assert.ok(Math.min(...inline) >= 8, `${selector} must pad its fill inline`);
    assert.ok(Math.min(...block) >= 4, `${selector} must pad its fill on the block axis`);
    assert.ok(style["border-radius"], `${selector} needs its own fill radius`);
  }
  assert.doesNotMatch(
    global + css,
    /:focus(?!-visible)[^{]*\{[^}]*(?:outline|box-shadow|background)/,
  );
  assert.match(css, /\.brand\s*\{[^}]*padding:\s*4px 8px;[^}]*border-radius:\s*var\(--radius-md\)/);
  for (const name of ["Header", "Footer"]) {
    const source = readFileSync(`src/components/${name}.astro`, "utf8");
    assert.match(source, /orbitLockup\s*\.replace\(/);
    assert.match(source, /set:html=\{lockup\}/);
    assert.doesNotMatch(source, /\btitle=/);
  }
});

test("FAQ questions and answers share one inset with an 8px text gap and 16px bottom padding", () => {
  assert.match(
    css,
    /\.faq-list details\[open\] summary\s*\{[^}]*min-block-size:\s*0;[^}]*padding-block-end:\s*4px/,
  );
  const answer = css.match(/\.faq-list details p\s*\{([^}]+)\}/)[1];
  assert.match(answer, /padding:\s*4px 16px 16px/);
  assert.match(answer, /font-size:\s*var\(--fs-base\)/);
  assert.match(answer, /line-height:\s*var\(--lh-body\)/);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(global, /--lh-body:\s*1.55/);
});

test("cards keep 24px padding, list rows keep 16px, and section groups follow the 2x rhythm", () => {
  for (const selector of ["product-card", "feature-card", "promise-card", "plan-card"]) {
    for (const [, declarations] of css.matchAll(
      new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`, "g"),
    )) {
      const padding = declarations.match(/(?<![-\w])padding:\s*([^;]+)/);
      if (padding) assert.equal(padding[1], "24px", selector);
    }
  }
  for (const [, declarations] of css.matchAll(/[^{}]*\.habit-row\s*\{([^}]+)\}/g)) {
    const padding = declarations.match(/(?<![-\w])padding:\s*([^;]+)/);
    if (padding) assert.equal(padding[1], "16px");
  }
  const gap = (selector) =>
    Number(css.match(new RegExp(`\\.${selector}\\s*\\{[^}]*gap:\\s*(\\d+)px`))[1]);
  assert.ok(gap("section-inner") >= 2 * gap("section-heading"));
  assert.ok(gap("feature-copy") >= 2 * gap("feature-intro"));
  assert.ok(gap("feature-row") >= 2 * gap("feature-copy"));
  assert.match(css, /--landing-section-gap:\s*96px/);
  assert.doesNotMatch(css, /--landing-section-gap:\s*160px/);
});

test("the flowing hero caps at two columns and keeps phrase chips after the product cards", () => {
  const base = css.match(/^\.hero-products\s*\{([^}]+)\}/m)[1];
  assert.match(base, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(base, /auto-fit|auto-fill/);
  const two = css.slice(
    css.indexOf("@media (min-width: 40rem)"),
    css.indexOf("@media (min-width: 64rem)"),
  );
  assert.match(
    two,
    /\.hero-products\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(css, /\.hero-phrase\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*order:\s*1/);
  const wide = css.slice(css.indexOf("@media (min-width: 67.5rem)"));
  assert.match(wide, /\.hero-phrase\s*\{[^}]*grid-column:\s*auto;[^}]*order:\s*0/);
  for (let width = 320; width < 1080; width++) {
    const columns = width < 640 ? 1 : 2;
    const gap = width >= 1024 ? 32 : 16;
    assert.ok((width - 32 - gap * (columns - 1)) / columns >= Math.min(296, width - 32));
  }
});

test("the composer and send control use the same screen scale as the other mock controls", () => {
  const composer = css.match(/^\.demo-composer\s*\{([^}]+)\}/m)[1];
  assert.match(composer, /min-block-size:\s*calc\(48 \* var\(--mock-unit\)\)/);
  assert.match(composer, /font-size:\s*calc\(16 \* var\(--mock-unit\)\)/);
  const send = css.match(/^\.demo-send\s*\{([^}]+)\}/m)[1];
  assert.match(send, /inline-size:\s*calc\(32 \* var\(--mock-unit\)\)/);
  assert.match(send, /block-size:\s*calc\(32 \* var\(--mock-unit\)\)/);
  assert.match(css, /\.demo-send svg\s*\{[^}]*inline-size:\s*calc\(16 \* var\(--mock-unit\)\)/);
});
