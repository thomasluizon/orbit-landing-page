import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";
import ts from "typescript";
import vm from "node:vm";

const source = (name) => readFileSync(`src/components/${name}.astro`, "utf8");
const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const hero = (await parse(source("Hero"))).ast;
const css = readFileSync("src/styles/landing.css", "utf8");
const normalizeSelector = (value) => value.replace(/\s+/g, " ").trim();
const rules = (selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(
      ([, selectors]) =>
        normalizeSelector(selectors) === selector ||
        selectors.split(",").some((s) => normalizeSelector(s) === selector),
    )
    .map(([, , declarations]) => declarations);
const slides = descendants(hero).filter((node) => attributes(node)["data-phone-slide"]);

test("every phone screen shares the status, 56px app header and 16px content inset", async () => {
  const device = descendants(hero).find((node) => attributes(node).class === "phone-screen");
  assert.ok(device, "the whole app shares one scaled screen");
  assert.deepEqual(
    device.children
      .filter((node) => node.name)
      .slice(0, 2)
      .map((node) => attributes(node).class),
    ["device-status", "phone-carousel"],
  );
  assert.ok(existsSync("src/components/PhoneHeader.astro"), "one header owns phone spacing");
  assert.match(source("PhoneHeader"), /<header class="phone-app-header">/);
  const header = rules(".phone-app-header");
  assert.equal(header.length, 1, "no width-specific header spacing");
  assert.match(header[0], /min-block-size:\s*56px;/);
  assert.match(header[0], /flex-shrink:\s*0;/);
  assert.match(header[0], /align-items:\s*center;/);
  assert.match(header[0], /gap:\s*12px;/);
  assert.match(header[0], /padding-inline:\s*16px;/);
  assert.match(rules(".phone-content").join("\n"), /padding-block-start:\s*16px;/);
  for (const slide of slides) {
    let children = slide.children.filter((node) => node.name);
    if (children[0]?.name === "AstraDemo") {
      const ast = (await parse(source("AstraDemo"))).ast;
      children = descendants(ast)
        .find((node) => attributes(node).id === "astra-demo")
        .children.filter((node) => node.name);
    }
    assert.equal(children[0]?.name, "PhoneHeader", attributes(slide)["data-phone-slide"]);
    assert.ok(attributes(children[1]).class?.split(" ").includes("phone-content"));
  }
  assert.match(source("AstraDemo"), /<PhoneHeader>\s*<AstraGlyph size=\{16\} \/>\s*<h2/);
});

test("one vector layout draws the whole phone at 390 by 845 logical pixels", () => {
  const screen = descendants(hero).find((node) => attributes(node).class === "device-screen");
  assert.deepEqual(
    screen.children.filter((node) => node.name).map((node) => attributes(node).class),
    ["phone-screen"],
  );
  const layout = rules(".phone-screen");
  assert.equal(layout.length, 1);
  assert.match(layout[0], /inline-size:\s*390px;/);
  assert.match(layout[0], /block-size:\s*845px;/);
  assert.match(layout[0], /transform:\s*scale\(var\(--phone-scale\)\);/);
  assert.match(layout[0], /transform-origin:\s*top left;/);
  assert.equal((css.match(/transform:\s*scale\(var\(--phone-scale\)\)/g) ?? []).length, 1);
  assert.match(source("Hero"), /import "\.\.\/scripts\/phone-screen"/);
});

test("screen fitting follows fractional inner width and caps its scale at one", () => {
  assert.ok(existsSync("src/scripts/phone-screen.ts"));
  for (const width of [180.3076923077, 259.6923076923, 243.0769230769, 262.4615384615, 322, 400]) {
    let resized;
    const properties = new Map();
    const screen = {
      style: { setProperty: (name, value) => properties.set(name, value) },
      querySelector: () => ({ offsetWidth: 390 }),
      getBoundingClientRect: () => ({ width }),
    };
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/phone-screen.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports: {},
        document: { querySelector: () => screen },
        ResizeObserver: class {
          constructor(fn) {
            resized = fn;
          }
          observe(target) {
            assert.equal(target, screen);
          }
        },
      },
    );
    assert.equal(Number(properties.get("--phone-scale")), Math.min(1, width / 390));
    resized([{ contentRect: { width: 200.5 } }]);
    assert.equal(Number(properties.get("--phone-scale")), 200.5 / 390);
    resized([{ contentRect: { width: 0 } }]);
    assert.equal(Number(properties.get("--phone-scale")), 200.5 / 390);
  }
});

