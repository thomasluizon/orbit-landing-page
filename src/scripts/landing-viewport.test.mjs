import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const css = readFileSync("src/styles/landing.css", "utf8");
const code = readFileSync("src/scripts/scroll.ts", "utf8");

function unconditionalRules(source) {
  const rules = [];
  let depth = 0;
  let start = 0;
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] !== "}") continue;
    if (--depth !== 0) continue;
    const rule = source.slice(start, index + 1).trim();
    if (!rule.startsWith("@")) rules.push(rule);
    start = index + 1;
  }
  return rules.join("\n");
}

function stylesheetRules(source) {
  const parents = [];
  const rules = [];
  for (const [, text, boundary] of source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([^{}]*)([{}])/g)) {
    if (boundary === "{") {
      parents.push(text.trim());
      continue;
    }
    const selector = parents.pop();
    if (selector && !selector.startsWith("@")) {
      rules.push({ selector, declarations: text, conditions: [...parents] });
    }
  }
  return rules;
}

test("all four hero side items remain rendered from 768px wide and 720px tall", () => {
  const sideItem =
    /\.(?:hero-(?:products|side|float|phrase|left|right)|float-(?:today|week|reminder|insight)|phrase-(?:start|restart))(?![\w-])/;
  for (const rule of stylesheetRules(css)) {
    if (!sideItem.test(rule.selector) || !/display:\s*none\s*;/.test(rule.declarations)) continue;
    const bounds = rule.conditions.join(" ");
    const width = bounds.match(/\(width\s*<\s*(\d+)px\)/)?.[1];
    if (width && Number(width) <= 768) continue;
    const height = bounds.match(/\(height\s*<\s*(\d+)px\)/)?.[1];
    assert.ok(
      height && Number(height) <= 720,
      `${rule.selector} cannot disappear at 720px or above: ${bounds}`,
    );
  }
});

test("compositions fit through layout without scaling controls or their hit areas", () => {
  assert.doesNotMatch(css, /--composition-scale/);
  for (const rule of stylesheetRules(css)) {
    if (rule.selector.includes(".example-app")) {
      assert.doesNotMatch(rule.declarations, /(?:transform:\s*[^;]*scale|scale\s*:)/);
    }
  }
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.doesNotMatch(motion, /--composition-scale|\bscale\s*:|\.style\.transform/);
  const frame = unconditionalRules(css).match(/\.example-card\s*\{([^}]+)\}/)?.[1];
  assert.match(frame, /max-inline-size:\s*400px;/);
  assert.doesNotMatch(frame, /block-size:/);
});

test("composition surfaces never cap or scroll their content", () => {
  const surfaces = /\.(?:example-app|orbit-month-grid|metric-chart)\b/;
  for (const rule of stylesheetRules(css)) {
    if (!surfaces.test(rule.selector)) continue;
    assert.doesNotMatch(
      rule.declarations,
      /overflow(?:-[\w-]+)?:\s*[^;]*(?:auto|scroll)|overscroll-behavior[\w-]*\s*:|max-block-size\s*:/,
      rule.selector,
    );
  }
});

test("composition grids never impose a minimum column or row width", () => {
  for (const rule of stylesheetRules(css)) {
    if (/\.(?:orbit-month-grid|metric-bars|metric-dates)\b/.test(rule.selector)) {
      assert.doesNotMatch(rule.declarations, /min-inline-size\s*:|minmax\(44px,/);
    }
    if (rule.selector === ".example-app :where(button, a)") {
      assert.doesNotMatch(rule.declarations, /min-inline-size\s*:/);
    }
  }
});

test("composition grid targets fill adjoining cells and keep at least 44px of height", () => {
  for (const selector of [".example-app .orbit-date", ".example-app .metric-bar-track"]) {
    const rule = stylesheetRules(css).find((rule) => rule.selector === selector);
    assert.ok(rule, selector);
    assert.match(rule.declarations, /(?:^|;)\s*inline-size:\s*100%;/);
    assert.match(rule.declarations, /min-inline-size:\s*0;/);
    assert.match(rule.declarations, /min-block-size:\s*44px;/);
  }
  for (const selector of [".example-app .orbit-month-grid", ".metric-bars"]) {
    const rule = stylesheetRules(css).find((rule) => rule.selector === selector);
    assert.match(rule.declarations, /grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\);/);
    assert.match(rule.declarations, /(?:^|;)\s*gap:\s*0;/);
  }
  const standalone = stylesheetRules(css).find(
    (rule) =>
      rule.selector === ".example-app :where(button, a, input):not(.orbit-date, .metric-bar-track)",
  );
  assert.ok(standalone, "standalone minimum widths must exclude grid cells");
  assert.match(standalone.declarations, /min-inline-size:\s*44px;/);
  assert.match(standalone.declarations, /min-block-size:\s*44px;/);
});

