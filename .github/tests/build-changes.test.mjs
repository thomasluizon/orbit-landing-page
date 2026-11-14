import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/build.yml", import.meta.url), "utf8");
const stepName = "Select the checks this change needs";
const baseFiles = {
  "src/pages/about.md": "# About\n\nOrbit tracks habits.\n",
  "src/lib/x.ts": "export const x = 1;\n",
  "README.md": "# Orbit Landing Page\n",
  LICENSE: "MIT License\n",
  ".claude/notes.md": "# Notes\n",
  "public/brand/README.md": "# Brand\n",
};

function changesScript() {
  const step = workflow.split(`- name: ${stepName}\n`)[1]?.split(/\n {6}- /)[0];
  assert.ok(step, `Missing step: ${stepName}`);
  const script = step.split("        run: |\n")[1];
  assert.ok(script, `Missing shell script: ${stepName}`);
  return script.replace(/^ {10}/gm, "");
}

function pullRequest(t, change) {
  const root = mkdtempSync(join(tmpdir(), "landing-build-changes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "repository");
  const runnerTemp = join(root, "runner");
  const output = join(runnerTemp, "output");
  mkdirSync(cwd);
  mkdirSync(runnerTemp);
  writeFileSync(output, "");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Build Test");
  git("config", "user.email", "build@example.org");
  for (const [path, content] of Object.entries(baseFiles)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
  git("add", "--all");
  git("commit", "--quiet", "-m", "Base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "--quiet", "-c", "pull-request");
  change({ cwd, git });
  git("add", "--all");
  git("commit", "--quiet", "-m", "Change");
  return {
    git,
    run: (overrides = {}) => {
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", changesScript()],
        {
          cwd,
          encoding: "utf8",
          env: {
            ...env,
            GITHUB_EVENT_NAME: "pull_request",
            GITHUB_BASE_REF: "main",
            GITHUB_OUTPUT: output,
            RUNNER_TEMP: runnerTemp,
            ...overrides,
          },
        },
      );
      return { ...result, output: readFileSync(output, "utf8") };
    },
  };
}

const edit =
  (path) =>
  ({ cwd }) =>
    writeFileSync(join(cwd, path), "Changed.\n", { flag: "a" });

for (const [name, change, product, renamed = false] of [
  [
    "a rename out of src/ to a root Markdown file",
    ({ git }) => git("mv", "src/pages/about.md", "ABOUT.md"),
    "true",
    true,
  ],
  [
    "a move of src/lib/x.ts to .claude/x.ts",
    ({ git }) => git("mv", "src/lib/x.ts", ".claude/x.ts"),
    "true",
    true,
  ],
  ["a delete of a product file", ({ git }) => git("rm", "--quiet", "src/lib/x.ts"), "true"],
  ["a root Markdown file only", edit("README.md"), "false"],
  ["a nested Markdown file", edit("public/brand/README.md"), "true"],
  ["a .claude/ file only", edit(".claude/notes.md"), "false"],
  ["LICENSE only", edit("LICENSE"), "false"],
]) {
  test(`Build changes: ${name} sets product=${product}`, (t) => {
    const pull = pullRequest(t, change);
    if (renamed) {
      assert.match(pull.git("diff", "--name-status", "origin/main...HEAD"), /^R100\t/);
    }
    const result = pull.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, `product=${product}\n`);
  });
}

test("Build changes: a failed diff fails the step and never skips the product checks", (t) => {
  const result = pullRequest(t, edit("README.md")).run({ GITHUB_BASE_REF: "missing" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /origin\/missing/);
  assert.equal(result.output, "");
});
