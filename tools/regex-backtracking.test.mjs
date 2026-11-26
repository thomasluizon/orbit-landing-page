import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skippedDirectories = new Set(["node_modules", "dist", ".astro", ".git", ".claude"]);
const scannedExtensions = new Set([".mjs", ".cjs", ".js", ".ts", ".astro"]);
const wideAtom = /(?:\\s|\\S|\.|\[\\s\\S\])[*+]/g;
const unboundedGroup = /^(?:[*+]|\{\d+,\d*\})/;

export function groupsOf(line) {
  const open = [];
  const groups = [];
  let inClass = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      index += 1;
    } else if (inClass) {
      inClass = char !== "]";
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      open.push(index);
    } else if (char === ")" && open.length > 0) {
      const start = open.pop();
      groups.push({ body: line.slice(start + 1, index), after: line.slice(index + 1) });
    }
  }
  return groups;
}

export function findBacktrackingGroups(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const { body, after } of groupsOf(line)) {
      const wide = body.match(wideAtom) ?? [];
      if (wide.length >= 2 && unboundedGroup.test(after)) {
        found.push({ line: index + 1, group: body });
      }
    }
  });
  return found;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) ? [] : sourceFiles(path);
    }
    return scannedExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

const space = String.raw`\s`;
const wild = ".";

function sample(...parts) {
  return parts.join("");
}

test("the scanner flags a repeated group that holds two overlapping wide atoms", () => {
  const triggers = sample("(?:", space, "+", wild, "*", String.raw`\n`, ")+?");
  assert.equal(findBacktrackingGroups(sample("/^on:", triggers, "/m")).length, 1);
  const mixed = sample("(", space, "*[", space, String.raw`\S]*x)*`);
  assert.equal(findBacktrackingGroups(mixed).length, 1);
});

test("the scanner accepts a repeated group of disjoint alternatives", () => {
  const quoted = sample("(?:[^", '"', String.raw`\\]|\\`, wild, ")*");
  assert.equal(findBacktrackingGroups(quoted).length, 0);
  const optional = sample("(?:", space, "+x)?");
  assert.equal(findBacktrackingGroups(optional).length, 0);
  const literalParens = sample("[(]", space, "+", wild, "*[)]+");
  assert.equal(findBacktrackingGroups(literalParens).length, 0);
});

test("no source file holds a regular expression that backtracks exponentially", () => {
  const files = sourceFiles(root);
  assert.ok(files.length > 20, "the scan reads the source tree");
  const offenders = files.flatMap((file) =>
    findBacktrackingGroups(readFileSync(file, "utf8")).map(
      ({ line, group }) => `${relative(root, file)}:${line} repeats (${group})`,
    ),
  );
  assert.deepEqual(offenders, []);
});
