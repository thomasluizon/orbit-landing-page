#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(REPO_ROOT, "tools", "dash-baseline.json");

const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)\.claude\//,
  /(^|\/)dist\//,
  /package-lock\.json$/,
  /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot|pdf|zip|jar|keystore|p8|p12|mp4|webm|svg)$/i,
  /(^|\/)tools\/check-dashes\.mjs$/,
  /(^|\/)tools\/dash-baseline\.json$/,
];

const shouldSkip = (file) => {
  const normalized = file.replaceAll("\\", "/");
  return SKIP.some((pattern) => pattern.test(normalized));
};

export function dashFindings(text, { allowNumericRanges = true } = {}) {
  const allowedEnDash = new Set();
  if (allowNumericRanges) {
    for (const match of text.matchAll(/\d\s?–\s?\d/g)) {
      allowedEnDash.add(match.index + match[0].indexOf("–"));
    }
  }
  const findings = [];
  for (const match of text.matchAll(/[—–]/g)) {
    if (match[0] === "–" && allowedEnDash.has(match.index)) continue;
    const line = text.slice(0, match.index).split("\n").length;
    const snippet = text
      .slice(Math.max(0, match.index - 25), match.index + 26)
      .replace(/\s+/g, " ")
      .trim();
    findings.push({ line, kind: match[0] === "—" ? "em dash" : "en dash", snippet });
  }
  return findings;
}

const checkFiles = (files, explicit = false) => {
  const perFile = new Map();
  for (const file of files) {
    if (!explicit && shouldSkip(file)) continue;
    const absolute = resolve(REPO_ROOT, file);
    if (!existsSync(absolute)) {
      const deleted = execFileSync("git", ["ls-files", "--deleted", "-z", "--", file], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).split("\0");
      const stagedDeleted = execFileSync(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=D", "-z", "--", file],
        { cwd: REPO_ROOT, encoding: "utf8" },
      ).split("\0");
      if (
        [...deleted, ...stagedDeleted].includes(relative(REPO_ROOT, absolute).replaceAll("\\", "/"))
      )
        continue;
      console.error(`Cannot read requested file ${file}: file does not exist`);
      process.exit(2);
    }
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch (error) {
      console.error(`Cannot read requested file ${file}: ${error.message}`);
      process.exit(2);
    }
    if (shouldSkip(file) || text.includes("\u0000")) continue;
    const findings = dashFindings(text);
    if (findings.length) perFile.set(file.replaceAll("\\", "/"), findings);
  }
  return perFile;
};

const trackedFiles = () =>
  execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);

const printFindings = (perFile, limitPerFile = 3) => {
  for (const [file, findings] of perFile) {
    console.error(`${file}: ${findings.length}`);
    for (const finding of findings.slice(0, limitPerFile)) {
      console.error(`  L${finding.line} ${finding.kind}: …${finding.snippet}…`);
    }
  }
};

const HOW_TO_FIX =
  "\nEm dashes are a banned LLM tell in Orbit prose. Use a plain hyphen (-), a comma, or restructure.\nEn dashes are allowed only inside a numeric range (1–10).\nPre-existing debt lives in tools/dash-baseline.json and may only shrink (regenerate with --write-baseline AFTER removing dashes, never to admit new ones).";

const USAGE = `usage: check-dashes.mjs --files <path>... | --check-baseline | --write-baseline | --text "<string>"

  --files <path>...   check exactly these files (exit 1 on any hit above the baseline)
  --check-baseline    full tree vs tools/dash-baseline.json (exit 1 on growth or missing files)
  --write-baseline    regenerate tools/dash-baseline.json; refuses growth
  --allow-growth      explicitly permit growth with --write-baseline
  --text "<string>"   check a string, for PR titles and bodies (exit 1 on any hit)
  --help, -h          print this usage and exit 0

exit codes: 0 clean, 1 a banned dash or missing baseline file, 2 usage error`;

const isMain =
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  const mode = process.argv[2];

  if (mode === "--text") {
    const findings = dashFindings(process.argv.slice(3).join(" "));
    if (findings.length) {
      console.error(`Banned dash in the given text:`);
      for (const finding of findings) console.error(`  ${finding.kind}: …${finding.snippet}…`);
      console.error(HOW_TO_FIX);
      process.exit(1);
    }
    process.exit(0);
  }

  if (mode === "--files") {
    const files = process.argv.slice(3);
    if (files.length === 0) {
      console.error(USAGE);
      process.exit(2);
    }
    const baseline = existsSync(BASELINE_PATH)
      ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
      : {};
    const perFile = checkFiles(files, true);
    const offending = new Map(
      [...perFile].filter(([file, findings]) => findings.length > (baseline[file] ?? 0)),
    );
    if (offending.size) {
      console.error("Banned dash written into files (count exceeds the committed baseline):");
      printFindings(offending);
      console.error(HOW_TO_FIX);
      process.exit(1);
    }
    process.exit(0);
  }

  if (mode === "--check-baseline" || mode === "--write-baseline") {
    const perFile = checkFiles(trackedFiles());
    const current = Object.fromEntries(
      [...perFile]
        .map(([file, findings]) => [file, findings.length])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
    if (mode === "--write-baseline") {
      const baseline = existsSync(BASELINE_PATH)
        ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
        : {};
      if (
        !process.argv.includes("--allow-growth") &&
        Object.entries(current).some(([file, count]) => count > (baseline[file] ?? 0))
      ) {
        console.error("Dash baseline growth refused; --allow-growth is required.");
        process.exit(1);
      }
      writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
      console.log(
        `dash-baseline.json written: ${Object.keys(current).length} files, ${Object.values(current).reduce((a, b) => a + b, 0)} dashes`,
      );
      process.exit(0);
    }
    const baseline = existsSync(BASELINE_PATH)
      ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
      : {};
    const grew = Object.entries(current).filter(([file, count]) => count > (baseline[file] ?? 0));
    const missing = Object.keys(baseline).filter((file) => !existsSync(resolve(REPO_ROOT, file)));
    if (missing.length) {
      console.error("Dash baseline names missing files:");
      for (const file of missing) console.error(`  ${file}`);
    }
    if (grew.length) {
      console.error("Dash count grew beyond the baseline:");
      for (const [file, count] of grew)
        console.error(`  ${file}: ${count} (baseline ${baseline[file] ?? 0})`);
      console.error(HOW_TO_FIX);
    }
    if (missing.length || grew.length) {
      process.exit(1);
    }
    process.exit(0);
  }

  console.error(USAGE);
  process.exit(2);
}
