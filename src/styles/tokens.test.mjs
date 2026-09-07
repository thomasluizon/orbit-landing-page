import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const css = await readFile("src/styles/global.css", "utf8");
const tokens = new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));

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
