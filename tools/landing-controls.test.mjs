import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parse } from "@astrojs/compiler";

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:astro|ts|css)$/.test(entry.name) ? [path] : [];
  });

const nodesOf = (node) => [node, ...(node.children ?? []).flatMap(nodesOf)];
const attributeOf = (node, name) => node.attributes?.find((attribute) => attribute.name === name);

test("no source file paints a primary action by scroll position", () => {
  for (const path of sourceFiles("src")) {
    const source = readFileSync(path, "utf8");
    assert.ok(!/data-accent-active|data-primary-action|primary-actions/.test(source), path);
  }
});

test("each component keeps at most one primary pill button with a static fill", async () => {
  const primitive = readFileSync("src/components/PillButton.astro", "utf8");
  const primary = primitive.match(/primary:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  assert.match(primary, /(?:^|\s)bg-primary(?:\s|$)/);
  assert.doesNotMatch(primitive, /IntersectionObserver|setAttribute/);
  for (const file of readdirSync("src/components").filter((name) => name.endsWith(".astro"))) {
    const { ast } = await parse(readFileSync(`src/components/${file}`, "utf8"));
    const primaries = nodesOf(ast).filter((node) => {
      if (node.name !== "PillButton") return false;
      const variant = attributeOf(node, "variant");
      return !variant || variant.value === "primary";
    });
    assert.ok(primaries.length <= 1, `${file} declares ${primaries.length} primary buttons`);
  }
});
