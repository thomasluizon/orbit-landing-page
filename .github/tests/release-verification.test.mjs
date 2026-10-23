import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/release.yml", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../src/layouts/Layout.astro", import.meta.url), "utf8");
const sha = "6f1d70422e37f343093fa5ef6561f483e4b6dc20";
const previousSha = "30c06d7e14c6fa9d749464510e8e16674c9028ff";
const serviceOrigin = "https://orbit-landing-staging.onrender.com";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function releaseJob(environment) {
  return workflow.split(`  ${environment}:\n`)[1].split(/^  \w+:$/m)[0];
}

function releaseHarness(environment, { staging = {}, force = "false", head = sha } = {}) {
  const job = releaseJob(environment);
  const body = job.split("node --input-type=module <<'NODE'\n")[1].split("          NODE")[0];
  const deploys = [];
  const requests = [];
  const summaries = [];
  const productionOrigin = "https://orbit-landing.onrender.com";
  const env = {
    RELEASE_SHA: sha,
    RELEASE_BRANCH: "main",
    FORCE_UNSTAGED: force,
    RENDER_API_KEY: "render-token",
    RENDER_PRODUCTION_SERVICE_ID: "production-service",
    RENDER_STAGING_SERVICE_ID: "staging-service",
    GH_TOKEN: "github-token",
    GITHUB_REPOSITORY: "owner/landing",
    GITHUB_RUN_ID: "1",
    GITHUB_STEP_SUMMARY: "/summary",
    PUBLIC_APP_URL: "https://app-staging.useorbit.org",
    PUBLIC_ANDROID_INSTALL_URL:
      "https://play.google.com/store/apps/details?id=org.useorbit.app.staging",
  };
  const marker = (commit) =>
    layout
      .match(/<meta name="orbit-build" content=\{renderBuildCommit\} \/>/)[0]
      .replace("{renderBuildCommit}", `"${commit}"`);
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({ url: parsed, options });
    if (parsed.origin === new URL(serviceOrigin).origin && !deploys.length) {
      if (staging.error) throw staging.error;
      return new Response(staging.html ?? marker(staging.commit ?? sha), {
        status: staging.status ?? 200,
      });
    }
    if ([serviceOrigin, productionOrigin, "https://useorbit.org"].includes(parsed.origin)) {
      return new Response(marker(deploys.at(-1).commitId));
    }
    let result;
    if (parsed.hostname === "api.render.com") {
      const origin = parsed.pathname.includes("staging-service") ? serviceOrigin : productionOrigin;
      if (parsed.pathname.endsWith("/env-vars")) {
        result = ["PUBLIC_APP_URL", "PUBLIC_ANDROID_INSTALL_URL"].map((key) => ({
          envVar: { key, value: env[key] },
        }));
      } else if (parsed.pathname.endsWith("/deploys") && options.method === "POST") {
        deploys.push(JSON.parse(options.body));
        result = { id: "deploy-1" };
      } else if (parsed.pathname.endsWith("/deploys/deploy-1")) {
        result = { status: "live", commit: { id: deploys.at(-1).commitId } };
      } else if (/\/services\/(production|staging)-service$/.test(parsed.pathname)) {
        result = { autoDeploy: "no", branch: "main", serviceDetails: { url: origin } };
      } else {
        throw new Error(`Unexpected Render request: ${url}`);
      }
    } else if (parsed.pathname.endsWith("/deployments") && options.method === "POST") {
      result = { id: 1, sha: JSON.parse(options.body).ref };
    } else if (parsed.pathname.endsWith("/deployments/1/statuses")) {
      result = {};
    } else {
      throw new Error(`Unexpected request: ${url}`);
    }
    return Response.json(result);
  };
  const run = new AsyncFunction(
    "process",
    "execFileSync",
    "appendFileSync",
    "fetch",
    "console",
    body.replace(/^\s*import .*;$/gm, ""),
  );
  return {
    deploys,
    requests,
    summaries,
    run: () =>
      run(
        { env },
        () => head,
        (path, content) => {
          assert.equal(path, env.GITHUB_STEP_SUMMARY);
          summaries.push(content);
        },
        fetch,
        { log() {} },
      ),
  };
}