const reachSelector =
  ".phone-screen :is(button, a, .demo-composer-field, .demo-edit-field)::before";
const declarations = (body) =>
  Object.fromEntries(
    [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value]),
  );
const screenProperties = declarations(rules(".phone-screen")[0]);
const viewports = [
  [320, 568],
  [360, 740],
  [768, 720],
  [1280, 720],
  [1352, 900],
  [1440, 900],
  [1920, 1080],
];
const scales = viewports.map(([width, height]) => {
  const top = width <= 640 ? 96 : 112;
  const device = Math.min(
    390,
    ((height - top - 64) * 9) / 19.5,
    width - 64,
    width < 768 ? Infinity : (width - 48) / 3,
  );
  return (device - 8) / 390;
});

function reach(width, height, scale, selectors = []) {
  const properties = { ...screenProperties, "--phone-scale": String(scale) };
  const insets = {};
  for (const selector of [reachSelector, ...selectors]) {
    for (const [name, value] of Object.entries(declarations(rules(selector).join("\n")))) {
      if (name.startsWith("--")) properties[name] = value;
      if (name === "inset-block" || name === "inset-inline") {
        insets[`${name}-start`] = value;
        insets[`${name}-end`] = value;
      } else if (name.startsWith("inset-")) insets[name] = value;
    }
  }
  const resolve = (value) =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      assert.ok(properties[name], `defined reach property ${name}`);
      return `(${resolve(properties[name])})`;
    });
  const evaluate = (value, size) => {
    const expression = resolve(value)
      .replace(/\bcalc\(/g, "(")
      .replace(/\b(min|max)\(/g, "Math.$1(")
      .replace(/([\d.]+)%/g, (_, percent) => String((Number(percent) * size) / 100))
      .replace(/px\b/g, "");
    const result = vm.runInNewContext(expression);
    assert.ok(Number.isFinite(result), expression);
    return result;
  };
  const result = {};
  for (const axis of ["inline", "block"]) {
    const size = axis === "inline" ? width : height;
    for (const edge of ["start", "end"])
      result[`${axis}-${edge}`] = evaluate(insets[`inset-${axis}-${edge}`] ?? "0", size) * scale;
    result[axis] = size * scale - result[`${axis}-start`] - result[`${axis}-end`];
    assert.ok(result[axis] >= 24 - 1e-8, `${axis} reach ${result[axis]} has a 24px floor`);
  }
  return result;
}

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);
const expansion = (size, scale, limit = Infinity) =>
  Math.max(
    Math.max(0, (24 - size * scale) / 2),
    Math.min(Math.max(0, (44 - size * scale) / 2), limit * scale),
  );

test("scaled controls derive invisible 44px reaches and a 24px floor without changing artwork", () => {
  assert.doesNotMatch(css, /--phone-target-size/);
  assert.match(
    rules(".phone-screen")[0],
    /--phone-reach-size:\s*calc\(44px \/ var\(--phone-scale\)\);/,
  );
  assert.match(
    rules(".phone-screen")[0],
    /--phone-reach-floor:\s*calc\(24px \/ var\(--phone-scale\)\);/,
  );
  for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/var\(--phone-reach-(?:size|floor|inset|floor-inset)\)/.test(declarations)) {
      assert.ok(selectors.includes("::before"));
      assert.doesNotMatch(declarations, /(?:padding|min-(?:inline|block)-size):/);
    }
  }
  assert.match(source("AstraDemo"), /<label class="demo-composer-field" for="demo-input">/);
  assert.match(
    source("AstraDemo"),
    /<label class="demo-edit-field" for="demo-edit-(?:name|schedule)">/,
  );
});

