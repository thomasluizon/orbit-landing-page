import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionFindings } from "../lib/attribution-lines.mjs";

const checker = fileURLToPath(new URL("../check-attribution.mjs", import.meta.url));

/** Built from parts, so this source file never holds an attribution line of its own. */
const TRAILER = ["Co", "Authored", "By: Claude Opus 5.5 <noreply@anthropic.com>"].join("-");
const GENERATED = `\u{1F916} ${["Generated", "with"].join(" ")} [Claude Code](https://claude.com/claude-code)`;
const RULE = 'Never add a `Co-Authored-By:` trailer or a "Generated with" line.';

const run = (args) => spawnSync(process.execPath, [checker, ...args], { encoding: "utf8" });
const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

/**
 * Commits through `git commit-tree`, which runs no hook, so a local commit-msg hook that strips
 * trailers cannot clean the fixture before the guard reads it.
 */
const commitRange = (label, messages) => {
  const root = mkdtempSync(join(tmpdir(), `attribution-${label}-`));
  git(root, ["init", "-q", "--initial-branch=main"]);
  git(root, ["config", "user.email", "gate@orbit.test"]);
  git(root, ["config", "user.name", "Orbit Gate"]);
  writeFileSync(join(root, "file.txt"), "base\n");
  git(root, ["add", "file.txt"]);
  const base = git(root, ["commit-tree", git(root, ["write-tree"]), "-m", "base"]);
  let head = base;
  for (const message of messages) {
    head = git(root, ["commit-tree", `${head}^{tree}`, "-p", head, "-m", message]);
  }
  return ["--root", root, "--range", `${base}..${head}`];
};

/**
 * A pull request head that merges `redesign/main`, whose tainted commit already landed there, and
 * then adds `newMessage`. The repository records `main` and `redesign/main` as `origin` refs, the
 * same shape that a checkout with all history gives the Guards job.
 */
const mergeHistory = (label, newMessage) => {
  const root = mkdtempSync(join(tmpdir(), `attribution-merge-${label}-`));
  git(root, ["init", "-q", "--initial-branch=main"]);
  git(root, ["config", "user.email", "gate@orbit.test"]);
  git(root, ["config", "user.name", "Orbit Gate"]);
  writeFileSync(join(root, "file.txt"), "base\n");
  git(root, ["add", "file.txt"]);
  const tree = git(root, ["write-tree"]);
  const base = git(root, ["commit-tree", tree, "-m", "base"]);
  const landed = git(root, ["commit-tree", tree, "-p", base, "-m", `feat: landed\n\n${TRAILER}`]);
  const merge = git(root, ["commit-tree", tree, "-p", base, "-p", landed, "-m", "chore: carry"]);
  const head = git(root, ["commit-tree", tree, "-p", merge, "-m", newMessage]);
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  git(root, ["update-ref", "refs/remotes/origin/redesign/main", landed]);
  return { root, landed, range: ["--root", root, "--range", `${base}..${head}`] };
};

const LONG_LIVED = ["--not", "origin/main", "--not", "origin/redesign/main"];

const bodyFile = (label, text) => {
  const path = join(mkdtempSync(join(tmpdir(), `attribution-body-${label}-`)), "body.md");
  writeFileSync(path, text);
  return ["--body-file", path];
};

test("attribution lines: a rule that names both strings has no finding", () => {
  assert.deepEqual(attributionFindings("body", RULE), []);
});

test("attribution lines: each banned line is one finding with its line number", () => {
  assert.deepEqual(attributionFindings("body", `Work.\r\n\r\n${TRAILER}`), [
    `body line 3: a co-author trailer: ${TRAILER}`,
  ]);
  assert.equal(attributionFindings("body", `  ${TRAILER.toLowerCase()}`).length, 1);
  assert.match(
    attributionFindings("commit abc", GENERATED)[0],
    /^commit abc line 1: a generated-with line/,
  );
  assert.equal(attributionFindings("body", `${TRAILER}\n${GENERATED}\n${TRAILER}`).length, 3);
});

test("commit range: clean commits that name the rule pass", () => {
  const result = run(
    commitRange("clean", [
      "feat(tools): add the attribution guard\n\nThe guard refuses two kinds of line.",
      `docs: state the rule\n\n${RULE}`,
    ]),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Attribution guard passed/);
});

test("commit range: each banned line in any commit fails", () => {
  const trailer = run(
    commitRange("trailer", ["feat: one", `fix: two\n\nBody text.\n\n${TRAILER}`]),
  );
  assert.equal(trailer.status, 1);
  assert.match(
    trailer.stderr,
    /commit [0-9a-f]{12} line 5: a co-author trailer: Co-Authored-By: Claude/,
  );
  const lowercase = run(commitRange("lowercase", [`fix: three\n\n${TRAILER.toLowerCase()}`]));
  assert.equal(lowercase.status, 1);
  assert.match(lowercase.stderr, /a co-author trailer/);
  const generated = run(commitRange("generated", [`feat: four\n\n${GENERATED}`]));
  assert.equal(generated.status, 1);
  assert.match(generated.stderr, /a generated-with line/);
});

test("commit range: a merged commit that a long-lived branch reaches fails without --not", () => {
  const { landed, range } = mergeHistory("unexcluded", "feat: new work");
  const result = run(range);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(`commit ${landed.slice(0, 12)} line 3: a co-author trailer`),
  );
});

test("commit range: --not skips a landed tainted commit and still checks new commits", () => {
  const clean = run([...mergeHistory("excluded-clean", "feat: new work").range, ...LONG_LIVED]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Attribution guard passed/);
  const { landed, range } = mergeHistory("excluded-tainted", `feat: new work\n\n${GENERATED}`);
  const tainted = run([...range, ...LONG_LIVED]);
  assert.equal(tainted.status, 1);
  assert.match(tainted.stderr, /line 3: a generated-with line/);
  assert.doesNotMatch(tainted.stderr, new RegExp(landed.slice(0, 12)));
});

test("body file: a clean body passes and each banned line fails", () => {
  const clean = run(bodyFile("clean", `## Summary\n\n${RULE}\n`));
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /passed for the pull request body/);
  const trailer = run(bodyFile("trailer", `## Summary\n\nWork.\n\n${TRAILER}\n`));
  assert.equal(trailer.status, 1);
  assert.match(trailer.stderr, /pull request body line 5: a co-author trailer/);
  const generated = run(bodyFile("generated", `## Summary\n\n${GENERATED}\n`));
  assert.equal(generated.status, 1);
  assert.match(generated.stderr, /pull request body line 3: a generated-with line/);
});

test("usage errors exit 2", () => {
  const range = commitRange("usage", ["feat: five"]);
  const root = range[1];
  const cases = [
    [["--root", root], /pass exactly one of --range and --body-file/],
    [[...range, "--body-file", join(root, "file.txt")], /pass exactly one/],
    [["--root", root, "--range", "main...HEAD"], /--range must be/],
    [["--root", root, "--range", "missing..HEAD"], /git log missing\.\.HEAD failed/],
    [["--body-file", join(root, "missing.md")], /cannot read/],
    [["--range"], /--range requires a value/],
    [["--unknown", "x"], /unknown argument: --unknown/],
    [["--body-file", join(root, "file.txt"), "--not", "main"], /--not requires --range/],
    [[...range, "--not", "-p"], /--not must be one ref, got "-p"/],
    [[...range, "--not", "a..b"], /--not must be one ref/],
    [[...range, "--not", "origin/missing"], /git log .* --not origin\/missing failed/],
  ];
  for (const [args, stderr] of cases) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, stderr);
  }
});
