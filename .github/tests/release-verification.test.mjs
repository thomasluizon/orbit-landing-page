import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/release.yml", import.meta.url), "utf8");

function releaseJob(environment) {
  return workflow.split(`  ${environment}:\n`)[1].split(/^  \w+:$/m)[0];
}

function shellStep(environment, name) {
  const step = releaseJob(environment)
    .split(`- name: ${name}\n`)[1]
    ?.split(/\n      - /)[0];
  assert.ok(step, `Missing step: ${name}`);
  const script = step.split("        run: |\n")[1];
  assert.ok(script, `Missing shell script: ${name}`);
  return script.replace(/^          /gm, "");
}

function shellHarness(t, environment) {
  const cwd = mkdtempSync(join(tmpdir(), "landing-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release@example.org");
  git("commit", "--allow-empty", "-m", "Planned commit");
  const planned = git("rev-parse", "HEAD");
  git("commit", "--allow-empty", "-m", "New branch head");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "--quiet", "--detach", planned);
  const output = join(cwd, "output");
  const env = {
    ...process.env,
    GITHUB_REF: "refs/heads/main",
    GITHUB_OUTPUT: output,
    RELEASE_ENVIRONMENT: environment,
    RELEASE_BRANCH: "main",
    RELEASE_SHA: planned,
    DISPATCH_SHA: planned,
  };
  return {
    cwd,
    planned,
    git,
    output: () => readFileSync(output, "utf8"),
    step: (name, overrides = {}) =>
      spawnSync("bash", ["-e", "-c", shellStep(environment, name)], {
        cwd,
        env: { ...env, ...overrides },
        encoding: "utf8",
      }),
  };
}

for (const environment of ["staging", "production"]) {
  test(`${environment}: checks out the selected SHA with branch history`, () => {
    const checkout = releaseJob(environment)
      .split("- uses: actions/checkout@")[1]
      .split("\n      - ")[0];
    assert.match(checkout, /ref: \$\{\{ steps\.selection\.outputs\.sha \}\}/);
    assert.match(checkout, /fetch-depth: 0/);
  });

  test(`${environment}: validates the selected SHA and branch ancestry`, (t) => {
    const shell = shellHarness(t, environment);
    assert.equal(shell.step("Validate release selection").status, 0);
    assert.match(shell.output(), new RegExp(`sha=${shell.planned}`));
    assert.equal(shell.step("Verify selected commit").status, 0);
    const different = shell.git("rev-parse", "refs/remotes/origin/main");
    const mismatch = shell.step("Verify selected commit", { RELEASE_SHA: different });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /Checkout does not match/);
    const unrelatedCommit = shell.git(
      "commit-tree",
      shell.git("rev-parse", "HEAD^{tree}"),
      "-m",
      "Unrelated commit",
    );
    shell.git("update-ref", "refs/remotes/origin/main", unrelatedCommit);
    const unrelated = shell.step("Verify selected commit");
    assert.notEqual(unrelated.status, 0);
  });

  test(`${environment}: rejects invalid selections before checkout`, (t) => {
    const shell = shellHarness(t, environment);
    for (const overrides of [
      { RELEASE_SHA: "main" },
      { RELEASE_SHA: shell.planned.slice(0, 7) },
      { RELEASE_SHA: "g".repeat(40) },
      { RELEASE_BRANCH: "refs/heads/main" },
      { RELEASE_BRANCH: "" },
      { RELEASE_BRANCH: "main..other" },
      { GITHUB_REF: "refs/heads/other" },
    ]) {
      assert.notEqual(shell.step("Validate release selection", overrides).status, 0);
    }
    const empty = shell.step("Validate release selection", { RELEASE_SHA: "" });
    assert.equal(empty.status, environment === "production" ? 0 : 1);
    if (environment === "production") {
      assert.match(shell.output(), new RegExp(`sha=${shell.planned}`));
      assert.notEqual(
        shell.step("Validate release selection", { RELEASE_BRANCH: "feature" }).status,
        0,
      );
    }
  });
}

for (const [environment, name] of [
  ["staging", "Deploy and verify selected commit"],
  ["production", "Deploy selected commit"],
]) {
  test(`${environment}: the deploy step names its environment for the release script`, () => {
    const step = releaseJob(environment).split(`- name: ${name}\n`)[1];
    assert.ok(step, `Missing step: ${name}`);
    assert.match(step, new RegExp(`\\n {10}RELEASE_ENVIRONMENT: ${environment}\\n`));
  });

  test(`${environment}: runs the release script of the dispatch commit, not of the selected commit`, (t) => {
    const shell = shellHarness(t, environment);
    const runnerTemp = mkdtempSync(join(tmpdir(), "landing-release-temp-"));
    t.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
    const script = join(shell.cwd, ".github", "scripts", "release-landing.mjs");
    shell.git("checkout", "--quiet", "--detach", "refs/remotes/origin/main");
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(
      script,
      "console.log(`release ${process.env.RELEASE_ENVIRONMENT} from the dispatch commit`);\n",
    );
    shell.git("add", ".github/scripts/release-landing.mjs");
    shell.git("commit", "--quiet", "-m", "Release script");
    const dispatch = shell.git("rev-parse", "HEAD");
    shell.git("update-ref", "refs/remotes/origin/main", dispatch);
    shell.git("checkout", "--quiet", "--detach", shell.planned);
    assert.equal(existsSync(script), false);
    const result = shell.step(name, { GITHUB_SHA: dispatch, RUNNER_TEMP: runnerTemp });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `release ${environment} from the dispatch commit\n`);
  });
}