for (const [name, tag] of [
  ["demo-input", "input"],
  ["demo-edit-name", "input"],
  ["demo-edit-schedule", "select"],
]) {
  test(`${name} receives native pointer events above its label reach`, async () => {
    const nodes = descendants((await parse(source("AstraDemo"))).ast);
    const field = nodes.find((node) => attributes(node).id === name);
    assert.equal(field.name, tag);
    const label = nodes.find((node) => node.name === "label" && node.children?.includes(field));
    assert.ok(label);
    assert.equal(attributes(label).for, name);
    const native = declarations(
      rules(".phone-screen :is(.demo-composer-field, .demo-edit-field) :is(input, select)").join(
        "\n",
      ),
    );
    const wrapper = declarations(
      rules(".phone-screen :is(.demo-composer-field, .demo-edit-field)").join("\n"),
    );
    const pseudo = declarations(
      rules(".phone-screen :is(.demo-composer-field, .demo-edit-field)::before").join("\n"),
    );
    assert.equal(native.position, "relative");
    assert.equal(wrapper.isolation, "isolate");
    assert.ok(Number(native["z-index"]) > Number(pseudo["z-index"]));
    assert.doesNotMatch([native["pointer-events"], pseudo["pointer-events"]].join(" "), /none/);
  });
}

for (const [locale, widths] of Object.entries({
  en: [78.112, 61.354, 90.46],
  pt: [86.974, 74.612, 87.45],
})) {
  for (let pair = 0; pair < 2; pair++) {
    test(`${locale} proposal pair ${pair + 1} keeps 44px height and limits only shared inline edges`, () => {
      for (const scale of scales) {
        const targets = widths.map((width, index) =>
          reach(width, 44, scale, [
            ".phone-screen .demo-preview-actions > button::before",
            ...(index > 0
              ? [".phone-screen .demo-preview-actions > :not(:first-child)::before"]
              : []),
            ...(index < 2
              ? [".phone-screen .demo-preview-actions > :not(:last-child)::before"]
              : []),
          ]),
        );
        for (const index of [pair, pair + 1]) {
          const target = targets[index];
          near(target.block, Math.max(44, 44 * scale), "proposal block reach");
          near(
            -target["inline-start"],
            expansion(widths[index], scale, index > 0 ? 6 : Infinity),
            "inline start uses half the 12px gap",
          );
          near(
            -target["inline-end"],
            expansion(widths[index], scale, index < 2 ? 6 : Infinity),
            "inline end uses half the 12px gap",
          );
          assert.ok(-target["block-start"] <= 24 * scale + 1e-8, "reach clears the proposed habit");
        }
        assert.ok(
          -targets[pair]["inline-end"] - targets[pair + 1]["inline-start"] <= 12 * scale + 1e-8,
        );
      }
    });
  }
}

for (const [locale, widths] of Object.entries({ en: [112, 110, 96], pt: [92, 110, 128] })) {
  for (let pair = 0; pair < 2; pair++) {
    test(`${locale} chip pair ${pair + 1} limits shared edges to half the 8px gap`, () => {
      for (const scale of scales) {
        const targets = widths.map((width, index) =>
          reach(width, 48, scale, [
            ".phone-screen .demo-chip::before",
            ...(index > 0 ? [".phone-screen .demo-examples > :not(:first-child)::before"] : []),
            ...(index < 2 ? [".phone-screen .demo-examples > :not(:last-child)::before"] : []),
          ]),
        );
        for (const index of [pair, pair + 1]) {
          near(
            -targets[index]["inline-start"],
            expansion(widths[index], scale, index > 0 ? 4 : Infinity),
            "chip start reach",
          );
          near(
            -targets[index]["inline-end"],
            expansion(widths[index], scale, index < 2 ? 4 : Infinity),
            "chip end reach",
          );
          near(-targets[index]["block-start"], expansion(48, scale, 16), "chip clears thread");
          near(-targets[index]["block-end"], expansion(48, scale, 8), "chip clears composer");
        }
        assert.ok(
          -targets[pair]["inline-end"] - targets[pair + 1]["inline-start"] <= 8 * scale + 1e-8,
        );
      }
    });
  }
}

