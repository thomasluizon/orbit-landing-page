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

test("the Astra conversation sits in a full phone with status chrome and a home indicator", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.match(hero, /class="device-status" aria-hidden="true"/);
  assert.match(hero, /data-mock>9:41/);
  assert.match(hero, /class="device-home"/);
  assert.match(hero, /class="device-screen"/);
  assert.match(css, /\.hero-device\s*\{[^}]*aspect-ratio:\s*9 \/ 19\.5/);
  assert.match(css, /\.hero-device\s*\{[^}]*padding:\s*var\(--hero-device-bezel\)/);
  assert.match(css, /\.hero-device\s*\{[^}]*border-radius:\s*56px/);
  assert.match(
    css,
    /\.device-screen\s*\{[^}]*border-radius:\s*calc\(56px - var\(--hero-device-bezel\)\)/,
  );
  assert.match(css, /\.device-speaker\s*\{[^}]*inline-size:\s*96px;\s*block-size:\s*28px/);
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
  const demo = readFileSync("src/components/AstraDemo.astro", "utf8");
  assert.match(demo, /<AstraGlyph/);
});

test("Orbit marks retain the canonical full asset frames", () => {
  for (const [name, expected] of [
    ["orbit-mark-accent", "0 0 1024 1024"],
    ["orbit-mark-16", "0 0 16 16"],
  ]) {
    const asset = readFileSync(`public/brand/${name}.svg`, "utf8");
    assert.equal(asset.match(/viewBox="([^"]+)"/)[1], expected);
  }
  for (const component of ["Header"]) {
    const source = readFileSync(`src/components/${component}.astro`, "utf8");
    assert.match(source, /orbit-lockup\.svg\?raw/);
    assert.doesNotMatch(source, /viewBox=/);
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

test("the seven metric bar columns never wrap or exceed their block at 320px", () => {
  const rows = [...css.matchAll(/\.metric-bars(?:\[[^\]]+\])?\s*\{([^}]+)\}/g)];
  assert.ok(rows.length);
  for (const [, declarations] of rows) {
    assert.match(
      declarations,
      /grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/,
      "every metric row override must retain seven shrinkable columns",
    );
    assert.doesNotMatch(declarations, /flex-wrap:\s*wrap/);
  }
  const targets = [...css.matchAll(/(?:button)?\.metric-bar-track\s*\{([^}]+)\}/g)];
  for (const [, declarations] of targets) {
    assert.doesNotMatch(
      declarations,
      /min-(?:inline-size|width):\s*[1-9]\d*px/,
      "fixed per-bar minimums cannot fit seven targets inside the compact card",
    );
  }
  assert.match(css, /\.metric-bar-track\s*\{[^}]*block-size:\s*128px;[^}]*min-inline-size:\s*0/);
});

test("each metric day target fills its whole column, as the app BarChart does", () => {
  const row = css.match(/^\.metric-bars\s*\{([^}]+)\}/m)[1];
  assert.match(
    row,
    /(?:^|;|\s)gap:\s*0;/,
    "adjacent day targets share an edge, with no dead gap between them",
  );
  const track = css.match(/^\.metric-bar-track\s*\{([^}]+)\}/m)[1];
  assert.match(
    track,
    /padding-inline:\s*4px/,
    "the visible bars keep their 8px visual gap inside the full-column targets",
  );
  const button = css.match(/^button\.metric-bar-track\s*\{([^}]+)\}/m)[1];
  assert.doesNotMatch(
    button,
    /padding(?:-inline)?:\s*0(?:\s|;)/,
    "the button keeps the track's inline inset",
  );
  assert.match(css, /button\.metric-bar-track:focus-visible\s*\{[^}]*outline-offset:\s*-2px/);
});

test("compact habit rows use the owner's pill and rounded-square check standard", () => {
  assert.match(
    css,
    /\.habit-row\s*\{[^}]*block-size:\s*48px;[^}]*border-radius:\s*var\(--radius-xl\);[^}]*background:\s*var\(--color-bg-card\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--color-hairline-ghost\)/,
  );
  assert.match(
    css,
    /\.habit-emoji\s*\{[^}]*inline-size:\s*35px;[^}]*block-size:\s*35px;[^}]*border-radius:\s*var\(--radius-md\)/,
  );
  assert.match(css, /\.habit-name\s*\{[^}]*font-size:\s*var\(--fs-sm\);[^}]*font-weight:\s*500/);
  assert.match(css, /\.product-caption\s*\{[^}]*font-size:\s*var\(--fs-xs\)/);
  assert.match(
    css,
    /\.status-ring\s*\{[^}]*inline-size:\s*28px;[^}]*block-size:\s*28px;[^}]*border-radius:\s*var\(--radius-md\);[^}]*border:\s*1px solid var\(--color-status-empty\)/,
  );
  assert.match(
    css,
    /\.status-ring.is-done\s*\{[^}]*background:\s*var\(--color-status-done\);[^}]*color:\s*var\(--color-bg\)/,
  );
  assert.match(css, /\.habit-check\s*\{[^}]*inline-size:\s*44px;[^}]*block-size:\s*44px/);
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.match(global, /--radius-md:\s*12px/);
  assert.match(global, /--radius-xl:\s*20px/);
  assert.match(global, /--color-hairline-ghost:\s*rgba\(255, 255, 255, 0\.1\)/);
  assert.match(global, /--color-bg-card:\s*rgba\(250, 250, 250, 0\.04\)/);
  assert.match(
    css,
    /\.demo-preview-actions \.pill-sm\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/,
  );
});

