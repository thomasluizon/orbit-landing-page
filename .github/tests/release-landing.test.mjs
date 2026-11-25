import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { release } from "../scripts/release-landing.mjs";

const layout = readFileSync(new URL("../../src/layouts/Layout.astro", import.meta.url), "utf8");
const sha = "6f1d70422e37f343093fa5ef6561f483e4b6dc20";
const previousSha = "30c06d7e14c6fa9d749464510e8e16674c9028ff";
const stagingOrigin = "https://orbit-landing-staging.onrender.com";
const stagingBuildVariables = {
  PUBLIC_APP_URL: "https://app-staging.useorbit.org",
  PUBLIC_ANDROID_INSTALL_URL:
    "https://play.google.com/store/apps/details?id=org.useorbit.app.staging",
};
const marker = (commit) =>
  layout
    .match(/<meta name="orbit-build" content=\{renderBuildCommit\} \/>/)[0]
    .replace("{renderBuildCommit}", `"${commit}"`);

function harness(
  environment,
  { force = "false", staging = {}, variables, deployStatus, served, staleReads = 0 } = {},
) {
  let publicReads = 0;
  let stagingReads = 0;
  const sleeps = [];
  const deploys = [];
  const requests = [];
  const summaries = [];
  const env = {
    RELEASE_ENVIRONMENT: environment,
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
    ...stagingBuildVariables,
  };
  const fetch = async (url, options = {}) => {
    const { origin, pathname, hostname } = new URL(url);
    requests.push({ url: new URL(url), options });
    if (origin === stagingOrigin && !deploys.length) {
      if (staging.error) throw staging.error;
      if (stagingReads++ < (staging.staleReads ?? 0)) return new Response(marker(previousSha));
      return new Response(staging.html ?? marker(staging.commit ?? sha), {
        status: staging.status ?? 200,
      });
    }
    if (origin === stagingOrigin || origin === "https://useorbit.org") {
      if (publicReads++ < staleReads) return new Response(marker(previousSha));
      return new Response(marker(served ?? deploys.at(-1).commitId));
    }
    if (hostname === "api.github.com") {
      return Response.json(
        pathname.endsWith("/deployments") ? { id: 1, sha: JSON.parse(options.body).ref } : {},
      );
    }
    if (pathname.endsWith("/env-vars")) {
      const configured = { ...stagingBuildVariables, ...variables };
      return Response.json(
        Object.entries(configured).map(([key, value]) => ({ envVar: { key, value } })),
      );
    }
    if (pathname.endsWith("/deploys") && options.method === "POST") {
      deploys.push(JSON.parse(options.body));
      return Response.json({ id: "deploy-1" }, { status: 201 });
    }
    if (pathname.endsWith("/deploys/deploy-1")) {
      return Response.json({
        id: "deploy-1",
        commit: { id: deploys.at(-1).commitId },
        status: deployStatus ?? "live",
      });
    }
    if (options.method === "PATCH") return Response.json({ branch: "main" });
    return Response.json({
      autoDeploy: "no",
      branch: "main",
      serviceDetails: { url: stagingOrigin },
    });
  };
  return {
    deploys,
    requests,
    summaries,
    sleeps,
    run: () =>
      release({
        env,
        fetch,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        appendFileSync: (path, content) => summaries.push(content),
        log() {},
      }),
  };
}

test("staging: deploys the selected SHA and reports it", async () => {
  const run = harness("staging");
  await run.run();
  assert.deepEqual(run.deploys, [{ commitId: sha }]);
  assert.match(run.summaries.join("\n"), new RegExp(`Deployed SHA: ${sha}`));
});

test("records a GitHub Deployment of the deployed SHA with its public URL", async () => {
  for (const [environment, url] of [
    ["staging", `${stagingOrigin}/`],
    ["production", "https://useorbit.org/"],
  ]) {
    const run = harness(environment);
    await run.run();
    const writes = run.requests.filter(({ url }) => url.hostname === "api.github.com");
    const deployment = JSON.parse(writes[0].options.body);
    assert.equal(deployment.ref, sha);
    assert.equal(deployment.environment, environment);
    assert.equal(deployment.task, "deploy");
    assert.equal(writes[1].url.pathname, "/repos/owner/landing/deployments/1/statuses");
    const status = JSON.parse(writes[1].options.body);
    assert.equal(status.state, "success");
    assert.equal(status.environment_url, url);
  }
});