test("composer field and Send reaches stay distinct, inside the composer width and above the home area", () => {
  assert.match(rules(".phone-screen .demo-send::before").join("\n"), /inset-inline-start:\s*0;/);
  for (const scale of scales) {
    const shared = ".phone-screen :is(.demo-composer-field, .demo-send)::before";
    const field = reach(306, 48, scale, [shared, ".phone-screen .demo-composer-field::before"]);
    const send = reach(48, 48, scale, [shared, ".phone-screen .demo-send::before"]);
    near(field["inline-end"], 0, "field stops at Send");
    near(send["inline-start"], 0, "Send starts at its visible circle");
    near(
      send.inline,
      Math.max(48 * scale, 24, Math.min(44, 52 * scale)),
      "Send uses available composer width",
    );
    assert.ok(-send["inline-end"] <= 4 * scale + 1e-8, "Send stays in the composer");
    const chip = reach(96, 48, scale, [".phone-screen .demo-chip::before"]);
    for (const [target, start, end] of [
      [field, 8, 20],
      [send, 4, 4],
    ]) {
      near(-target["block-start"], expansion(48, scale, start), "composer start reach");
      near(-target["block-end"], expansion(48, scale, end), "composer end reach");
      assert.ok(
        -chip["block-end"] - target["block-start"] <= 16 * scale + 1e-8,
        "chips and composer split their 16px face gap",
      );
      assert.ok(
        -target["block-end"] <= 20 * scale + 1e-8,
        "4px composer padding plus 16px area padding contain reach",
      );
    }
    for (const edge of ["block-start", "block-end"])
      assert.ok(-send[edge] <= 4 * scale + 1e-8, "Send stays within composer padding");
  }
  assert.match(rules(".demo-examples").join("\n"), /overflow:\s*visible;/);
  assert.match(rules(".phone-screen").join("\n"), /padding-block-end:\s*34px;/);
  assert.match(rules(".device-home").join("\n"), /inset-block-end:\s*15px;/);
});

for (let pair = 0; pair < 2; pair++) {
  test(`editor pair ${pair + 1} splits the 8px row gap without swallowing native faces or labels`, () => {
    for (const scale of scales) {
      const targets = [
        reach(218, 48, scale, [
          ".phone-screen .demo-edit-field::before",
          ".phone-screen .demo-edit-field:has(input)::before",
        ]),
        reach(218, 48, scale, [".phone-screen .demo-edit-field::before"]),
        reach(310, 48, scale, [".phone-screen .demo-save::before"]),
      ];
      for (const index of [pair, pair + 1]) {
        near(
          -targets[index]["block-start"],
          expansion(48, scale, index === 0 ? Infinity : 4),
          "editor start reach",
        );
        near(
          -targets[index]["block-end"],
          expansion(48, scale, index === 2 ? Infinity : 4),
          "editor end reach",
        );
        assert.ok(
          -targets[index]["inline-start"] <= 12 * scale + 1e-8,
          "reach clears the visible field label",
        );
      }
      assert.ok(-targets[pair]["block-end"] - targets[pair + 1]["block-start"] <= 8 * scale + 1e-8);
    }
    assert.match(rules(".demo-edit-form").join("\n"), /gap:\s*8px 12px;/);
  });
}