test("the phone fits a safe viewport height and preserves the device aspect ratio", () => {
  assert.match(css, /100svh - var\(--hero-pin-top\) - 96px/);
  assert.match(css, /aspect-ratio:\s*9 \/ 19\.5/);
  assert.match(css, /--hero-device-width:\s*min\(\s*330px/);
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1352, 762],
    [1920, 1080],
  ]) {
    const top = width <= 640 ? 96 : 112;
    const deviceWidth = Math.min(330, ((height - top - 96) * 9) / 19.5, width - 64);
    const bottom = top + (deviceWidth * 19.5) / 9 + 64;
    assert.ok(bottom <= height - 31, `${width}x${height} must reserve bottom clearance`);
  }
});

test("mobile removes the floating cards and keeps the four screens inside the phone", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.equal((hero.match(/data-phone-slide=/g) ?? []).length, 4);
  assert.match(css, /@media \(width < 768px\)[\s\S]*?\.hero-products\s*\{\s*display:\s*none/);
  assert.match(css, /\.carousel-segment\s*\{[^}]*inline-size:\s*48px;[^}]*block-size:\s*48px/);
  assert.doesNotMatch(readFileSync("src/components/AstraDemo.astro", "utf8"), /demo-playback/);
  assert.match(hero, /id="hero-playback"/);
});

test("pinning and staggered feature motion use verified APIs and expose their static end state", () => {
  const source = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.equal(
    (source.match(/media\.add\(/g) ?? []).length,
    (source.match(/prefers-reduced-motion: no-preference/g) ?? []).length,
  );
  assert.match(source, /pin:\s*true/);
  assert.match(source, /bottom[^}]*\+ 16/);
  assert.match(source, /end:\s*"\+=560"/);
  assert.match(
    css,
    /prefers-reduced-motion: no-preference[^}]*\.hero-pin-range\s*\{\s*padding-block-end:\s*560px/s,
  );
  assert.match(source, /\[data-composition-card\]/);
  assert.match(source, /scale: 0\.94/);
  assert.match(source, /stagger: 0\.12/);
  assert.match(source, /scrub: 0\.6/);
  assert.match(source, /media\.revert\(\)/);
  assert.match(source, /lenis\.destroy\(\)/);
  assert.match(
    css,
    /\[data-composition-card\]\s*\{\s*transform:\s*none !important;\s*opacity:\s*1 !important/,
  );
  const frame = css.match(/\.example-card\s*\{([^}]+)\}/)?.[1];
  assert.doesNotMatch(frame, /background|box-shadow/);
});

test("back to top appears past the hero and yields to footer links and consent", () => {
  for (const reduced of [false, true]) {
    let intersection,
      mutation,
      scrolled,
      focused = false;
    const events = new Map(),
      hero = {},
      footer = {},
      banner = { hidden: true },
      button = { hidden: true, addEventListener: (name, fn) => events.set(name, fn) };
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/back-to-top.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports: {},
        document: {
          getElementById: (id) => ({ hero, "back-to-top": button, "consent-banner": banner })[id],
          querySelector: (selector) =>
            selector === ".product-footer"
              ? footer
              : {
                  focus() {
                    focused = true;
                  },
                },
        },
        window: {
          matchMedia: () => ({ matches: reduced }),
          scrollTo: (options) => {
            scrolled = options;
          },
        },
        IntersectionObserver: class {
          constructor(fn) {
            intersection = fn;
          }
          observe() {}
        },
        MutationObserver: class {
          constructor(fn) {
            mutation = fn;
          }
          observe() {}
        },
      },
    );
    intersection([{ target: hero, isIntersecting: true, boundingClientRect: { bottom: 600 } }]);
    assert.equal(button.hidden, true);
    intersection([{ target: hero, isIntersecting: false, boundingClientRect: { bottom: -1 } }]);
    assert.equal(button.hidden, false);
    intersection([{ target: footer, isIntersecting: true }]);
    assert.equal(button.hidden, true);
    intersection([{ target: footer, isIntersecting: false }]);
    assert.equal(button.hidden, false);
    banner.hidden = false;
    mutation();
    assert.equal(button.hidden, true);
    banner.hidden = true;
    mutation();
    assert.equal(button.hidden, false);
    events.get("click")();
    assert.equal(scrolled.top, 0);
    assert.equal(scrolled.behavior, reduced ? "instant" : "smooth");
    assert.equal(focused, true);
  }
  assert.match(css, /\.back-to-top\s*\{[^}]*inline-size:\s*48px;[^}]*block-size:\s*48px/);
});