for (const environment of ["staging", "production"]) {
  test(`${environment}: refuses to record a deploy that the public origin does not serve`, async () => {
    const run = harness(environment, { served: previousSha });
    await assert.rejects(run.run(), /must serve/);
    assert.ok(run.requests.every(({ url }) => url.hostname !== "api.github.com"));
  });
}

for (const environment of ["staging", "production"]) {
  test(`${environment}: waits for the edge to serve the new build, then records the deployment`, async () => {
    const run = harness(environment, { staleReads: 3 });
    await run.run();
    assert.deepEqual(run.sleeps, [5_000, 5_000, 5_000]);
    const writes = run.requests.filter(({ url }) => url.hostname === "api.github.com");
    assert.equal(JSON.parse(writes[0].options.body).ref, sha);
    assert.match(run.summaries.join("\n"), new RegExp(`Deployed SHA: ${sha}`));
  });

  test(`${environment}: fails with the must serve message when the edge stays stale for the whole wait`, async () => {
    const run = harness(environment, { staleReads: Infinity });
    await assert.rejects(
      run.run(),
      new RegExp(`/ must serve ${sha} with HTTP 200; got HTTP 200 serving ${previousSha}`),
    );
    const waited = run.sleeps.reduce((total, milliseconds) => total + milliseconds, 0);
    assert.ok(waited >= 170_000 && waited <= 190_000, `waited ${waited} ms`);
    assert.ok(run.requests.every(({ url }) => url.hostname !== "api.github.com"));
  });
}

test("production: waits for a stale staging edge before it admits the commit", async () => {
  const run = harness("production", { staging: { staleReads: 2 } });
  await run.run();
  assert.deepEqual(run.deploys, [{ commitId: sha }]);
  assert.match(run.summaries.join("\n"), new RegExp(`Staging served ${sha} with HTTP 200`));
});

for (const [reason, staging] of [
  ["a different commit", { commit: previousSha }],
  ["an unhealthy response", { status: 503 }],
  ["a network failure", { error: new Error("connection reset") }],
]) {
  test(`production: refuses ${reason} on staging before deploying`, async () => {
    const run = harness("production", { staging });
    await assert.rejects(run.run());
    assert.deepEqual(run.deploys, []);
    assert.match(run.summaries.join("\n"), /force_unstaged: false/);
  });
}

test("production: force_unstaged deploys without a staging request", async () => {
  const run = harness("production", {
    force: "true",
    staging: { error: new Error("staging unavailable") },
  });
  await run.run();
  assert.deepEqual(run.deploys, [{ commitId: sha }]);
  assert.match(run.summaries.join("\n"), /force_unstaged: true/);
  assert.ok(run.requests.every(({ url }) => !url.href.includes("staging")));
});

test("staging: refuses a Render build variable that differs from the workflow", async () => {
  const run = harness("staging", { variables: { PUBLIC_APP_URL: "https://useorbit.org/" } });
  await assert.rejects(run.run(), /Set the Render staging build variable PUBLIC_APP_URL to /);
  assert.deepEqual(run.deploys, []);
});

test("staging: rejects a failed deploy status", async () => {
  const run = harness("staging", { deployStatus: "build_failed" });
  await assert.rejects(run.run(), /Render deploy ended with build_failed/);
  assert.equal(run.summaries.join("\n").includes("Deployed SHA"), false);
});

test("refuses an unknown release environment before any request", async () => {
  const run = harness("preview");
  await assert.rejects(run.run(), /Set RELEASE_ENVIRONMENT to production or staging/);
  assert.deepEqual(run.requests, []);
});

test("runs the release when node starts the script file, as the release workflow does", () => {
  const script = fileURLToPath(new URL("../scripts/release-landing.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH, RELEASE_ENVIRONMENT: "preview" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set RELEASE_ENVIRONMENT to production or staging, got preview/);
});