function compositionFitHarness() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, require: () => ({ gsap: { registerPlugin() {} } }) },
  );
  return exports;
}

test("calendar week selection derives a smaller window from measured content height", () => {
  const { calendarWeekRange } = compositionFitHarness();
  assert.equal(typeof calendarWeekRange, "function");
  for (let selected = 0; selected < 6; selected++) {
    for (let weeks = 1; weeks <= 6; weeks++) {
      const [start, end] = calendarWeekRange(6, selected, 720, 456 + weeks * 44, 44);
      assert.equal(end - start, weeks);
      assert.ok(start >= 0 && end <= 6);
      assert.ok(start <= selected && end > selected, "the selected week always remains visible");
      if (weeks >= 3 && selected > 0 && selected < 5) {
        assert.ok(start <= selected - 1 && end > selected + 1);
      }
    }
  }
  assert.deepEqual(Array.from(calendarWeekRange(6, 3, 720, 576, 44)), [2, 4]);
  assert.deepEqual(Array.from(calendarWeekRange(6, 3, 720, 800, 44)), [0, 6]);
});

function measuredComposition({ height = 720, secondaryHeight = 80, calendar = true } = {}) {
  const item = (extra = {}) => ({
    folded: false,
    dataset: {},
    setAttribute(name) {
      assert.equal(name, "data-composition-folded");
      this.folded = true;
    },
    removeAttribute(name) {
      assert.equal(name, "data-composition-folded");
      this.folded = false;
    },
    ...extra,
  });
  const cells = calendar
    ? Array.from({ length: 42 }, (_, index) =>
        item({
          dataset: { calendarWeek: String(Math.floor(index / 7)) },
          getBoundingClientRect: () => ({ height: 44 }),
        }),
      )
    : [];
  const secondary = item();
  const grid = {
    querySelectorAll: () => cells,
    querySelector: () => cells[24],
  };
  const app = {
    querySelector: () => (calendar ? grid : null),
    querySelectorAll: (selector) =>
      selector === "[data-composition-folded]"
        ? [...cells, secondary].filter((cell) => cell.folded)
        : [secondary],
    getBoundingClientRect: () => ({
      height:
        height -
        cells.filter((cell) => cell.folded).length * (44 / 7) -
        (secondary.folded ? secondaryHeight : 0),
    }),
  };
  return { app, cells, secondary };
}

test("composition fitting selects complete weeks within the height budget at every width", () => {
  const { fitComposition } = compositionFitHarness();
  assert.equal(typeof fitComposition, "function");
  for (const width of [320, 390, 412, 767, 768, 1024, 1280, 1352, 1920]) {
    for (let height = 568; height <= 900; height++) {
      const composition = measuredComposition();
      fitComposition(composition.app, width, height);
      assert.ok(composition.app.getBoundingClientRect().height <= height * 0.8);
      assert.equal(composition.cells[24].folded, false);
      for (let index = 0; index < 42; index += 7) {
        assert.equal(
          new Set(composition.cells.slice(index, index + 7).map((c) => c.folded)).size,
          1,
        );
      }
      fitComposition(composition.app, width, 900);
      assert.ok(composition.cells.every((cell) => !cell.folded));
      assert.equal(composition.secondary.folded, false);
      assert.equal(composition.app.getBoundingClientRect().height, 720);
    }
  }
  const tall = measuredComposition({ height: 1000 });
  fitComposition(tall.app, 768, 720);
  assert.ok(tall.cells.some((cell) => cell.folded));
  fitComposition(tall.app, 768, 1400);
  assert.ok(tall.cells.every((cell) => !cell.folded));
  assert.equal(tall.secondary.folded, false);
});

