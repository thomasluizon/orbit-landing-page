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
  assert.match(css, /\.hero-device\s*\{[^}]*block-size:\s*700px/);
  assert.match(css, /\.hero-device\s*\{[^}]*padding:\s*10px/);
  assert.match(css, /\.hero-device\s*\{[^}]*border-radius:\s*56px/);
  assert.match(css, /\.device-screen\s*\{[^}]*border-radius:\s*46px/);
  assert.match(css, /\.device-speaker\s*\{[^}]*inline-size:\s*96px;\s*block-size:\s*28px/);
});

test("marketing paragraphs use the body role and feature titles have the reference weight", () => {
  for (const selector of [
    "section-description",
    "feature-card p",
    "plan-description",
    "plan-card li",
    "footer-brand p",
  ]) {
    const declarations = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))[1];
    assert.match(declarations, /font-size:\s*var\(--fs-base\)/, selector);
  }
  assert.match(css, /\.feature-grid \.feature-card h3\s*\{[^}]*font-size:\s*var\(--fs-3xl\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(mobile, /\.feature-grid \.feature-card h3\s*\{[^}]*font-size:\s*var\(--fs-2xl\)/);
  assert.match(css, /\.feature-grid \.feature-card\s*\{[^}]*padding:\s*28px/);
  assert.match(mobile, /\.feature-grid \.feature-card\s*\{[^}]*padding:\s*24px/);
  assert.match(mobile, /\.feature-grid,\s*\.security-grid\s*\{[^}]*gap:\s*16px/);
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

test("outlined feature icon tiles use the requested 40px geometry", () => {
  const tile = css.match(/\.feature-icon\s*\{([^}]+)\}/)[1];
  assert.match(tile, /inline-size:\s*40px/);
  assert.match(tile, /block-size:\s*40px/);
  assert.match(tile, /var\(--color-hairline-strong\)/);
  assert.match(tile, /var\(--radius-md\)/);
});

test("wide hero cards and their motion stay outside the phone with a 24px clearance", () => {
  assert.match(css, /--hero-device-width:\s*360px/);
  assert.match(css, /--hero-card-gap:\s*24px/);
  for (const selector of ["float-today", "phrase-start"]) {
    assert.match(
      css,
      new RegExp(
        `\\.${selector}\\s*\\{[^}]*inset-inline-end:\\s*calc\\(50% \\+ var\\(--hero-device-width\\) / 2 \\+ var\\(--hero-card-gap\\)\\)`,
      ),
    );
  }
  for (const selector of ["hero-right", "phrase-restart"]) {
    assert.match(
      css,
      new RegExp(
        `\\.${selector}\\s*\\{[^}]*inset-inline-start:\\s*calc\\(50% \\+ var\\(--hero-device-width\\) / 2 \\+ var\\(--hero-card-gap\\)\\)`,
      ),
    );
  }
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.match(motion, /x:\s*card\.dataset\.heroSide === "left" \? -48 : 48/);
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.equal((hero.match(/data-hero-side="left"/g) ?? []).length, 2);
  assert.equal((hero.match(/data-hero-side="right"/g) ?? []).length, 3);
  assert.doesNotMatch(css, /50% \+ 156px/);
});

test("compact hero cards overlap only the input area and grow the composition in flow", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 47.999rem)"));
  assert.match(
    mobile,
    /\.hero-device\s*\{[^}]*inline-size:\s*280px;\s*min-block-size:\s*540px;\s*block-size:\s*auto/,
  );
  assert.match(mobile, /\.hero-stage\s*\{[^}]*grid-template-rows:\s*auto 144px auto auto/);
  assert.match(mobile, /\.hero-device\s*\{[^}]*grid-row:\s*1 \/ 3/);
  assert.match(mobile, /\.hero-right\s*\{[^}]*position:\s*static;[^}]*grid-row:\s*2 \/ 4/);
  assert.match(mobile, /\.demo-thread\s*\{[^}]*flex:\s*none;[^}]*overflow:\s*visible/);
  assert.match(mobile, /\.demo-exchange\s*\{[^}]*margin-block-start:\s*0/);
  assert.match(mobile, /\.float-today,\s*\.hero-phrase\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.hero-right \.hero-float\s*\{[^}]*position:\s*static/);
  assert.match(mobile, /\.float-week\s*\{[^}]*grid-row:\s*1 \/ 3/);
  assert.match(mobile, /\.float-reminder\s*\{[^}]*grid-row:\s*2/);
  assert.match(mobile, /\.hero-stage \.week-chart\s*\{[^}]*block-size:\s*96px/);
  assert.match(css, /\.hero\s*\{[^}]*padding-block:\s*96px var\(--landing-section-gap\)/);
  assert.match(css, /\.demo-composer\s*\{[^}]*min-block-size:\s*48px/);
  assert.match(css, /\.demo-composer\s*\{[^}]*font-size:\s*var\(--fs-base\)/);
  assert.match(css, /\.demo-send\s*\{[^}]*inline-size:\s*32px;\s*block-size:\s*32px/);
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
