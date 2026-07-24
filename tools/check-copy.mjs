#!/usr/bin/env node
// The copy-register gate, vendored from orbit-ui-mobile (REBUILD.md 6.1):
// AI-cliche words, placeholder content, and typed-in UPPERCASE in the
// translation table's string VALUES, plus hardcoded brand-accent colors in
// source. This repo's copy lives in src/i18n/translations.ts (typed EN/PT-BR
// tables), which the old hook never covered: its pattern matched i18n *.json
// only, so the landing page's real copy file was ungated (a confirmed audit
// gap). Values-only: keys are never scanned.
//
// Usage:
//   node tools/check-copy.mjs --check             full scan vs tools/copy-baseline.json (exit 1 on growth)
//   node tools/check-copy.mjs --write-baseline    regenerate tools/copy-baseline.json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(REPO_ROOT, "tools", "copy-baseline.json");

const TRANSLATIONS_FILE = "src/i18n/translations.ts";
const TOKEN_FILE = "src/styles/global.css";
const BRAND_COLOR_GLOBS = [/^src\/.*\.(astro|css|ts)$/];
const BRAND_COLOR_EXEMPT = [/^src\/styles\/global\.css$/];

const CLICHES = [
  /\belevat(?:e|es|ed|ing)\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bunleash(?:es|ed|ing)?\b/i,
  /\bnext-gen(?:eration)?\b/i,
  /\bgame-?chang(?:er|ers|ing)\b/i,
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\brevolutioni[sz](?:e|es|ed|ing)\b/i,
  /\bsupercharg(?:e|es|ed|ing)\b/i,
  /\bstreamlin(?:e|es|ed|ing)\b/i,
  /\bin the world of\b/i,
];
const PLACEHOLDERS = [/\bjohn doe\b/i, /\bjane doe\b/i, /\bacme\b/i, /\blorem ipsum\b/i];

const proseOf = (value) => value.replace(/\{[^}]*\}/g, " ").replace(/<[^>]*>/g, " ");
const hasLetters = (text) => /\p{L}/u.test(text);
const isAllUppercase = (text) =>
  hasLetters(text) && text === text.toUpperCase() && text !== text.toLowerCase();
const longestUppercaseRun = (text) =>
  Math.max(0, ...[...text.matchAll(/\p{Lu}+/gu)].map((m) => m[0].length));

/**
 * `key: "value"` string entries from the typed translation tables. Handles
 * plain and quoted keys, double/single-quoted values with escapes. Template
 * literals and computed values yield nothing rather than guessing.
 */
const STRING_ESCAPES = { n: "\n", r: "\r", t: "\t" };

const translationEntries = (source) => {
  const entries = [];
  const pattern =
    /(?:^|[,{]\s*)(?:"([^"]+)"|'([^']+)'|([\w$]+))\s*:\s*("((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/gm;
  for (const match of source.matchAll(pattern)) {
    const key = match[1] ?? match[2] ?? match[3];
    const raw = match[5] ?? match[6] ?? "";
    const value = raw.replace(
      /\\(.)/g,
      (sequence, escaped) => STRING_ESCAPES[escaped] ?? escaped,
    );
    entries.push([key, value]);
  }
  return entries;
};

const localeFindings = () => {
  const absolute = join(REPO_ROOT, TRANSLATIONS_FILE);
  if (!existsSync(absolute)) return [];
  const findings = [];
  for (const [key, value] of translationEntries(readFileSync(absolute, "utf8"))) {
    const prose = proseOf(value);
    for (const pattern of CLICHES) {
      const hit = pattern.exec(prose);
      if (hit)
        findings.push({
          file: TRANSLATIONS_FILE,
          key,
          kind: "ai-cliche",
          detail: `"${hit[0]}" in ${JSON.stringify(value)}`,
        });
    }
    for (const pattern of PLACEHOLDERS) {
      const hit = pattern.exec(prose);
      if (hit)
        findings.push({
          file: TRANSLATIONS_FILE,
          key,
          kind: "placeholder",
          detail: `"${hit[0]}" in ${JSON.stringify(value)}`,
        });
    }
    if (
      isAllUppercase(prose) &&
      prose.split(/\s+/).filter(Boolean).length >= 2 &&
      longestUppercaseRun(prose) >= 3
    ) {
      findings.push({
        file: TRANSLATIONS_FILE,
        key,
        kind: "typed-uppercase",
        detail: JSON.stringify(value),
      });
    }
  }
  return findings;
};

const brandColorFindings = () => {
  const tokenAbsolute = join(REPO_ROOT, TOKEN_FILE);
  if (!existsSync(tokenAbsolute)) return [];
  const tokens = readFileSync(tokenAbsolute, "utf8");
  const bannedHex = new Set(
    [...tokens.matchAll(/--(?:color-)?primary(?:-pressed)?:\s*(#[0-9a-fA-F]{6})/g)].map((m) =>
      m[1].toLowerCase(),
    ),
  );
  const bannedRgb = new Set(
    [...tokens.matchAll(/--primary-rgb:\s*(\d+,\s*\d+,\s*\d+)/g)].map((m) =>
      m[1].replace(/\s+/g, ""),
    ),
  );
  if (bannedHex.size === 0 && bannedRgb.size === 0) return [];

  const files = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"))
    .filter(
      (file) =>
        BRAND_COLOR_GLOBS.some((g) => g.test(file)) &&
        !BRAND_COLOR_EXEMPT.some((g) => g.test(file)),
    );

  const findings = [];
  for (const file of files) {
    const text = readFileSync(join(REPO_ROOT, file), "utf8");
    const lower = text.toLowerCase();
    const compact = text.replace(/\s+/g, "");
    for (const hex of bannedHex) {
      if (lower.includes(hex))
        findings.push({
          file,
          key: hex,
          kind: "brand-color",
          detail: `${hex} -> use the --primary token`,
        });
    }
    for (const rgb of bannedRgb) {
      if (compact.includes(rgb))
        findings.push({
          file,
          key: rgb,
          kind: "brand-color",
          detail: `rgb(${rgb}) -> use rgba(var(--primary-rgb), a)`,
        });
    }
  }
  return findings;
};

const keyOf = (finding) => `${finding.kind} :: ${finding.file} :: ${finding.key}`;

const mode = process.argv[2];
const findings = [...localeFindings(), ...brandColorFindings()];
const current = findings.map(keyOf).sort();

if (mode === "--write-baseline") {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`copy-baseline.json written: ${current.length} entries`);
  process.exit(0);
}

if (mode === "--check") {
  const baseline = new Set(
    existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : [],
  );
  const fresh = findings.filter((finding) => !baseline.has(keyOf(finding)));
  if (fresh.length) {
    console.error("Copy-register violations not in the committed baseline:");
    for (const finding of fresh)
      console.error(`  [${finding.kind}] ${finding.file} :: ${finding.key} :: ${finding.detail}`);
    console.error(
      "\nSay the plain thing the string does; store copy in natural case (text-transform owns presentation);\n" +
        "ship real strings, never placeholders; accents come from tokens, never raw literals.\n" +
        "The baseline (tools/copy-baseline.json) may only shrink.",
    );
    process.exit(1);
  }
  const stale = [...baseline].filter((entry) => !current.includes(entry));
  if (stale.length) {
    console.error(
      `Baseline is stale (${stale.length} fixed entries still listed). Run --write-baseline to shrink it.`,
    );
  }
  process.exit(0);
}

console.error("usage: check-copy.mjs --check | --write-baseline");
process.exit(2);
