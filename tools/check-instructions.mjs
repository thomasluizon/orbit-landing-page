#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ALWAYS_LOADED = { bytes: 6000, lines: 200 };
const PER_TASK = { bytes: 20000, lines: 500 };
const CONTENTS_THRESHOLD = 100;
const HARNESS_LINE_BUDGET = 7215;
const HARNESS_ROOTS = ["tools/", ".claude/", ".github/", "eslint-rules/"];
const HARNESS_FILES = ["lefthook.yml"];
const UNCHECKED_TOKEN = /[*?<>{}$\s]/;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 26 })
  .split("\0")
  .filter((file) => file && existsSync(file));
const tracked = new Set(files);
const topLevel = new Set(files.map((file) => file.split("/")[0]));
const findings = [];

const lineCount = (text) =>
  text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
const basename = (file) => file.slice(file.lastIndexOf("/") + 1);
const isAlwaysLoaded = (file) =>
  ["CLAUDE.md", "AGENTS.md"].includes(basename(file)) || /(^|\/)\.claude\/rules\//.test(file);
const isHarness = (file) =>
  HARNESS_FILES.includes(file) || HARNESS_ROOTS.some((root) => file.startsWith(root));
const exists = (path) =>
  tracked.has(path) || files.some((file) => file.startsWith(`${path.replace(/\/+$/, "")}/`));

const checkBudget = (file, bytes, lines, text) => {
  const budget = isAlwaysLoaded(file) ? ALWAYS_LOADED : PER_TASK;
  if (bytes > budget.bytes)
    findings.push(`${file}: ${bytes} B is over the ${budget.bytes} B budget`);
  if (lines > budget.lines)
    findings.push(`${file}: ${lines} lines is over the ${budget.lines} line budget`);
  if (!isAlwaysLoaded(file) && lines > CONTENTS_THRESHOLD && !/^## Contents\s*$/m.test(text))
    findings.push(`${file}: ${lines} lines and no "## Contents" heading`);
};

const checkCitedPaths = (file, text) => {
  const prose = text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1`*\s*$/gm, "");
  for (const [, raw] of prose.matchAll(/`([^`\n]+)`/g)) {
    if (UNCHECKED_TOKEN.test(raw)) continue;
    const path = raw.replace(/#.*$/, "").replace(/:\d+(-\d+)?$/, "");
    if (!path || !topLevel.has(path.split("/")[0])) continue;
    if (!exists(path)) findings.push(`${file}: the cited path ${raw} is not tracked`);
  }
};

let harnessLines = 0;
for (const file of files) {
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  const lines = lineCount(text);
  if (isHarness(file)) harnessLines += lines;
  if (isAlwaysLoaded(file) || file.endsWith(".md")) checkBudget(file, buffer.length, lines, text);
  if (file.endsWith(".md")) checkCitedPaths(file, text);
}

if (harnessLines > HARNESS_LINE_BUDGET)
  findings.push(
    `harness: ${harnessLines} lines is over the ${HARNESS_LINE_BUDGET} line budget. The harness line budget changes only by the owner's words.`,
  );

for (const finding of findings) console.log(finding);
process.exit(findings.length > 0 ? 1 : 0);
