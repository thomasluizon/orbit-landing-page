import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";

const html = readFileSync("dist/index.html", "utf8");
const css = [
  ...[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"/g)].map(([, href]) =>
    readFileSync(`dist${href}`, "utf8"),
  ),
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, body]) => body),
].join("\n");
function splitSelectors(selector) {
  let depth = 0;
  return selector
    .replace(/[(),]/g, (character) => {
      if (character === "(") depth++;
      if (character === ")") depth--;
      return character === "," && depth === 0 ? "\n" : character;
    })
    .split("\n")
    .map((value) => value.trim().replace(/\[([\w-]+)="([\w-]+)"\]/g, "[$1=$2]"));
}
const rules = [];
const parents = [];
for (const [, text, boundary] of css.matchAll(/([^{}]*)([{}])/g)) {
  if (boundary === "{") {
    parents.push(text.trim());
    continue;
  }
  const selector = parents.pop();
  if (!selector || selector.startsWith("@")) continue;
  rules.push({
    selectors: splitSelectors(selector).flatMap((value) => {
      const match = value.match(/^(.*):is\(([^()]*)\)(.*)$/);
      return match
        ? [value, ...splitSelectors(match[2]).map((item) => `${match[1]}${item}${match[3]}`)]
        : [value];
    }),
    conditions: [...parents],
    declarations: Object.fromEntries(
      [...text.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(([, name, value]) => [
        name,
        value.trim(),
      ]),
    ),
  });
}
const variables = Object.assign(
  {},
  ...rules.filter(({ selectors }) => selectors.includes(":root")).map((r) => r.declarations),
);
const normalize = (value) =>
  value
    .replace(/var\((--[\w-]+)\)/g, (whole, name) => variables[name] ?? whole)
    .replace(/\s*,\s*/g, ",")
    .replace(/\b0px\b/g, "0");
function declarations(selector) {
  selector = splitSelectors(selector).join(",");
  const matches = rules.filter(
    ({ selectors, conditions }) =>
      selectors.includes(selector) &&
      !conditions.some((condition) => condition.startsWith("@media")),
  );
  assert.ok(matches.length, `built CSS includes ${selector}`);
  return Object.assign({}, ...matches.map((rule) => rule.declarations));
}
function values(selector, expected) {
  const actual = declarations(selector);
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(normalize(actual[name] ?? ""), normalize(value), `${selector}: ${name}`);
  }
}
const { ast } = await parse(html);
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const attrs = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
const nodes = descendants(ast);
const byClass = (name) =>
  nodes.filter((node) => (attrs(node).class ?? "").split(/\s+/).includes(name));

test("built phone uses one 390 by 845 logical layout without visible hit-area inflation", () => {
  values(".phone-screen", {
    "inline-size": "390px",
    "block-size": "845px",
    "--phone-reach-size": "calc(44px / var(--phone-scale))",
    "--phone-reach-floor": "calc(24px / var(--phone-scale))",
    transform: "scale(var(--phone-scale))",
    "transform-origin": "0 0",
  });
  assert.equal(byClass("phone-screen").length, 1);
  assert.doesNotMatch(css, /--phone-target-size/);
});

test("built proposal matches the app card, item rows and small pills", () => {
  values(".demo-preview", {
    padding: "24px",
    "border-radius": "var(--radius-xl)",
    background: "var(--color-bg-card)",
    "box-shadow": "inset 0 0 0 1px var(--color-hairline)",
    gap: "24px",
  });
  values(".demo-habits", { gap: "8px" });
  values(".demo-habit", { "min-block-size": "52px", padding: "12px", gap: "12px" });
  values(".demo-preview-actions", {
    "flex-wrap": "nowrap",
    "justify-content": "flex-end",
    gap: "12px",
  });
  values(".demo-preview-actions .pill-sm", {
    "block-size": "44px",
    "padding-inline": "18px",
    "font-size": "14px",
    "font-weight": "500",
    gap: "7px",
    "border-radius": "var(--radius-full)",
    "flex-shrink": "0",
  });
  values(".demo-preview-actions .pill-sm:has(svg)", { "padding-inline-start": "16px" });
  const actions = descendants(byClass("demo-preview-actions")[0]).filter(
    (n) => n.name === "button",
  );
  assert.deepEqual(
    actions.map((node) => attrs(node).id),
    ["demo-reject", "demo-edit", "demo-approve"],
  );
  actions.forEach((node, index) => {
    assert.ok(attrs(node).class.includes(index === 2 ? "bg-primary" : "bg-transparent"));
  });
  for (const widths of [
    [78.112, 61.354, 90.46],
    [86.974, 74.612, 87.45],
  ]) {
    assert.ok(widths.reduce((sum, width) => sum + width, 24) <= 390 - 32 - 48);
  }
});