test("composition fitting folds secondary content only after measuring an excess", () => {
  const { fitComposition } = compositionFitHarness();
  assert.equal(typeof fitComposition, "function");
  for (const calendar of [false, true]) {
    const composition = measuredComposition({ height: calendar ? 720 : 488, calendar });
    fitComposition(composition.app, 320, 568);
    assert.equal(composition.secondary.folded, true);
    assert.ok(composition.app.getBoundingClientRect().height <= 454);
    fitComposition(composition.app, 768, 720);
    assert.equal(composition.secondary.folded, false);
    assert.ok(composition.app.getBoundingClientRect().height <= 576);
    fitComposition(composition.app, 320, 568);
    assert.equal(composition.secondary.folded, true);
  }
});

test("measured composition fitting uses the same height budget on mobile and desktop", () => {
  const source = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.doesNotMatch(source, /viewportWidth\s*[<>]=?\s*[1-9]/);
  assert.match(source, /viewportHeight \* 0\.8/);
  assert.match(source, /fitComposition\(app, window\.innerWidth, window\.innerHeight\)/);
  assert.doesNotMatch(source, /--composition-|\.style\.|\bscale\s*:|maxBlockSize|80svh/);
  assert.match(css, /\.example-app \[data-composition-folded\]\s*\{\s*display:\s*none;/);
});

test("composition fitting follows font, size, locale and interaction changes in both motion preferences", async () => {
  for (const reduced of [false, true]) {
    const exports = {};
    const composition = measuredComposition();
    const listeners = new Map();
    const observed = [];
    let observeSize;
    let disconnected = false;
    let refreshes = 0;
    const window = {
      innerWidth: 320,
      innerHeight: 568,
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => {
        assert.equal(listeners.get(name), callback);
        listeners.delete(name);
      },
    };
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require: (name) => {
          if (name === "gsap")
            return {
              gsap: {
                registerPlugin() {},
                matchMedia: () => ({
                  add(query, callback) {
                    if (typeof query === "object") callback({ conditions: { pinned: true } });
                    else if (query === "all" || !reduced) callback();
                  },
                  revert() {},
                }),
              },
            };
          if (name === "gsap/ScrollTrigger")
            return { ScrollTrigger: { refresh: () => refreshes++ } };
          if (name === "lenis")
            return {
              default: class {
                on() {}
              },
            };
          return {};
        },
        document: {
          getElementById: () => null,
          querySelector: () => null,
          querySelectorAll: (selector) =>
            [".example-app", ".example-card"].includes(selector) ? [composition.app] : [],
          fonts: { ready: Promise.resolve() },
        },
        window,
        ResizeObserver: class {
          constructor(callback) {
            observeSize = callback;
          }
          observe(target) {
            observed.push(target);
          }
          disconnect() {
            disconnected = true;
          }
        },
      },
    );
    const dispose = exports.mountLandingMotion();
    assert.deepEqual(observed, [composition.app]);
    assert.ok(composition.app.getBoundingClientRect().height <= 454);
    window.innerWidth = 768;
    window.innerHeight = 720;
    await Promise.resolve();
    assert.ok(
      composition.cells.some((cell) => cell.folded),
      "font readiness also fits content",
    );
    for (const refresh of [
      observeSize,
      listeners.get("resize"),
      listeners.get("orbit:language-changed"),
      listeners.get("orbit:layout-changed"),
    ]) {
      window.innerWidth = 320;
      window.innerHeight = 568;
      refresh();
      assert.ok(composition.app.getBoundingClientRect().height <= 454);
      window.innerWidth = 768;
      window.innerHeight = 720;
      refresh();
      assert.ok(composition.app.getBoundingClientRect().height <= 576);
    }
    assert.equal(refreshes, 9);
    dispose();
    assert.equal(disconnected, true);
    assert.equal(listeners.size, 0);
  }
});

