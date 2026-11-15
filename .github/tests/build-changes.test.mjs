import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(new URL("../workflows/build.yml", import.meta.url), "utf8");
const prTextWorkflow = readFileSync(new URL("../workflows/pr-text.yml", import.meta.url), "utf8");
const lefthook = readFileSync(new URL("../../lefthook.yml", import.meta.url), "utf8");
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

function repository(t, files) {
  const root = mkdtempSync(join(tmpdir(), "landing-build-changes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "repository");
  mkdirSync(cwd);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Build Test");
  git("config", "user.email", "build@example.org");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
  git("add", "--all");
  git("commit", "--quiet", "-m", "Base");
  return { root, cwd, env, git };
}

function pullRequest(t, change) {
  const { root, cwd, env, git } = repository(t, baseFiles);
  const runnerTemp = join(root, "runner");
  const output = join(runnerTemp, "output");
  mkdirSync(runnerTemp);
  writeFileSync(output, "");
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
  ({ cwd }) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), "Changed.\n", { flag: "a" });
  };

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

function buildStep(name) {
  const step = workflow.split(`- name: ${name}\n`)[1]?.split(/\n {6}- /)[0];
  assert.ok(step, `Missing Build step: ${name}`);
  return {
    condition: step.match(/^ {8}if: (.+)$/m)?.[1],
    command: step.match(/^ {8}run: (.+)$/m)?.[1],
  };
}

function lefthookBlock(name) {
  const block = lefthook.split(`\n    ${name}:\n`)[1]?.split(/\n {4}\S/)[0];
  assert.ok(block, `Missing lefthook command: ${name}`);
  return block;
}

function lefthookCommand(name) {
  return lefthookBlock(name).match(/^ {6}run: (.+)$/m)?.[1];
}

function stepRuns(condition, context) {
  const expression = condition?.match(/^\$\{\{ (.+) \}\}$/)?.[1];
  assert.ok(expression, `stepRuns does not evaluate the step condition ${condition}`);
  return expression.split(" && ").every((term) => {
    if (term === "!cancelled()") return true;
    const [, name, value] = term.match(/^([\w.]+) == '([^']*)'$/) ?? [];
    assert.ok(
      name && Object.hasOwn(context, name),
      `stepRuns does not evaluate the condition term ${term}; add the term to stepRuns`,
    );
    return context[name] === value;
  });
}

function pullRequestContext(t, path) {
  const result = pullRequest(t, edit(path)).run();
  assert.equal(result.status, 0, result.stderr);
  const product = result.output.match(/^product=(true|false)$/m)?.[1];
  assert.ok(product, result.output);
  return {
    "github.event_name": "pull_request",
    "steps.changes.outcome": "success",
    "steps.changes.outputs.product": product,
    "steps.install.outcome": "failure",
  };
}

const wholeTreeGuards = [
  { step: "Copy follows the register", hook: "copy-register" },
  { step: "Root holds only declared entries", hook: "root-allowlist" },
];

for (const { step, hook } of wholeTreeGuards) {
  test(`Build: "${step}" runs the command of the lefthook ${hook} hook`, () => {
    assert.equal(buildStep(step).command, lefthookCommand(hook));
  });

  test(`Build: "${step}" runs on each push to main, also when npm ci fails`, () => {
    const context = {
      "github.event_name": "push",
      "steps.changes.outcome": "success",
      "steps.changes.outputs.product": "true",
      "steps.install.outcome": "failure",
    };
    assert.equal(stepRuns(buildStep(step).condition, context), true);
  });
}

test("Build: the whole-tree guards also run for a pull request that changes no product path", (t) => {
  const context = pullRequestContext(t, "README.md");
  assert.equal(context["steps.changes.outputs.product"], "false");
  for (const { step } of wholeTreeGuards) {
    assert.equal(stepRuns(buildStep(step).condition, context), true, step);
  }
});

const lefthookBinary = fileURLToPath(new URL("../../node_modules/.bin/lefthook", import.meta.url));

for (const [path, runs] of [
  ["src/i18n/translations.ts", true],
  ["src/components/Hero.astro", true],
  ["src/styles/global.css", true],
  ["tools/check-copy.mjs", true],
  ["tools/copy-baseline.json", true],
  ["src/config/validate-turnstile.mjs", false],
]) {
  test(`lefthook ${runs ? "runs" : "skips"} copy-register when ${path} is staged`, (t) => {
    const copyRegister = lefthookBlock("copy-register").replace(
      /^ {6}run: .+$/m,
      "      run: echo copy-register-ran",
    );
    const { cwd, env, git } = repository(t, {
      "lefthook.yml": `pre-commit:\n  commands:\n    copy-register:\n${copyRegister}\n`,
    });
    edit(path)({ cwd });
    git("add", path);
    const lefthookEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith("LEFTHOOK")),
    );
    const result = spawnSync(lefthookBinary, ["run", "pre-commit"], {
      cwd,
      env: lefthookEnv,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("copy-register-ran"), runs, result.stdout);
  });
}

/**
 * Reads the sparse checkout inputs of the PR Text checkout step the way actions/checkout reads
 * them: one pattern per line, and cone mode unless `sparse-checkout-cone-mode` is false.
 * https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/src/input-helper.ts
 */
function prTextSparseCheckout() {
  const step = prTextWorkflow
    .split(/^ {6}- uses: actions\/checkout@.+\n/m)[1]
    ?.split(/\n {6}- /)[0];
  assert.ok(step, "Missing checkout step in PR Text");
  const [, value, block] = step.match(/^ {10}sparse-checkout: (.+)\n((?: {12}.+\n)*)/m) ?? [];
  assert.ok(value, "The PR Text checkout step has no sparse-checkout input");
  const patterns = (value === "|" ? block : value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const coneMode = step.match(/^ {10}sparse-checkout-cone-mode: (.+)$/m)?.[1] ?? "true";
  return { patterns, coneMode: coneMode.toUpperCase() === "TRUE" };
}

test("PR Text: the sparse checkout keeps .node-version for setup-node and tools for the checks", (t) => {
  const { patterns, coneMode } = prTextSparseCheckout();
  const { cwd, git } = repository(t, {
    ".node-version": "22.23.5\n",
    "tools/check-dashes.mjs": "export {};\n",
    "src/lib/x.ts": "export const x = 1;\n",
  });
  git("sparse-checkout", "set", coneMode ? "--cone" : "--no-cone", ...patterns);
  assert.equal(existsSync(join(cwd, "src/lib/x.ts")), false, "The sparse checkout kept src/");
  assert.ok(existsSync(join(cwd, ".node-version")), "The sparse checkout drops .node-version");
  assert.ok(existsSync(join(cwd, "tools/check-dashes.mjs")), "The sparse checkout drops tools/");
});

test("PR Text sets up Node with the same pinned action and .node-version as Build", () => {
  const setupNode = workflow.match(
    /^ {6}- uses: actions\/setup-node@.+\n {8}with:\n(?: {10}.+\n)+/m,
  );
  assert.ok(setupNode, "Missing setup-node step in Build");
  assert.match(setupNode[0], /node-version-file: \.node-version\n/);
  assert.ok(prTextWorkflow.includes(setupNode[0]), "PR Text does not copy the setup-node step");
});
