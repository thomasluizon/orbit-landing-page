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
const rules = (selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => s.trim() === selector))
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

test("one vector layout draws the whole phone at 330 by 715 logical pixels", () => {
  const screen = descendants(hero).find((node) => attributes(node).class === "device-screen");
  assert.deepEqual(
    screen.children.filter((node) => node.name).map((node) => attributes(node).class),
    ["phone-screen"],
  );
  const layout = rules(".phone-screen");
  assert.equal(layout.length, 1);
  assert.match(layout[0], /inline-size:\s*330px;/);
  assert.match(layout[0], /block-size:\s*715px;/);
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
      querySelector: () => ({ offsetWidth: 330 }),
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
    assert.equal(Number(properties.get("--phone-scale")), Math.min(1, width / 330));
    resized([{ contentRect: { width: 200.5 } }]);
    assert.equal(Number(properties.get("--phone-scale")), 200.5 / 330);
    resized([{ contentRect: { width: 0 } }]);
    assert.equal(Number(properties.get("--phone-scale")), 200.5 / 330);
  }
});

test("scaled controls compensate their reach and reserve space without intersecting targets", () => {
  assert.match(
    rules(".phone-screen")[0] ?? "",
    /--phone-target-size:\s*calc\(44px \/ var\(--phone-scale\)\);/,
  );
  const reach = rules(".phone-screen .demo-preview-actions .pill-sm::before").join("\n");
  assert.match(reach, /zoom:\s*calc\(1 \/ var\(--phone-scale\)\);/);
  assert.match(reach, /inset-block:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  assert.match(reach, /inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\);/);
  assert.doesNotMatch(reach, /(?:padding|min-(?:inline|block)-size):/);
  assert.doesNotMatch(
    rules(".demo-preview-actions .pill-sm::before").join("\n"),
    /!important/,
    "the later, less specific small-pill reach must not override the phone reach",
  );
  assert.match(
    rules(".phone-screen .demo-preview-actions").join("\n"),
    /padding-block:\s*max\(0px, calc\(\(var\(--phone-target-size\) - 40px\) \/ 2\)\);/,
  );
  for (const control of [
    ".demo-chip",
    ".demo-send",
    ".demo-composer input",
    ".demo-edit-form input",
    ".demo-edit-form select",
    ".demo-save",
    ".text-link",
    ".habit-row[data-habit-toggle]",
  ]) {
    assert.match(
      rules(`.phone-screen ${control}`).join("\n"),
      /min-block-size:\s*var\(--phone-target-size\);/,
      control,
    );
    assert.match(
      rules(`.phone-screen ${control}`).join("\n"),
      /min-inline-size:\s*var\(--phone-target-size\);/,
      control,
    );
  }
  assert.match(
    rules(".phone-screen .phone-today-habits").join("\n"),
    /grid-template-rows:\s*repeat\(5, minmax\(max\(64px, var\(--phone-target-size\)\), 1fr\)\);/,
  );
  const geistMedium14pxPillWidths = [
    [78.112, 61.354, 90.46],
    [86.974, 74.612, 87.45],
  ];
  for (const scale of [
    0.5463869464,
    0.8428904429,
    0.703030303,
    0.7869463869,
    0.7365967366,
    0.7953379953,
    322 / 330,
    1,
  ]) {
    assert.ok(Math.abs((44 / scale) * scale - 44) < 1e-10);
    const padding = Math.max(0, (44 / scale - 40) / 2);
    assert.ok(Math.abs((40 + 2 * padding) * scale - 44) < 1e-10);
    assert.ok(Math.max(64, 44 / scale) * scale >= 44, "Today rows reserve their whole reach");
    for (const widths of geistMedium14pxPillWidths) {
      const targets = widths.map((width) => {
        const drawn = width * scale;
        const displayedInset = Math.min(0, (drawn - 44) / 2);
        const target = drawn - 2 * displayedInset;
        assert.equal(target, Math.max(drawn, 44));
        return target;
      });
      const blockInset = Math.min(0, (40 * scale - 44) / 2);
      assert.ok(Math.abs(40 * scale - 2 * blockInset - 44) < 1e-10);
      for (let index = 0; index < 2; index++) {
        const centreDistance = ((widths[index] + widths[index + 1]) / 2 + 12) * scale;
        assert.ok(
          (targets[index] + targets[index + 1]) / 2 <= centreDistance,
          "neighbouring 44px reaches fit in the 12px gap without intersecting",
        );
      }
    }
  }
});

test("proposal actions retain the app small pill geometry and separated targets", () => {
  const pills = rules(".demo-preview-actions .pill-sm");
  assert.ok(pills.length);
  assert.match(pills[0], /block-size:\s*40px;/);
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
  assert.match(rules(".phone-slide .demo-thread").join("\n"), /padding-inline:\s*16px;/);
  for (const selector of [".phone-slide .demo-request", ".phone-slide .demo-response > .t-body"])
    assert.doesNotMatch(rules(selector).join("\n"), /margin-inline(?:-end)?:/);
  assert.match(rules(".demo-preview").join("\n"), /padding:\s*8px;/);
  const logicalWidth = Number(rules(".phone-screen")[0]?.match(/inline-size:\s*(\d+)px;/)?.[1]);
  assert.equal(logicalWidth - 2 * 16, 298);
  const actionWidth = logicalWidth - 2 * 16 - 2 * 8;
  assert.equal(actionWidth, 282);
  assert.ok(actionWidth >= 273, "the Portuguese small pills fit with both 12px gaps");
});

test("phone spacing keeps only the declarations that render", () => {
  for (const [selector, property, expected] of [
    [".device-status", "min-block-size", "40px"],
    [".demo-exchange", "margin-block-start", "0"],
    [".demo-composer", "padding", "0 0 0 8px"],
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
  const rows = nodes.filter((node) => node.name === "HabitRow");
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