test("Today rows and the continuation keep bounded reaches clear of neighbours and the home area", () => {
  for (const scale of scales) {
    for (const [container, gap] of [
      [".phone-today-habits", 12],
      [".demo-today", 16],
    ]) {
      const selector = `.phone-screen ${container} > .habit-row`;
      const targets = [0, 1, 2].map((index) =>
        reach(358, 64, scale, [
          `${selector}::before`,
          ...(index === 0 ? [`${selector}:nth-child(1 of .habit-row:not([hidden]))::before`] : []),
          ...(index === 2
            ? [`${selector}:nth-last-child(1 of .habit-row:not([hidden]))::before`]
            : []),
        ]),
      );
      for (let pair = 0; pair < 2; pair++) {
        near(-targets[pair]["block-end"], expansion(64, scale, gap / 2), "habit end reach");
        near(-targets[pair + 1]["block-start"], expansion(64, scale, gap / 2), "habit start reach");
        assert.ok(
          -targets[pair]["block-end"] - targets[pair + 1]["block-start"] <= gap * scale + 1e-8,
        );
      }
      near(-targets[0]["block-start"], expansion(64, scale, 16), "first visible habit reach");
      near(-targets[2]["block-end"], expansion(64, scale, 16), "last visible habit reach");
      assert.ok(
        -targets[2]["block-end"] <= 16 * scale + 1e-8,
        "last visible habit stays above safe area",
      );
    }
    const link = reach(200, 48, scale, [".phone-screen .demo-continue .text-link::before"]);
    near(-link["block-start"], expansion(48, scale, 8), "link clears continuation text");
    near(-link["block-end"], expansion(48, scale, 16), "link stays in thread padding");
  }
});

