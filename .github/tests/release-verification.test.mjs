import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/release.yml", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../src/layouts/Layout.astro", import.meta.url), "utf8");
const sha = "6f1d70422e37f343093fa5ef6561f483e4b6dc20";
const previousSha = "30c06d7e14c6fa9d749464510e8e16674c9028ff";
const serviceOrigin = "https://orbit-landing-staging.onrender.com";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

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
  const advance = (milliseconds) => (elapsed += milliseconds);
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options, elapsed });
    const result = respond({ url: new URL(url), elapsed, advance });
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
        AbortSignal,
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

  test(`${environment}: rejects a persistent build mismatch after six probes`, async () => {
    const clock = harness(environment, () => ({ commit: previousSha }));
    await assert.rejects(clock.run(), /does not serve 6f1d7042/);
    assert.equal(clock.requests.length, 6);
    assert.equal(clock.elapsed(), 30_000);
    assert.ok(clock.logs.every((message) => message.includes(previousSha)));
  });
}
