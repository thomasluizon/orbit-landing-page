import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const css = await readFile("src/styles/global.css", "utf8");
const tokens = new Map(
  [...css.slice(0, css.indexOf("@utility")).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2],
  ]),
);

test("landing mirrors the dark canon and separates accent fill from text", () => {
  for (const [name, value] of Object.entries({
    "--color-bg": "#09090b",
    "--color-primary": "#c4530f",
    "--color-primary-soft": "#c85716",
    "--color-primary-hover": "#b74e12",
    "--color-primary-pressed": "#a24716",
    "--primary-rgb": "196, 83, 15",
    "--color-fg-1": "#f4f4f6",
    "--color-fg-2": "#c9c9cc",
    "--color-fg-3": "#8f8f93",
    "--color-fg-4": "#5d5d60",
    "--color-track-empty": "#8b8b8e",
    "--color-border-control": "#6e6e72",
    "--color-primary-text": "#ed773e",
    "--color-status-empty": "var(--color-track-empty)",
    "--radius-sheet": "28px",
    "--font-sans": "var(--font-geist)",
    "--font-display": "var(--font-space-grotesk)",
    "--font-mono": "var(--font-geist-mono)",
  })) {
    assert.equal(tokens.get(name), value, name);
  }
});

test("all shipping sources are free of retired decoration tokens", async () => {
  const retired = ["gradient" + "-header", "primary" + "-glow"];
  for (const entry of await readdir("src", { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(astro|css|ts)$/.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    const source = await readFile(path, "utf8");
    for (const name of retired) assert.ok(!source.includes(name), `${path}: ${name}`);
  }
});

test("every colour token the landing styles read is one global.css defines", async () => {
  const landing = await readFile("src/styles/landing.css", "utf8");
  const defined = new Set([...css.matchAll(/(--color-[\w-]+)\s*:/g)].map((match) => match[1]));
  const lines = landing.split("\n");
  const undefinedTokens = lines.flatMap((line, index) =>
    [...line.matchAll(/var\(\s*(--color-[\w-]+)/g)]
      .filter((match) => !defined.has(match[1]))
      .map((match) => `landing.css:${index + 1} ${match[1]}`),
  );
  assert.deepEqual(undefinedTokens, []);
});

test("primary labels keep AA contrast in rest, hover and pressed states", () => {
  function luminance(hex) {
    const channels = hex
      .slice(1)
      .match(/../g)
      .map((part) => {
        const value = parseInt(part, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const label = luminance(tokens.get("--color-fg-on-primary"));
  for (const name of ["--color-primary", "--color-primary-hover", "--color-primary-pressed"]) {
    const fill = tokens.get(name);
    assert.ok(fill, name);
    const contrast = (label + 0.05) / (luminance(fill) + 0.05);
    assert.ok(contrast >= 4.5, `${name}: ${contrast.toFixed(2)}:1`);
  }
});

const lightScope = Object.fromEntries(
  [
    ...(css.match(/\.phone-light\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g),
  ].map((m) => [m[1], m[2].trim()]),
);
const normalizeValue = (value) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(\d+\.\d+)/g, (number) => String(Number(number)));

test("the hero phone screens take the light tokens and the page stays dark", () => {
  for (const [name, value] of Object.entries({
    "--color-bg": "#fafafa",
    "--color-bg-card": "#ffffff",
    "--color-bg-well": "rgba(9, 9, 11, 0.04)",
    "--color-bg-hover": "rgba(9, 9, 11, 0.11)",
    "--color-hairline": "rgba(9, 9, 11, 0.08)",
    "--color-border-control": "#89898d",
    "--color-hairline-strong": "rgba(9, 9, 11, 0.16)",
    "--color-fg-1": "#1a1a1d",
    "--color-fg-2": "#424247",
    "--color-fg-3": "#68686d",
    "--color-fg-4": "#89898d",
    "--color-track-empty": "#7e7e82",
    "--color-primary": "#c4530f",
    "--color-primary-soft": "#c15109",
    "--color-primary-text": "#a63a00",
    "--color-primary-dim": "#f4ddd3",
    "--color-status-overdue": "#7d5700",
    "--color-status-bad": "#e7000b",
    "--color-status-bad-text": "#c00000",
    "--color-status-done": "var(--color-fg-1)",
    "--color-status-empty": "var(--color-track-empty)",
    "--color-status-frozen": "var(--color-fg-2)",
  })) {
    assert.equal(lightScope[name], value, name);
  }
  assert.equal(tokens.get("--color-bg"), "#09090b");
  assert.match(css, /html\s*\{\s*color-scheme:\s*dark;/);
  assert.doesNotMatch(css, /body\s*\{[^}]*phone-light/);
});

test("every light value matches the Light mode list of DESIGN.md when the app repository sits beside this one", (t) => {
  const path = ["../orbit-ui-mobile/DESIGN.md", "../../../orbit-ui-mobile/DESIGN.md"].find(
    existsSync,
  );
  if (!path) return t.skip("DESIGN.md is not beside this repository");
  const design = readFileSync(path, "utf8");
  const section = design.slice(design.indexOf("### Light mode"));
  const block = section.slice(
    section.indexOf("```") + 3,
    section.indexOf("```", section.indexOf("```") + 3),
  );
  const listed = new Map(
    [...block.matchAll(/(--[\w-]+)\s+(#[0-9A-Fa-f]{6}\b|rgba\([^)]*\))/g)].map((m) => [m[1], m[2]]),
  );
  assert.ok(listed.size > 20, "the Light mode list was parsed");
  for (const [name, value] of Object.entries(lightScope)) {
    if (value.startsWith("var(")) continue;
    const source = listed.get(name.replace("--color-", "--"));
    assert.ok(source, `${name} is listed in DESIGN.md`);
    assert.equal(normalizeValue(value), normalizeValue(source), name);
  }
  const defined = [...css.slice(0, css.indexOf("@utility")).matchAll(/(--color-[\w-]+):/g)].map(
    (m) => m[1],
  );
  for (const [name] of listed) {
    const mirror = name.replace("--", "--color-");
    if (defined.includes(mirror) && !["--color-bg-hover-opaque"].includes(mirror))
      assert.ok(mirror in lightScope, `${mirror} is in the light scope`);
  }
});