test("composition fitting changes only visibility and preserves the canvas visual primitives", () => {
  assert.equal((css.match(/\/\*/g) ?? []).length, 0);
  const folded = stylesheetRules(css).filter(
    (rule) => rule.selector === ".example-app [data-composition-folded]",
  );
  assert.equal(folded.length, 1);
  assert.equal(folded[0].declarations.trim(), "display: none;");
  const global = readFileSync("src/styles/global.css", "utf8");
  assert.deepEqual(
    [...global.matchAll(/--fs-[\w-]+:\s*(\d+)px;/g)].map(([, size]) => Number(size)),
    [12, 14, 16, 17, 20, 22, 28, 34, 44, 60],
  );
  assert.match(global, /--spacing:\s*4px;/);
  assert.match(css, /\.orbit-composition\s*\{[^}]*gap:\s*12px;/);
  assert.match(css, /\.product-block\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*16px;/);
  assert.match(css, /\.metric-bar\s*\{\s*background:\s*var\(--color-primary\);/);
});

test("Today fills its slide with a flexible zero-minimum habit column", () => {
  const base = unconditionalRules(css);
  assert.match(
    base,
    /\.phone-today-content\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;/,
  );
  assert.match(base, /\.phone-today-habits\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(
    base,
    /\.phone-today-habits\s*\{[^}]*grid-template-rows:\s*repeat\(5, minmax\(64px, 1fr\)\)/,
  );
});

test("phone text uses whole-word two-line ellipses without pushing out the habit check", () => {
  const base = unconditionalRules(css);
  const text = stylesheetRules(base).find((rule) =>
    rule.selector.includes(".phone-slide .habit-name,"),
  );
  assert.ok(text);
  for (const selector of [".proactive-line p", ".demo-habit .t-row", ".demo-request"]) {
    assert.ok(text.selector.includes(`.phone-slide ${selector}`));
  }
  for (const declaration of [
    "inline-size: 100%",
    "min-inline-size: 0",
    "display: -webkit-box",
    "-webkit-box-orient: vertical",
    "-webkit-line-clamp: 2",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "overflow-wrap: normal",
    "word-break: normal",
    "white-space: normal",
  ]) {
    assert.ok(text.declarations.includes(`${declaration};`), declaration);
  }
  assert.match(base, /\.phone-slide \.habit-copy\s*\{[^}]*flex:\s*1\s*;/);
});

test("phone screens share the app header and content top inset at every width", () => {
  const base = unconditionalRules(css);
  assert.match(
    base,
    /\.phone-app-header\s*\{[^}]*min-block-size:\s*56px;[^}]*padding-inline:\s*16px;/,
  );
  assert.match(base, /\.phone-content\s*\{[^}]*padding-block-start:\s*16px;/);
  assert.match(base, /\.phone-slide \.astra-demo\s*\{[^}]*gap:\s*0;[^}]*padding:\s*0;/);
  assert.match(base, /\.phone-today-content\s*\{[^}]*gap:\s*16px;/);
});

test("phone habit checks reserve only their visible square inside the full-row button", () => {
  const base = unconditionalRules(css);
  assert.match(base, /\.phone-slide \.habit-check\s*\{[^}]*inline-size:\s*28px/);
  assert.match(base, /\.habit-row\[data-habit-toggle\]\s*\{[^}]*min-block-size:\s*56px/);
  assert.match(base, /\.phone-slide \.habit-row\s*\{[^}]*min-block-size:\s*64px/);
  const row = readFileSync("src/components/HabitRow.astro", "utf8");
  assert.match(row, /<button[^>]*class="habit-row"[^>]*data-habit-toggle/);
  assert.match(row, /<span class="habit-check" aria-hidden="true"/);
});

