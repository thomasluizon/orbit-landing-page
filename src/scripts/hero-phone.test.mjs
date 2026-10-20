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

for (const [kind, forbidden] of [
  ["relational", /:has\(/],
  ["filtered sibling", /:nth-(?:last-)?child\([^)]*\bof\b/],
]) {
  test(`phone reaches select explicit state without ${kind} selectors`, () => {
    const reachRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
      ([, selector]) => selector.includes(".phone-screen") && selector.includes("::before"),
    );
    assert.ok(reachRules.length > 0);
    for (const [, selector] of reachRules) assert.doesNotMatch(selector, forbidden);
  });
}

test("the fixed phone screen contains size, layout, paint and style", () => {
  assert.equal(declarations(rules(".phone-screen").join("\n")).contain, "strict");
});

test("stretched phone slides contain layout, paint and style without intrinsic size containment", () => {
  assert.equal(declarations(rules(".phone-slide").join("\n")).contain, "layout paint style");
});

test("phone habit reaches mark the visible boundaries before script loading", async () => {
  const demo = (await parse(source("AstraDemo"))).ast;
  const lists = [
    descendants(hero).find((node) => attributes(node).class === "phone-today-habits"),
    descendants(demo).find((node) => attributes(node).id === "demo-today"),
  ];
  for (const list of lists) {
    const rows = list.children.filter(
      (node) => node.name === "HabitRow" || attributes(node).class === "habit-row",
    );
    const visible = rows.filter((node) => !Object.hasOwn(attributes(node), "hidden"));
    assert.ok(visible.length > 0);
    for (const row of rows) {
      assert.equal(Object.hasOwn(attributes(row), "data-first-visible"), row === visible[0]);
      assert.equal(Object.hasOwn(attributes(row), "data-last-visible"), row === visible.at(-1));
    }
  }
});

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
  for (const width of [
    180, 180.3076923077, 259.6923076923, 243.0769230769, 262.4615384615, 322, 400,
  ]) {
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
  [390, 844],
  [844, 390],
  [568, 320],
  [360, 740],
  [360, 780],
  [412, 915],
  [768, 720],
  [768, 1024],
  [1100, 762],
  [1280, 720],
  [1352, 900],
  [1440, 900],
  [1920, 1080],
];
const minimumScale = 24 / 52;
const stageRules = [];
const parents = [];
for (const [, text, boundary] of css.matchAll(/([^{}]*)([{}])/g)) {
  if (boundary === "{") parents.push(text.trim());
  else {
    const selector = parents.pop();
    if (selector === ".hero-stage") stageRules.push({ body: text, conditions: [...parents] });
  }
}
const matchesViewport = (conditions, width, height) =>
  conditions.every((condition) =>
    [...condition.matchAll(/\((width|height)\s*(<=|>=|<|>)\s*(\d+)px\)/g)].every(
      ([, axis, operator, boundary]) =>
        vm.runInNewContext(`${axis === "width" ? width : height} ${operator} ${boundary}`),
    ),
  );
