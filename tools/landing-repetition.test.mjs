import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

const { ast } = await parse(readFileSync("dist/index.html", "utf8"));
const attrs = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const nodes = descendants(ast);
const hasClass = (node, name) => (attrs(node).class ?? "").split(/\s+/).includes(name);
const tables = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/i18n/translations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: tables },
);
function text(node, language, outsidePhone = false) {
  if (["script", "style"].includes(node.name)) return "";
  if (outsidePhone && hasClass(node, "hero-phone")) return "";
  const attributes = attrs(node);
  if (attributes["data-copy-en"])
    return attributes[language === "en" ? "data-copy-en" : "data-copy-pt"];
  if (attributes["data-i18n"]) return tables.translations[language][attributes["data-i18n"]] ?? "";
  if (node.type === "text") return node.value;
  return (node.children ?? []).map((child) => text(child, language, outsidePhone)).join(" ");
}
const occurrences = (prose, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...prose.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"))]
    .length;
};

for (const language of ["en", "pt-BR"]) {
  test(`${language}: habit and achievement names appear at most once outside the phone`, () => {
    const copy = tables.landingCopy[language];
    const keys = [
      ...Object.keys(copy).filter((key) => /^product\.(walk|water|run|stretch|read)$/.test(key)),
      ...Object.keys(copy).filter((key) =>
        /^blocks\.breakdown\.(dishes|laundry|bathroom)$/.test(key),
      ),
      "orbit.firstWeek",
      "orbit.firstHabit",
    ];
    const prose = text(ast, language, true);
    const repeats = keys
      .map((key) => [copy[key], occurrences(prose, copy[key])])
      .filter(([, count]) => count > 1);
    assert.deepEqual(repeats, []);
    for (const key of keys.filter((key) => key.startsWith("product.")))
      assert.equal(occurrences(prose, copy[key]), 0, `${copy[key]} belongs only to the phone`);
  });

  test(`${language}: pricing states the saving, recommendation and free-plan introduction once`, () => {
    const pricing = nodes.find((node) => attrs(node).id === "pricing");
    const prose = text(pricing, language);
    const copy = tables.landingCopy[language];
    assert.equal(occurrences(prose, copy["pricing.recommended"]), 1);
    const savings = descendants(pricing).filter((node) =>
      ["data-billing-saving", "data-annual-saving"].some((key) => Object.hasOwn(attrs(node), key)),
    );
    assert.equal(savings.length, 1);
    assert.ok(Object.hasOwn(attrs(savings[0]), "data-billing-saving"));
    assert.equal(occurrences(prose, copy["pricing.free.body"]), 1);
    assert.equal(
      occurrences(prose, language === "en" ? "Start with Free" : "Comece no plano grátis"),
      0,
    );
  });
}

test("each feature sentence has exactly one small example card", () => {
  const rows = nodes.filter((node) => attrs(node)["data-example-row"]);
  assert.equal(rows.length, 7);
  for (const row of rows) {
    const cards = descendants(row).filter((node) =>
      Object.hasOwn(attrs(node), "data-composition-card"),
    );
    assert.equal(cards.length, 1, attrs(row)["data-example-row"]);
  }
});

test("metrics owns the only chart and feature cards only show their named example", () => {
  const charts = nodes.filter((node) =>
    ["week-chart", "metric-chart", "orbit-month-chart", "orbit-wrapped-bars"].some((name) =>
      hasClass(node, name),
    ),
  );
  assert.equal(charts.length, 1);
  assert.ok(hasClass(charts[0], "metric-chart"));
  for (const kind of ["calendar", "streak", "goal", "achievements"]) {
    const row = nodes.find((node) => attrs(node)["data-example-row"] === kind);
    assert.equal(
      descendants(row).filter((node) => Object.hasOwn(attrs(node), "data-habit-toggle")).length,
      0,
      kind,
    );
  }
});