function harness(reduced = false) {
  const frames = [];
  const listeners = new Map();
  const preference = { matches: reduced };
  const result = { imports: 0, mounts: 0, disposals: 0 };
  const floatResult = { imports: 0, mounts: 0, disposals: 0 };
  const imports = [];
  const stage = {};
  const modules = new Map(
    ["./landing-motion", "./hero-float"].map((name) => {
      let resolve;
      const loaded = new Promise((done) => {
        resolve = done;
      });
      return [name, { loaded, resolve }];
    }),
  );
  const window = {
    matchMedia: () => preference,
    requestAnimationFrame: (callback) => frames.push(callback),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: {},
    window,
    document: {
      getElementById(id) {
        assert.equal(id, "hero-stage");
        return stage;
      },
    },
    require(name) {
      imports.push(name);
      (name === "./hero-float" ? floatResult : result).imports++;
      assert.ok(modules.has(name), `unexpected startup import: ${name}`);
      return modules.get(name).loaded;
    },
  });
  return {
    result,
    floatResult,
    imports,
    preference,
    listeners,
    paint() {
      frames.shift()();
      frames.shift()();
    },
    async resolve(name = "./landing-motion") {
      const { loaded, resolve } = modules.get(name);
      resolve({
        mountLandingMotion() {
          result.mounts++;
          return () => result.disposals++;
        },
        mountHeroFloat(target) {
          assert.equal(target, stage);
          floatResult.mounts++;
          return () => floatResult.disposals++;
        },
      });
      await loaded;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("hero float loads once after paint without interaction, with page lifecycle cleanup", async () => {
  const h = harness();
  assert.equal(h.floatResult.imports, 0);
  h.paint();
  await h.resolve("./hero-float");
  assert.deepEqual(h.floatResult, { imports: 1, mounts: 1, disposals: 0 });
  h.listeners.get("pagehide")();
  assert.equal(h.floatResult.disposals, 1);
  await h.listeners.get("pageshow")({ persisted: true });
  await h.resolve("./hero-float");
  assert.equal(h.floatResult.mounts, 2);
});

test("eager startup and unscrolled page restoration never import landing-motion", async () => {
  const h = harness();
  h.paint();
  await h.resolve("./hero-float");
  assert.deepEqual(h.imports, ["./hero-float"]);
  h.listeners.get("pagehide")();
  await h.listeners.get("pageshow")({ persisted: true });
  await h.resolve("./hero-float");
  assert.ok(h.imports.every((name) => name === "./hero-float"));
  assert.equal(h.result.mounts, 0);
});

for (const interaction of ["scroll", "wheel", "touchstart", "keydown"]) {
  test(`landing motion loads once on ${interaction} and restores after pagehide`, async () => {
    const h = harness();
    h.paint();
    await h.resolve("./hero-float");
    assert.equal(h.result.imports, 0);
    const pending = h.listeners.get(interaction)();
    h.listeners.get("scroll")();
    h.listeners.get("wheel")();
    await h.resolve();
    await pending;
    assert.deepEqual(h.result, { imports: 1, mounts: 1, disposals: 0 });
    assert.equal(h.floatResult.mounts, 1, "interaction must not mount the float again");
    h.listeners.get("pagehide")();
    assert.equal(h.result.disposals, 1);
    await h.listeners.get("pageshow")({ persisted: true });
    await h.resolve();
    assert.equal(h.result.mounts, 2);
  });
}

test("reduced motion still loads the pinned screen driver after interaction", async () => {
  const h = harness(true);
  h.paint();
  const pending = h.listeners.get("scroll")();
  await h.resolve();
  await pending;
  assert.deepEqual(h.result, { imports: 1, mounts: 1, disposals: 0 });
});

for (const name of ["./hero-float", "./landing-motion"]) {
  test(`a page left during ${name} import cannot mount motion`, async () => {
    const h = harness();
    h.paint();
    const pending = h.listeners.get("scroll")();
    h.listeners.get("pagehide")();
    await h.resolve(name);
    await h.resolve();
    await pending;
    assert.equal(h.result.mounts, 0);
    assert.equal(h.floatResult.mounts, 0);
  });

  test(`restoring a page during ${name} import mounts it only once`, async () => {
    const h = harness();
    h.paint();
    h.listeners.get("scroll")();
    h.listeners.get("pagehide")();
    h.listeners.get("pageshow")({ persisted: true });
    await h.resolve(name);
    const mounted = name === "./hero-float" ? h.floatResult : h.result;
    assert.equal(mounted.mounts, 1);
  });
}

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

test("the seven metric bar columns share their row at narrow widths", () => {
  const rows = [...css.matchAll(/\.metric-bars(?:\[[^\]]+\])?\s*\{([^}]+)\}/g)];
  assert.ok(rows.length);
  for (const [, declarations] of rows) {
    if (/grid-template-columns:/.test(declarations)) {
      assert.match(
        declarations,
        /grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/,
        "every metric column override must retain seven shrinkable columns",
      );
    }
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
    /padding-inline:\s*8px/,
    "the visible bars keep content clearance inside the full-column targets",
  );
  const button = css.match(/^button\.metric-bar-track\s*\{([^}]+)\}/m)[1];
  assert.doesNotMatch(
    button,
    /padding(?:-inline)?:\s*0(?:\s|;)/,
    "the button keeps the track's inline inset",
  );
  assert.match(css, /button\.metric-bar-track:focus-visible\s*\{[^}]*outline-offset:\s*-2px/);
});