for (const environment of ["staging", "production"]) {
  test(`${environment}: deploys the input SHA after the branch head moves`, async () => {
    const release = releaseHarness(environment, { head: previousSha });
    await release.run();
    assert.deepEqual(release.deploys, [{ commitId: sha }]);
    assert.match(release.summaries.join("\n"), new RegExp(`Deployed SHA: ${sha}`));
    const deployment = release.requests.find(({ url }) => url.pathname.endsWith("/deployments"));
    assert.equal(JSON.parse(deployment.options.body).ref, sha);
  });
}

for (const [reason, staging] of [
  ["a different commit", { commit: previousSha }],
  ["an unhealthy response", { status: 503 }],
  ["a redirect", { status: 302 }],
  ["a missing marker", { html: "<html></html>" }],
  ["a network failure", { error: new Error("connection reset") }],
]) {
  test(`production: rejects ${reason} on staging before deploying`, async () => {
    const release = releaseHarness("production", { staging });
    await assert.rejects(release.run());
    assert.deepEqual(release.deploys, []);
    assert.ok(release.requests.every(({ options }) => !options.method));
    assert.match(release.summaries.join("\n"), /force_unstaged: false/);
  });
}

test("production: admits the healthy staging SHA and records admission", async () => {
  const release = releaseHarness("production");
  await release.run();
  const probe = release.requests.find(({ url }) => url.origin === serviceOrigin);
  assert.ok(probe);
  assert.equal(probe.options.redirect, "manual");
  assert.equal(probe.options.cache, "no-store");
  assert.ok(probe.url.searchParams.get("orbit-verify"));
  assert.match(release.summaries.join("\n"), new RegExp(`Staging served ${sha}`));
  assert.deepEqual(release.deploys, [{ commitId: sha }]);
});

test("production: records an explicit override and deploys without staging admission", async () => {
  const release = releaseHarness("production", {
    force: "true",
    staging: { error: new Error("staging unavailable") },
  });
  await release.run();
  assert.deepEqual(release.deploys, [{ commitId: sha }]);
  assert.match(release.summaries.join("\n"), /force_unstaged: true/);
  assert.ok(release.requests.every(({ url }) => !url.href.includes("staging")));
});

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

function verifier(environment) {
  const job = workflow.split(`  ${environment}:\n`)[1].split(/^  \w+:$/m)[0];
  const body = job
    .split('if (!live) throw new Error("Render deploy did not go live before the timeout");')[1]
    .split("const deployment =")[0];
  return new AsyncFunction(
    "sha",
    "serviceOrigin",
    "fetch",
    "sleep",
    "AbortSignal",
    "console",
    "performance",
    "crypto",
    body,
  );
}

function harness(environment, respond) {
  let elapsed = 0;
  const requests = [];
  const sleeps = [];
  const logs = [];
  let timeout;
  const advance = (milliseconds) => (elapsed += milliseconds);
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options, elapsed, timeout });
    const result = respond({ url: new URL(url), elapsed, advance, timeout });
    if (result instanceof Error) throw result;
    const { commit = sha, status = 200, html } = result;
    const marker = layout
      .match(/<meta name="orbit-build" content=\{renderBuildCommit\} \/>/)[0]
      .replace("{renderBuildCommit}", `"${commit}"`);
    return new Response(html ?? marker, { status });
  };
  return {
    requests,
    sleeps,
    logs,
    elapsed: () => elapsed,
    run: () =>
      verifier(environment)(
        sha,
        serviceOrigin,
        fetch,
        async (milliseconds) => {
          sleeps.push(milliseconds);
          advance(milliseconds);
        },
        {
          timeout: (milliseconds) => {
            timeout = milliseconds;
            return AbortSignal.timeout(milliseconds);
          },
        },
        { log: (message) => logs.push(message) },
        { now: () => elapsed },
        crypto,
      ),
  };
}

