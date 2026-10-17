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
  assert.match(css, /inline-size:\s*min\(368px, 100%\)/);
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