test("feature cards retain card padding and inset their interactive content from fills and focus rings", () => {
  for (const [, declarations] of css.matchAll(
    /(?:^|\n)[^{}]*\.(?:product-block|orbit-wrapped)\s*\{([^}]+)\}/g,
  )) {
    if (/padding:/.test(declarations)) assert.match(declarations, /padding:\s*16px/);
  }
  assert.match(
    css,
    /\.example-app \.habit-row\[data-habit-toggle\]\s*\{[^}]*padding:\s*8px 12px;[^}]*min-block-size:\s*48px/,
  );
  assert.match(
    css,
    /\.example-app \.orbit-date\s*\{[^}]*min-inline-size:\s*0;[^}]*padding:\s*4px 8px/,
  );
  assert.match(css, /\.metric-bar-track\s*\{[^}]*padding-inline:\s*8px;[^}]*padding-block:\s*8px/);
  assert.match(css, /\.example-app \.orbit-date:focus-visible\s*\{[^}]*outline-offset:\s*-2px/);
  assert.match(
    css,
    /\.example-app :where\(button, a\):is\(:active, :focus-visible\)\s*\{[^}]*background:\s*var\(--color-bg-hover\)/,
  );
  assert.match(
    css,
    /\.example-app :where\(button, a\):hover\s*\{[^}]*background:\s*var\(--color-bg-hover\)/,
  );
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
    /\.demo-preview-actions \.pill-sm\s*\{[^}]*border-radius:\s*var\(--radius-full\)/,
  );
});

test("the phone derives its width from the pinned height at its real device ratio", () => {
  assert.match(css, /aspect-ratio:\s*9 \/ 19\.5/);
  const widths = stylesheetRules(css).filter((rule) =>
    /--hero-device-width:/.test(rule.declarations),
  );
  assert.equal(widths.length, 2);
  for (const { declarations } of widths) {
    assert.match(
      declarations,
      /--hero-device-width:\s*max\(\s*var\(--hero-device-min-width\),\s*min\(\s*390px,/,
    );
    assert.match(declarations, /calc\(\(100svh - var\(--hero-pin-top\) - 64px\) \* 9 \/ 19\.5\)/);
    assert.match(declarations, /calc\(100vw - 64px\)/);
  }
  assert.match(widths[0].declarations, /calc\(\(100vw - 48px\) \/ 3\)/);
  for (const { declarations } of stylesheetRules(css).filter(
    (rule) => rule.selector === ".hero-device",
  ))
    assert.doesNotMatch(declarations, /max-block-size:/, "height must follow the device ratio");
  for (const [width, height] of [
    [305, 568],
    [320, 568],
    [360, 740],
    [375, 667],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1352, 762],
    [1440, 900],
    [1920, 1080],
  ]) {
    const top = width <= 640 ? 96 : 112;
    const deviceWidth = Math.min(
      390,
      ((height - top - 64) * 9) / 19.5,
      width - 64,
      width < 768 ? Infinity : (width - 48) / 3,
    );
    const deviceHeight = (deviceWidth * 19.5) / 9;
    const scale = (deviceWidth - 2 * 4) / 390;
    assert.ok(scale > 0 && scale <= 1);
    assert.ok(845 * scale <= deviceHeight - 2 * 4, "the full logical screen fits inside the bezel");
    assert.ok(
      273 * scale <= (390 - 2 * 16 - 2 * 24) * scale,
      "the full action row fits the inset card",
    );
    assert.ok(Math.abs(deviceHeight / deviceWidth - 19.5 / 9) < 1e-12);
    assert.ok(top - (width <= 640 ? 80 : 96) >= 8, "clearance below the fixed header");
    assert.ok(
      top + deviceHeight + 60 <= height - 4,
      `${width}x${height} reserves bottom clearance`,
    );
  }
});

test("mobile removes the floating cards and keeps both screens inside the phone", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  assert.equal((hero.match(/data-phone-slide=/g) ?? []).length, 2);
  assert.match(css, /@media \(width < 768px\)[\s\S]*?\.hero-products\s*\{\s*display:\s*none/);
  assert.match(css, /\.carousel-segment\s*\{[^}]*inline-size:\s*36px;[^}]*block-size:\s*4px/);
  assert.doesNotMatch(readFileSync("src/components/AstraDemo.astro", "utf8"), /demo-playback/);
  assert.doesNotMatch(hero, /id="hero-playback"/);
});