for (const environment of ["staging", "production"]) {
  test(`${environment}: accepts the planned build immediately`, async () => {
    const clock = harness(environment, () => ({}));
    await clock.run();
    assert.equal(clock.elapsed(), 0);
    assert.equal(clock.requests.length, environment === "production" ? 2 : 1);
    assert.deepEqual(clock.sleeps, []);
    assert.ok(clock.requests.every(({ options }) => options.redirect === "manual"));
  });

  test(`${environment}: rejects a persistent build mismatch at the five-minute ceiling`, async () => {
    const clock = harness(environment, () => ({ commit: previousSha }));
    await assert.rejects(clock.run(), /does not serve 6f1d7042/);
    assert.equal(clock.requests.length, 60);
    assert.equal(clock.elapsed(), 300_000);
    assert.ok(clock.logs.every((message) => message.includes(previousSha)));
  });

  test(`${environment}: accepts a build that appears after the old timeout`, async () => {
    const clock = harness(environment, ({ elapsed }) => ({
      commit: elapsed < 90_000 ? previousSha : sha,
    }));
    await clock.run();
    assert.equal(clock.elapsed(), 90_000);
    assert.ok(clock.sleeps.every((milliseconds) => milliseconds === 5_000));
  });

  test(`${environment}: bypasses cached HTML with a unique URL on every probe`, async () => {
    const clock = harness(environment, ({ elapsed }) => ({
      commit: elapsed < 10_000 ? previousSha : sha,
    }));
    await clock.run();
    const urls = clock.requests.map(({ url }) => url);
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(urls.every((url) => new URL(url).searchParams.get("orbit-verify")));
    assert.ok(clock.requests.every(({ options }) => options.cache === "no-store"));
  });

  test(`${environment}: retries network errors, redirects and missing markers`, async () => {
    const clock = harness(environment, ({ elapsed }) => {
      if (elapsed === 0) return new Error("connection reset");
      if (elapsed === 5_000) return { status: 302 };
      if (elapsed === 10_000) return { html: "<html></html>" };
      return {};
    });
    await clock.run();
    assert.equal(clock.elapsed(), 15_000);
    assert.match(clock.logs.join("\n"), /connection reset/);
    assert.match(clock.logs.join("\n"), /HTTP 302/);
    assert.match(clock.logs.join("\n"), /no build marker/);
  });

  for (const [failure, respond] of [
    ["network error", () => new Error("connection reset")],
    ["service error", () => ({ status: 503 })],
    ["redirect", () => ({ status: 302 })],
    ["missing marker", () => ({ html: "<html></html>" })],
  ]) {
    test(`${environment}: persistent ${failure} fails within the ceiling`, async () => {
      const clock = harness(environment, respond);
      await assert.rejects(clock.run(), /does not serve 6f1d7042/);
      assert.equal(clock.elapsed(), 300_000);
    });
  }

  test(`${environment}: accepts the final probe before the ceiling`, async () => {
    const clock = harness(environment, ({ elapsed }) => ({
      commit: elapsed < 295_000 ? previousSha : sha,
    }));
    await clock.run();
    assert.equal(clock.elapsed(), 295_000);
  });

  test(`${environment}: slow requests use the remaining deadline`, async () => {
    const clock = harness(environment, ({ advance, timeout }) => {
      advance(Math.min(13_000, timeout));
      return new Error("request timed out");
    });
    await assert.rejects(clock.run(), /does not serve 6f1d7042/);
    assert.equal(clock.elapsed(), 300_000);
    assert.equal(clock.requests.at(-1).timeout, 12_000);
    assert.ok(clock.requests.every(({ timeout }) => timeout <= 15_000));
    assert.ok(clock.requests.every(({ elapsed, timeout }) => elapsed + timeout <= 300_000));
  });

  test(`${environment}: rejects a matching response completed after the deadline`, async () => {
    const clock = harness(environment, ({ elapsed, advance }) => {
      if (elapsed < 295_000) return { commit: previousSha };
      advance(6_000);
      return {};
    });
    await assert.rejects(clock.run(), /does not serve 6f1d7042/);
    assert.equal(clock.elapsed(), 301_000);
    assert.equal(clock.requests.at(-1).timeout, 5_000);
  });
}

test("production: Render and public origins share one verification deadline", async () => {
  const clock = harness("production", ({ url, elapsed }) => ({
    commit: url.origin === serviceOrigin && elapsed >= 180_000 ? sha : previousSha,
  }));
  await assert.rejects(clock.run(), /https:\/\/useorbit.org.*does not serve/);
  assert.equal(clock.elapsed(), 300_000);
  assert.equal(
    clock.requests.find(({ url }) => new URL(url).host === "useorbit.org").elapsed,
    180_000,
  );
});
