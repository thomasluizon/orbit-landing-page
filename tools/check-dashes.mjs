#!/usr/bin/env node

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function dashFindings(text, { allowNumericRanges = true } = {}) {
  const allowedEnDash = new Set();
  if (allowNumericRanges) {
    for (const match of text.matchAll(/\d\s?\u2013\s?\d/g)) {
      allowedEnDash.add(match.index + match[0].indexOf("\u2013"));
    }
  }
  const findings = [];
  for (const match of text.matchAll(/[\u2014\u2013]/g)) {
    if (match[0] === "\u2013" && allowedEnDash.has(match.index)) continue;
    const line = text.slice(0, match.index).split("\n").length;
    const snippet = text
      .slice(Math.max(0, match.index - 25), match.index + 26)
      .replace(/\s+/g, " ")
      .trim();
    findings.push({ line, kind: match[0] === "\u2014" ? "em dash" : "en dash", snippet });
  }
  return findings;
}

const checkFiles = (files) => {
  const perFile = new Map();
  for (const file of files) {
    const absolute = resolve(REPO_ROOT, file);
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch (error) {
      console.error(`Cannot read requested file ${file}: ${error.message}`);
      process.exit(2);
    }
    if (text.includes("\u0000")) continue;
    const findings = dashFindings(text);
    if (findings.length) perFile.set(file.replaceAll("\\", "/"), findings);
  }
  return perFile;
};

const printFindings = (perFile, limitPerFile = 3) => {
  for (const [file, findings] of perFile) {
    console.error(`${file}: ${findings.length}`);
    for (const finding of findings.slice(0, limitPerFile)) {
      console.error(`  L${finding.line} ${finding.kind}: …${finding.snippet}…`);
    }
  }
};

const HOW_TO_FIX =
  "\nEm dashes are banned in Orbit prose. Use a plain hyphen (-), a comma, or restructure.\nEn dashes are allowed only inside a numeric range (1–10).";

const USAGE = `usage: check-dashes.mjs --files <path>...

  --files <path>...   check exactly these files (exit 1 on any em dash or any en dash outside a numeric range)
  --help, -h          print this usage and exit 0

exit codes: 0 clean, 1 a banned dash, 2 usage error`;

const isMain =
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (process.argv[2] === "--files") {
    const files = process.argv.slice(3);
    if (files.length === 0) {
      console.error(USAGE);
      process.exit(2);
    }
    const perFile = checkFiles(files);
    if (perFile.size) {
      console.error("Banned dash written into files:");
      printFindings(perFile);
      console.error(HOW_TO_FIX);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error(USAGE);
  process.exit(2);
}