test("proposal actions retain the app small pill geometry and separated targets", () => {
  const pills = rules(".demo-preview-actions .pill-sm");
  assert.ok(pills.length);
  assert.match(pills[0], /block-size:\s*44px;/);
  assert.match(pills[0], /border-radius:\s*var\(--radius-full\);/);
  assert.match(pills[0], /padding-inline:\s*18px;/);
  assert.match(pills[0], /flex-shrink:\s*0;/);
  for (const rule of pills) {
    for (const [, size] of rule.matchAll(/font-size:\s*([^;]+);/g))
      assert.equal(size.trim(), "var(--fs-sm)");
    assert.doesNotMatch(rule, /(?:scale|transform|overflow):/);
  }
  const shared = readFileSync("src/styles/global.css", "utf8");
  assert.match(shared, /\.pill-sm::before\s*\{[^}]*inset-block:\s*-4px;/);
  assert.match(shared, /inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  for (const row of rules(".demo-preview-actions")) {
    assert.match(row, /flex-wrap:\s*nowrap;/);
    assert.match(row, /gap:\s*12px;/);
    assert.match(row, /justify-content:\s*flex-end;/);
  }
  const actions = source("AstraDemo").match(
    /<div class="demo-preview-actions">([\s\S]*?)<\/div>/,
  )[1];
  assert.deepEqual(
    [...actions.matchAll(/id="demo-([^"]+)"/g)].map(([, id]) => id),
    ["reject", "edit", "approve"],
  );
  assert.deepEqual(
    [...actions.matchAll(/variant="([^"]+)"/g)].map(([, variant]) => variant),
    ["ghost", "ghost", "primary"],
  );
});

test("the proposal shares the thread's single 16px content edge", () => {
  assert.match(rules(".demo-thread").join("\n"), /padding:\s*16px;/);
  for (const selector of [".phone-slide .demo-request", ".phone-slide .demo-response > .t-body"])
    assert.doesNotMatch(rules(selector).join("\n"), /margin-inline(?:-end)?:/);
  assert.match(rules(".demo-preview").join("\n"), /padding:\s*24px;/);
  const logicalWidth = Number(rules(".phone-screen")[0]?.match(/inline-size:\s*(\d+)px;/)?.[1]);
  assert.equal(logicalWidth - 2 * 16, 358);
  const actionWidth = logicalWidth - 2 * 16 - 2 * 24;
  assert.equal(actionWidth, 310);
  assert.ok(actionWidth >= 273, "the Portuguese small pills fit with both 12px gaps");
});

test("phone spacing keeps only the declarations that render", () => {
  for (const [selector, property, expected] of [
    [".device-status", "min-block-size", "54px"],
    [".demo-exchange", "margin-block-start", "0"],
    [".demo-composer", "padding", "4px"],
  ]) {
    const declarations = rules(selector).join("\n");
    const values = [
      ...declarations.matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`, "g")),
    ];
    assert.deepEqual(
      values.map(([, value]) => value),
      [expected],
    );
    if (property === "padding") assert.doesNotMatch(declarations, /padding-(?:inline|block):/);
  }
});

test("the phone and its pager contain exactly chat and Today", () => {
  assert.deepEqual(
    slides.map((node) => attributes(node)["data-phone-slide"]),
    ["chat", "today"],
  );
  assert.match(source("Hero"), /\(\["chat", "today"\] as const\)\.map/);
  assert.doesNotMatch(source("Hero"), /<ProductCard kind="today"/);
});

test("Today fills the screen with one Astra line and five mixed-state habit rows", () => {
  const today = slides.find((node) => attributes(node)["data-phone-slide"] === "today");
  const nodes = descendants(today);
  const rows = nodes.filter(
    (node) => node.name === "HabitRow" && !Object.hasOwn(attributes(node), "hidden"),
  );
  assert.equal(rows.length, 5);
  assert.ok(rows.some((node) => attributes(node).timing === "done"));
  assert.ok(rows.some((node) => attributes(node).timing === "todo"));
  assert.ok(rows.some((node) => attributes(node).time));
  assert.ok(rows.some((node) => attributes(node).days));
  assert.equal(nodes.filter((node) => node.name === "AstraGlyph").length, 1);
  assert.equal(nodes.filter((node) => node.name === "ChevronLeft").length, 1);
  assert.equal(nodes.filter((node) => node.name === "ChevronRight").length, 1);
  assert.ok(nodes.some((node) => attributes(node).name === "today.date"));
  assert.match(rules(".phone-today-habits").join("\n"), /flex:\s*1;/);
  assert.match(
    rules(".phone-today-habits").join("\n"),
    /grid-template-rows:\s*repeat\(5, minmax\(64px, 1fr\)\);/,
  );
});

test("side cards balance two items per column", () => {
  const columns = descendants(hero).filter((node) =>
    Object.hasOwn(attributes(node), "data-hero-column"),
  );
  assert.deepEqual(
    columns.map(
      (column) =>
        descendants(column).filter((node) => Object.hasOwn(attributes(node), "data-hero-float"))
          .length,
    ),
    [2, 2],
  );
});

test("no side card repeats phone copy in either locale", async () => {
  const copy = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports: copy },
  );
  const columns = descendants(hero).filter((node) =>
    Object.hasOwn(attributes(node), "data-hero-column"),
  );
  const product = (await parse(source("ProductCard"))).ast;
  const templates = new Map([["AstraDemo", (await parse(source("AstraDemo"))).ast]]);
  async function texts(node, language) {
    const attrs = attributes(node);
    const table = copy.landingCopy[language];
    if (node.name === "Copy") return [table[attrs.name]];
    if (attrs["data-i18n"]) return [copy.translations[language][attrs["data-i18n"]]];
    if (node.name === "HabitRow")
      return [
        table[`product.${attrs.habit}`],
        table[`product.${attrs.timing ?? "morning"}`],
      ].filter(Boolean);
    if (node.name === "ProductCard") {
      const branch = descendants(product).find(
        (child) =>
          child.type === "expression" &&
          child.children?.some(
            (part) => part.type === "text" && part.value.includes(`kind === "${attrs.kind}"`),
          ),
      );
      assert.ok(branch, attrs.kind);
      return (
        await Promise.all((branch.children ?? []).map((child) => texts(child, language)))
      ).flat();
    }
    const template = templates.get(node.name);
    if (template) return texts(template, language);
    return (await Promise.all((node.children ?? []).map((child) => texts(child, language)))).flat();
  }
  for (const language of ["en", "pt-BR"]) {
    const phoneText = new Set(
      (await Promise.all(slides.map((slide) => texts(slide, language)))).flat(),
    );
    for (const column of columns) {
      for (const text of await texts(column, language))
        assert.ok(!phoneText.has(text), `${language}: ${text}`);
    }
  }
});