test("built suggestions are app pills with independent spacing above the composer", () => {
  values(".demo-chip", {
    "min-block-size": "48px",
    padding: "12px",
    "font-size": "14px",
    "font-weight": "500",
    "border-radius": "var(--radius-full)",
    background: "var(--color-bg-well)",
    color: "var(--color-fg-2)",
  });
  values(".demo-examples", { gap: "8px" });
  values('.demo-chip[aria-pressed="true"]', { color: "var(--color-fg-2)" });
  values(".demo-input-area", {
    padding: "16px",
    gap: "12px",
    "border-block-start": "1px solid var(--color-hairline)",
  });
  assert.equal(byClass("demo-chip").length, 3);
});

test("built composer keeps the field and 48px send circle within its padded 56px row", () => {
  values(".demo-composer", {
    "min-block-size": "56px",
    "border-radius": "28px",
    padding: "4px",
    background: "var(--color-bg-field)",
    "box-shadow": "inset 0 0 0 1px var(--color-border-control)",
    "align-items": "flex-end",
  });
  values(".demo-composer input", {
    "min-block-size": "48px",
    padding: "8px 12px",
    "font-size": "16px",
  });
  values(".demo-send", {
    "inline-size": "48px",
    "block-size": "48px",
    "border-radius": "var(--radius-full)",
    background: "var(--color-bg-well)",
  });
  values(".demo-composer[data-has-text] .demo-send", {
    background: "var(--color-primary)",
  });
  values(".demo-send svg", { "inline-size": "20px", "block-size": "20px" });
  const composer = nodes.find((node) => attrs(node).id === "demo-composer");
  assert.ok(descendants(composer).some((node) => attrs(node).class === "demo-send"));
  assert.ok(Object.hasOwn(attrs(byClass("demo-send")[0]), "disabled"));
});

test("built thread and shared headers use the app spacing", () => {
  values(".demo-thread", { padding: "16px", gap: "16px", overflow: "visible" });
  values(".demo-exchange", { gap: "16px" });
  values(".demo-request", {
    padding: "12px 16px",
    "max-inline-size": "80%",
    "border-radius": "var(--radius-lg)",
    background: "var(--color-bg-well)",
  });
  values(".phone-app-header", { "min-block-size": "56px", "padding-inline": "16px" });
  values(".phone-day-chevron", { "block-size": "48px", flex: "0 0 48px" });
  values(".phone-day-chevron svg", { "inline-size": "20px", "block-size": "20px" });
  assert.equal(byClass("phone-app-header").length, 2);
});

test("built Today uses a 16px screen inset and bordered habit rows with 28px rounded checks", () => {
  values(".phone-today-content", {
    "padding-inline": "16px",
    "padding-block-end": "16px",
    overflow: "visible",
  });
  values(".phone-slide .habit-row", {
    "min-block-size": "64px",
    padding: "12px",
    gap: "12px",
    "border-radius": "var(--radius-xl)",
  });
  values(".phone-slide .status-ring", {
    "inline-size": "28px",
    "block-size": "28px",
    "border-radius": "var(--radius-md)",
  });
  values(".phone-slide .status-ring:not(.is-done)", {
    border: "1px solid var(--color-status-empty)",
  });
});