test("pinning and staggered feature motion use verified APIs and expose their static end state", () => {
  const source = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.equal(
    (source.match(/media\.add\(/g) ?? []).length - 1,
    (source.match(/prefers-reduced-motion: no-preference/g) ?? []).length,
  );
  assert.match(source, /pin:\s*true/);
  assert.match(source, /bottom[^}]*\+ 16/);
  assert.match(source, /end:\s*"\+=560"/);
  assert.match(css, /\.hero-pin-range\s*\{\s*padding-block-end:\s*560px/s);
  assert.match(source, /\[data-composition-card\]/);
  assert.doesNotMatch(source, /\bscale\s*:/);
  assert.match(source, /stagger: 0\.12/);
  assert.match(source, /scrub: true/);
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

test("proposal action options stay in one trailing row with a fixed 12px gap", () => {
  const rows = [...css.matchAll(/^\.demo-preview-actions\s*\{([^}]+)\}/gm)];
  assert.ok(rows.length);
  for (const [, declarations] of rows) {
    assert.match(declarations, /flex-wrap:\s*nowrap\s*;/);
    assert.match(declarations, /gap:\s*12px\s*;/);
    assert.match(declarations, /justify-content:\s*flex-end\s*;/);
  }
  assert.match(css, /\.demo-preview-actions \.pill-sm\s*\{[^}]*flex-shrink:\s*0/);
});

test("phone content has no vertical scroller or viewport-dependent thread cap", () => {
  for (const rule of stylesheetRules(css)) {
    if (!/\.(?:phone|demo)-/.test(rule.selector)) continue;
    assert.doesNotMatch(rule.declarations, /overflow-y:\s*(?:auto|scroll)|max-block-size:/);
  }
  assert.doesNotMatch(readFileSync("src/components/Hero.astro", "utf8"), /data-lenis-prevent/);
  assert.doesNotMatch(
    readFileSync("src/scripts/landing-motion.ts", "utf8"),
    /closest\("\.phone-carousel/,
  );
  assert.doesNotMatch(
    readFileSync("src/scripts/demo.ts", "utf8"),
    /scrollIntoView|scrollTop = thread.scrollHeight/,
  );
});

test("chat chips and composer occupy separate rows with their full targets in vertical flow", async () => {
  const { parse } = await import("@astrojs/compiler");
  const { ast } = await parse(readFileSync("src/components/AstraDemo.astro", "utf8"));
  const find = (node, className) => {
    if (node.attributes?.some(({ name, value }) => name === "class" && value === className)) {
      return node;
    }
    return node.children?.map((child) => find(child, className)).find(Boolean);
  };
  const area = find(ast, "demo-input-area");
  assert.deepEqual(
    area.children
      .filter((node) => node.name)
      .map((node) => node.attributes.find(({ name }) => name === "class").value),
    ["demo-examples", "demo-composer"],
  );
  const base = unconditionalRules(css);
  assert.match(
    base,
    /\.demo-input-area\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*max-content max-content;/,
  );
  assert.match(base, /\.demo-chip\s*\{[^}]*min-block-size:\s*48px;/);
  assert.match(base, /\.demo-examples\s*\{[^}]*padding-block:\s*0;[^}]*margin-block:\s*0;/);
  for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (!/\.demo-(?:input-area|examples|composer|chip)(?![\w:-])/.test(selectors)) continue;
    if (selectors.includes("::before")) {
      assert.doesNotMatch(
        declarations,
        /(?:padding|margin|(?:min-)?(?:inline|block)-size|transform|translate|grid-row|grid-area):/,
        selectors,
      );
      continue;
    }
    assert.doesNotMatch(declarations, /position:\s*(?:absolute|fixed)/, selectors);
    assert.doesNotMatch(declarations, /(?:margin|inset)[\w-]*:[^;]*-\d/, selectors);
    assert.doesNotMatch(declarations, /(?:transform|translate|grid-row|grid-area):/, selectors);
  }
  assert.doesNotMatch(css, /^\.demo-chip::before/gm, "reach expansion is scoped to the phone");
  assert.match(css, /\.demo-preview\s*\{[^}]*padding:\s*24px;/);
});

test("side-card float budget preserves 24px clearance for every phase and entrance offset", () => {
  const declarations = (selector) =>
    [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
      .filter(([, selectors]) => selectors.trim() === selector)
      .map(([, , body]) => body)
      .join("\n");
  const stage = declarations(".hero-stage");
  const side = declarations(".hero-side");
  const reserve = Number(stage.match(/--hero-float-reserve:\s*(\d+)px;/)?.[1]);
  const entry = Number(stage.match(/--hero-float-entry:\s*(\d+)px;/)?.[1]);
  const amplitude = Number(
    readFileSync("src/scripts/hero-float.ts", "utf8").match(/const amplitude = (\d+);/)?.[1],
  );
  assert.ok(reserve >= amplitude, "each card's motion envelope must reserve its full amplitude");
  assert.ok(amplitude >= 12 && amplitude <= 17);
  assert.match(side, /padding-inline:\s*var\(--hero-float-reserve\);/);
  assert.match(
    side,
    /gap:\s*calc\(24px \+ 2 \* var\(--hero-float-reserve\) \+ var\(--hero-float-entry\)\);/,
  );
  assert.doesNotMatch(side, /gap:\s*\d+px;/, "short viewports retain the motion reserve");
  assert.match(stage, /gap:\s*16px 24px;/);
  assert.match(
    stage,
    /inline-size:\s*min\(calc\(var\(--landing-narrow\) - 48px\), calc\(100% - 96px\)\);/,
  );
  const motion = readFileSync("src/scripts/landing-motion.ts", "utf8");
  assert.equal(Number(motion.match(/\{ y: (\d+), opacity: 0 \}/)?.[1]), entry);
  assert.match(
    css,
    /@media \(height < 720px\)\s*\{\s*\.float-reminder,\s*\.float-week\s*\{\s*display:\s*none;/,
  );
  assert.match(css, /\.hero-side \.habit-name\s*\{[^}]*font-size:\s*var\(--fs-xs\);/);
  for (let width = 768; width <= 1920; width++) {
    const stageWidth = Math.min(896 - 48, width - 96);
    const phoneWidth = Math.min(390, (width - 48) / 3);
    const columnWidth = (stageWidth - phoneWidth - 48) / 2;
    assert.ok(columnWidth - 2 * reserve >= 112, `compact cards fit at ${width}px`);
    const outerInset = (width - stageWidth) / 2 + reserve;
    for (const offset of [-amplitude, amplitude]) {
      assert.ok(24 + reserve - offset >= 24, `phone clearance at ${width}px`);
      assert.ok(outerInset + offset >= 24, `viewport clearance at ${width}px`);
      for (const neighbourOffset of [-amplitude, amplitude]) {
        for (const entranceDifference of [-entry, entry]) {
          assert.ok(
            24 + 2 * reserve + entry + neighbourOffset - offset + entranceDifference >= 24,
            `sibling clearance at ${width}px; shared column parallax cancels`,
          );
        }
      }
    }
  }
});

test("pager focus-visible follows the pill segment and its 44px target stays invisible", () => {
  const segment = css.match(/\.carousel-segment\s*\{([^}]+)\}/)?.[1];
  assert.match(segment, /inline-size:\s*36px\s*;/);
  assert.match(segment, /block-size:\s*4px\s*;/);
  assert.match(segment, /border-radius:\s*var\(--radius-full\)/);
  assert.match(
    css,
    /\.carousel-segment::before\s*\{[^}]*inset-block:\s*-20px;[^}]*inset-inline:\s*-4px/,
  );
  assert.match(
    css,
    /\.carousel-segment:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-primary\);[^}]*outline-offset:\s*2px/,
  );
  assert.doesNotMatch(css, /\.carousel-segment:focus(?!-visible)/);
});

test("habit names preserve word boundaries across every surface", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([, selectors]) =>
    /\.habit-name\b/.test(selectors),
  );
  assert.ok(rules.length);
  for (const [, selectors, declarations] of rules) {
    assert.doesNotMatch(declarations, /word-break:\s*break-all/, selectors);
    for (const [, value] of declarations.matchAll(/overflow-wrap:\s*([^;]+);/g)) {
      assert.equal(value, "normal", selectors);
    }
  }
});