const viewportScale = (width, height) => {
  const properties = Object.assign(
    {},
    ...stageRules
      .filter(({ conditions }) => matchesViewport(conditions, width, height))
      .map(({ body }) => declarations(body)),
  );
  const resolve = (value) =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name) => `(${resolve(properties[name])})`);
  const device = vm.runInNewContext(
    resolve(properties["--hero-device-width"])
      .replace(/env\(safe-area-inset-top\)/g, "0px")
      .replace(/\bcalc\(/g, "(")
      .replace(/\b(min|max)\(/g, "Math.$1(")
      .replace(/([\d.]+)svh/g, (_, value) => String((Number(value) * height) / 100))
      .replace(/([\d.]+)vw/g, (_, value) => String((Number(value) * width) / 100))
      .replace(/px\b/g, ""),
  );
  return (device - 8) / 390;
};
const scales = viewports.map(([width, height]) => viewportScale(width, height));

for (const [width, height] of viewports) {
  for (const locale of ["en", "pt"]) {
    test(`${locale} ${width}x${height} keeps the phone scale above the smallest bounded target floor`, () => {
      assert.ok(viewportScale(width, height) >= minimumScale - 1e-8);
    });
  }
}

for (const [width, height, expected] of [
  [1440, 900, 0.8362919132149901],
  [1100, 762, 0.6729783037475345],
  [412, 915, 0.8717948717948718],
  [390, 844, 0.7889546351084812],
  [320, 568, 0.46232741617357],
]) {
  test(`${width}x${height} retains the original phone scale`, () => {
    near(viewportScale(width, height), expected, "unchanged phone scale");
  });
}

function reach(width, height, scale, selectors = []) {
  const properties = {
    ...declarations(rules(".device-screen").join("\n")),
    "--phone-scale": String(scale),
    ...screenProperties,
  };
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
const remainingExpansion = (size, scale, opposite, limit = Infinity) =>
  Math.min(Math.max(0, 44 - size * scale - opposite), limit * scale);
const proposalSelectors = (index) => [
  ".phone-screen .demo-preview-actions > button::before",
  ...(index > 0 ? [".phone-screen .demo-preview-actions > :not(:first-child)::before"] : []),
  ...(index < 2 ? [".phone-screen .demo-preview-actions > :not(:last-child)::before"] : []),
  ...(index === 0 ? [".phone-screen .demo-preview-actions > :first-child::before"] : []),
  ...(index === 2 ? [".phone-screen .demo-preview-actions > :last-child::before"] : []),
];

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
          reach(width, 44, scale, proposalSelectors(index)),
        );
        for (const index of [pair, pair + 1]) {
          const target = targets[index];
          near(target.block, Math.max(44, 44 * scale), "proposal block reach");
          near(
            -target["inline-start"],
            index === 0
              ? remainingExpansion(widths[index], scale, expansion(widths[index], scale, 6))
              : expansion(widths[index], scale, 6),
            "inline start uses half the 12px gap",
          );
          near(
            -target["inline-end"],
            index === 2
              ? remainingExpansion(widths[index], scale, expansion(widths[index], scale, 6))
              : expansion(widths[index], scale, 6),
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
  test(`${locale} proposal reaches use 44 displayed pixels wherever the neighbours allow`, () => {
    const transformScale = screenProperties.transform.match(/scale\(var\((--[\w-]+)\)\)/)?.[1];
    assert.equal(transformScale, "--phone-scale");
    assert.equal(screenProperties["--phone-reach-size"], `calc(44px / var(${transformScale}))`);
    assert.equal(screenProperties["--phone-reach-floor"], `calc(24px / var(${transformScale}))`);
    for (const scale of [...scales, 1]) {
      widths.forEach((width, index) => {
        const target = reach(width, 44, scale, proposalSelectors(index));
        near(target.block, 44, "proposal height uses the artwork scale exactly once");
        near(
          target.inline,
          Math.max(width * scale, index === 1 ? Math.min(44, (width + 12) * scale) : 44),
          "outer edges use spare space while the middle action stops at both midpoints",
        );
        if (index > 0)
          assert.ok(-target["inline-start"] <= 6 * scale + 1e-8, "start stops at midpoint");
        if (index < 2)
          assert.ok(-target["inline-end"] <= 6 * scale + 1e-8, "end stops at midpoint");
      });
    }
  });
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
          near(
            -targets[index]["block-start"],
            remainingExpansion(48, scale, expansion(48, scale, 6), 16),
            "chip uses space above after limiting its bottom edge",
          );
          near(-targets[index]["block-end"], expansion(48, scale, 6), "chip clears composer");
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
      [field, 10, 20],
      [send, 4, 4],
    ]) {
      near(-target["block-start"], expansion(48, scale, start), "composer start reach");
      near(
        -target["block-end"],
        target === field
          ? remainingExpansion(48, scale, expansion(48, scale, start), end)
          : expansion(48, scale, end),
        "composer end reach",
      );
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

test("chips and native composer fields stop at the same midpoint of the drawn 12px gap", () => {
  const gap = Number(declarations(rules(".demo-input-area").join("\n")).gap.replace("px", ""));
  const padding = Number(
    declarations(rules(".demo-composer").join("\n")).padding.replace("px", ""),
  );
  assert.equal(gap, 12);
  assert.equal(padding, 4);
  for (const scale of scales) {
    const chip = reach(96, 48, scale, [".phone-screen .demo-chip::before"]);
    const field = reach(306, 48, scale, [
      ".phone-screen :is(.demo-composer-field, .demo-send)::before",
      ".phone-screen .demo-composer-field::before",
    ]);
    const midpoint = (48 + gap / 2) * scale;
    const chipEnd = 48 * scale - chip["block-end"];
    const fieldStart = (48 + gap + padding) * scale + field["block-start"];
    assert.ok(chipEnd <= midpoint + 1e-8, "chip ends before the gap midpoint");
    assert.ok(fieldStart >= midpoint - 1e-8, "field starts after the gap midpoint");
    assert.ok(chipEnd <= fieldStart + 1e-8, "the displayed targets never intersect");
    near(chip.block, Math.max(48 * scale, Math.min(44, 70 * scale)), "bounded chip height");
    near(field.block, Math.max(48 * scale, Math.min(44, 78 * scale)), "bounded field height");
  }
});

test("shared proposal and chip edges make the midpoint a hard expansion limit", () => {
  for (const [selector, limits] of [
    [".phone-screen .demo-preview-actions > :not(:first-child)::before", [6]],
    [".phone-screen .demo-preview-actions > :not(:last-child)::before", [6]],
    [".phone-screen .demo-examples > :not(:first-child)::before", [4]],
    [".phone-screen .demo-examples > :not(:last-child)::before", [4]],
    [".phone-screen .demo-chip::before", [6, 16]],
    [".phone-screen :is(.demo-composer-field, .demo-send)::before", [10, 20]],
  ]) {
    const body = rules(selector).join("\n");
    assert.doesNotMatch(body, /var\(--phone-reach-floor(?:-inset)?\)/, selector);
    for (const limit of limits) assert.match(body, new RegExp(`max\\(\\s*-${limit}px,`), selector);
  }
});

for (let pair = 0; pair < 2; pair++) {
  test(`editor pair ${pair + 1} splits the 8px row gap without swallowing native faces or labels`, () => {
    for (const scale of scales) {
      const targets = [
        reach(218, 48, scale, [
          ".phone-screen .demo-edit-field::before",
          ".phone-screen .demo-edit-name::before",
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
          ...(index === 0 ? [`${selector}[data-first-visible]::before`] : []),
          ...(index === 2 ? [`${selector}[data-last-visible]::before`] : []),
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

for (const [width, height] of [
  [844, 390],
  [568, 320],
]) {
  for (const locale of ["en", "pt"]) {
    test(`${locale} ${width}x${height} keeps all bounded target groups at 24px without overlapping reaches`, () => {
      const scale = viewportScale(width, height);
      const box = (x, y, width, height, selectors = []) => {
        const target = reach(width, height, scale, selectors);
        return {
          left: x * scale + target["inline-start"],
          right: (x + width) * scale - target["inline-end"],
          top: y * scale + target["block-start"],
          bottom: (y + height) * scale - target["block-end"],
        };
      };
      const row = (widths, height, gap, selectors) => {
        let x = 0;
        return widths.map((width, index) => {
          const target = box(x, 0, width, height, selectors(index));
          x += width + gap;
          return target;
        });
      };
      const proposalWidths = locale === "en" ? [78.112, 61.354, 90.46] : [86.974, 74.612, 87.45];
      const chipWidths = locale === "en" ? [112, 110, 96] : [92, 110, 128];
      const chips = row(chipWidths, 48, 8, (index) => [
        ".phone-screen .demo-chip::before",
        ...(index > 0 ? [".phone-screen .demo-examples > :not(:first-child)::before"] : []),
        ...(index < 2 ? [".phone-screen .demo-examples > :not(:last-child)::before"] : []),
      ]);
      const composerSelectors = [".phone-screen :is(.demo-composer-field, .demo-send)::before"];
      const proposal = row(proposalWidths, 44, 12, proposalSelectors);
      const input = [
        ...chips,
        box(4, 48 + 12 + 4, 302, 48, [
          ...composerSelectors,
          ".phone-screen .demo-composer-field::before",
        ]),
        box(306, 48 + 12 + 4, 48, 48, [...composerSelectors, ".phone-screen .demo-send::before"]),
      ];
      const editor = [
        box(92, 0, 218, 48, [
          ".phone-screen .demo-edit-field::before",
          ".phone-screen .demo-edit-name::before",
        ]),
        box(92, 56, 218, 48, [".phone-screen .demo-edit-field::before"]),
        box(0, 112, 310, 48, [".phone-screen .demo-save::before"]),
      ];
      const continuation = [
        box(0, 0, 200, 48, [".phone-screen .demo-continue .text-link::before"]),
      ];
      const padding = (selector) =>
        Number(declarations(rules(selector).join("\n")).padding.replace("px", ""));
      const inputSeparation = padding(".demo-thread") + 1 + padding(".demo-input-area");
      const withInput = (targets, logicalBottom, separation = inputSeparation) => [
        ...targets,
        ...input.map((target) => ({
          ...target,
          top: target.top + (logicalBottom + separation) * scale,
          bottom: target.bottom + (logicalBottom + separation) * scale,
        })),
      ];
      const groups = [
        withInput(proposal, 44, inputSeparation + padding(".demo-preview")),
        withInput(editor, 160, inputSeparation + padding(".demo-preview")),
        withInput(continuation, 48),
      ];
      for (const [container, gap, count] of [
        [".phone-today-habits", 12, 7],
        [".demo-today", 16, 2],
      ]) {
        const selector = `.phone-screen ${container} > .habit-row`;
        const habits = Array.from({ length: count }, (_, index) =>
          box(0, index * (64 + gap), 358, 64, [
            `${selector}::before`,
            ...(index === 0 ? [`${selector}[data-first-visible]::before`] : []),
            ...(index === count - 1 ? [`${selector}[data-last-visible]::before`] : []),
          ]),
        );
        groups.push(
          container === ".demo-today" ? withInput(habits, count * (64 + gap) - gap) : habits,
        );
      }
      for (const targets of groups) {
        for (let a = 0; a < targets.length; a++) {
          const first = targets[a];
          assert.ok(first.right - first.left >= 24 - 1e-8);
          assert.ok(first.bottom - first.top >= 24 - 1e-8);
          for (const second of targets.slice(a + 1)) {
            assert.ok(
              first.right <= second.left + 1e-8 ||
                second.right <= first.left + 1e-8 ||
                first.bottom <= second.top + 1e-8 ||
                second.bottom <= first.top + 1e-8,
              "adjacent target reaches remain distinct",
            );
          }
        }
      }
    });
  }
}
