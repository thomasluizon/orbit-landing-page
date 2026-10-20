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
