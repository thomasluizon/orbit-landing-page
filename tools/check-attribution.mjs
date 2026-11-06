#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attributionFindings } from "./lib/attribution-lines.mjs";

const USAGE = `usage: check-attribution.mjs (--range <base>..<head> [--not <ref>]... | --body-file <path>) [--root <repository>]

  Fails when the input carries an attribution line: a co-author trailer (a line that starts with
  "Co-Authored-By:", in any letter case) or a line that starts with "Generated with", after any
  emoji or punctuation. A mention of either string inside a sentence is not an attribution line,
  so a rule that names them still passes.

  --range <base>..<head>  check every commit message in this git revision range
  --not <ref>             skip the commits that this ref reaches; repeat it for each ref
  --body-file <path>      check the pull request body in this file
  --root <repository>     read commits from this repository instead of the script's repository
  --help, -h              print this usage and exit 0

exit codes: 0 no attribution line, 1 an attribution line was found, 2 usage error or unreadable input`;

const fail = (message) => {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
};

const FLAGS = {
  "--range": "range",
  "--not": "excluded",
  "--body-file": "bodyFile",
  "--root": "root",
};

const parseArguments = (argv) => {
  const options = {
    range: null,
    excluded: [],
    bodyFile: null,
    root: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    const key = FLAGS[flag];
    if (key === undefined) fail(`unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) {
      fail(`${flag} requires a value`);
    }
    if (key === "excluded") options.excluded.push(value);
    else options[key] = key === "range" ? value : resolve(value);
    index++;
  }
  if ((options.range === null) === (options.bodyFile === null)) {
    fail("pass exactly one of --range and --body-file");
  }
  if (
    options.range !== null &&
    (!/^[^\s.]\S*\.\.[^\s.]\S*$/.test(options.range) || options.range.includes("..."))
  ) {
    fail(`--range must be <base>..<head>, got "${options.range}"`);
  }
  if (options.excluded.length > 0 && options.range === null) fail("--not requires --range");
  const invalidRef = options.excluded.find((ref) => !/^[^\s-]\S*$/.test(ref) || ref.includes(".."));
  if (invalidRef !== undefined) fail(`--not must be one ref, got "${invalidRef}"`);
  return options;
};

/**
 * Every commit in the range that no excluded ref reaches, as `{ sha, message }`. A range or a ref
 * that git cannot read is a usage error.
 */
const commitMessages = (root, range, excluded) => {
  const revisions = excluded.length > 0 ? [range, "--not", ...excluded] : [range];
  const result = spawnSync(
    "git",
    ["-C", root, "log", "--format=%H%x00%B%x1e", ...revisions, "--"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    fail(
      `git log ${revisions.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`,
    );
  }
  return result.stdout
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf("\0");
      return { sha: record.slice(0, separator), message: record.slice(separator + 1) };
    });
};

const readBody = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    return fail(`cannot read ${path}: ${error.message}`);
  }
};

const options = parseArguments(process.argv.slice(2));
const subject = options.range === null ? "the pull request body" : options.range;
const problems =
  options.range === null
    ? attributionFindings("pull request body", readBody(options.bodyFile))
    : commitMessages(options.root, options.range, options.excluded).flatMap(({ sha, message }) =>
        attributionFindings(`commit ${sha.slice(0, 12)}`, message),
      );
if (problems.length > 0) {
  console.error(`::error::Attribution lines are not allowed in ${subject}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    options.range === null
      ? "Remove each line: edit the body."
      : "Remove each line: reword the commit.",
  );
  process.exit(1);
}
console.log(`Attribution guard passed for ${subject}.`);