test("built person-typed text fills its row and truncates after two whole-word lines", () => {
  for (const selector of [
    ".phone-slide .habit-name",
    ".phone-slide .demo-habit .t-row",
    ".phone-slide .demo-request",
    ".phone-slide .demo-request-text",
    ".phone-slide .proactive-line p",
  ]) {
    values(selector, {
      "overflow-wrap": "normal",
      "word-break": "normal",
      "inline-size": "100%",
      "min-inline-size": "0",
      display: "-webkit-box",
      "-webkit-box-orient": "vertical",
      "-webkit-line-clamp": "2",
      overflow: "hidden",
      "text-overflow": "ellipsis",
      "white-space": "normal",
    });
  }
  values(".phone-slide .habit-copy", { flex: "1" });
  values(".demo-habit-copy", { flex: "1", "min-inline-size": "0" });
  const request = nodes.find((node) => attrs(node).id === "demo-request");
  assert.ok(attrs(request).class.includes("demo-request-text"));
  assert.ok(byClass("demo-request")[0].children.includes(request));
  for (const name of ["habit-name", "demo-habit-copy", "demo-request"]) {
    assert.ok(byClass(name).some((node) => descendants(byClass("phone-screen")[0]).includes(node)));
  }
});

test("built phone reserves a shared 34px safe area with a centred home indicator", () => {
  values(".phone-screen", { "padding-block-end": "34px" });
  values(".device-home", {
    position: "absolute",
    "inset-block-end": "15px",
    "block-size": "4px",
  });
  values(".phone-carousel", { flex: "1", "min-block-size": "0" });
  const phone = byClass("phone-screen")[0];
  assert.deepEqual(
    phone.children.filter((node) => node.type === "element").map((node) => attrs(node).class),
    ["device-status", "phone-carousel", "device-home"],
  );
  const carousel = descendants(byClass("phone-carousel")[0]);
  for (const name of ["demo-input-area", "phone-today-content", "phone-today-pager"]) {
    assert.ok(
      byClass(name).every((node) => carousel.includes(node)),
      name,
    );
  }
});

test("built status bar centres time and icons beside the island and above both app headers", () => {
  values(".device-status", {
    display: "grid",
    "grid-template-columns": "minmax(0,1fr) 96px minmax(0,1fr)",
    "place-items": "center",
    "min-block-size": "54px",
    "padding-inline": "24px",
    "flex-shrink": "0",
  });
  values(".device-status-time", { "grid-column": "1" });
  values(".device-status-icons", { "grid-column": "3" });
  values(".device-speaker", { "inline-size": "96px", "inset-block-start": "12px" });
  const status = byClass("device-status")[0];
  for (const name of ["device-status-time", "device-status-icons", "device-speaker"]) {
    assert.equal(byClass(name).length, 1);
    assert.ok(descendants(status).includes(byClass(name)[0]));
  }
  const carousel = byClass("phone-carousel")[0];
  assert.ok(nodes.indexOf(status) < nodes.indexOf(carousel));
  assert.ok(byClass("phone-app-header").every((node) => descendants(carousel).includes(node)));
});

test("built Astra message aligns its glyph with the thread and proposal inset", () => {
  values(".demo-message", { padding: "0", gap: "8px" });
  values(".demo-thread", { padding: "16px" });
  values(".demo-request", { padding: "12px 16px" });
  const response = byClass("demo-response")[0];
  for (const name of ["demo-message", "demo-preview"]) {
    assert.ok(response.children.includes(byClass(name)[0]));
  }
  assert.equal(byClass("demo-message")[0].children.find((node) => node.name)?.name, "svg");
});

test("built phone has no vertical scroll container or page-scroll exclusion", () => {
  const phone = byClass("phone-screen")[0];
  const classes = new Set(
    descendants(phone).flatMap((node) => (attrs(node).class ?? "").split(/\s+/)),
  );
  for (const { selectors, declarations: body } of rules) {
    if (
      !selectors.some((selector) => {
        if (/\.(?:example|hero-side|footer|closing|orbit)-/.test(selector)) return false;
        return [...selector.matchAll(/\.([\w-]+)/g)].some(([, name]) => classes.has(name));
      })
    )
      continue;
    assert.doesNotMatch(body["overflow-y"] ?? "", /auto|scroll/, selectors.join(","));
    assert.doesNotMatch(body.overflow ?? "", /auto|scroll/, selectors.join(","));
  }
  assert.ok(!descendants(phone).some((node) => Object.hasOwn(attrs(node), "data-lenis-prevent")));
  assert.doesNotMatch(
    readFileSync("src/scripts/hero-carousel.ts", "utf8"),
    /addEventListener\(\s*["']wheel["']|preventDefault/,
  );
  assert.doesNotMatch(
    readFileSync("src/scripts/landing-motion.ts", "utf8"),
    /closest\(["']\.phone-carousel/,
  );
});
