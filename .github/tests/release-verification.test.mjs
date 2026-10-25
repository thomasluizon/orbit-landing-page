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

function releaseHarness(
  environment,
  { staging = {}, force = "false", head = sha, render = () => {}, github = () => {} } = {},
) {
  const job = releaseJob(environment);
  const body = job.split("node --input-type=module <<'NODE'\n")[1].split("          NODE")[0];
  const deploys = [];
  const renderDeploys = [];
  const requests = [];
  const summaries = [];
  const sleeps = [];
  const startedAt = Date.now();
  let elapsed = 0;
  const now = () => startedAt + elapsed;
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
      const respond = () => {
        const origin = parsed.pathname.includes("staging-service")
          ? serviceOrigin
          : productionOrigin;
        if (parsed.pathname.endsWith("/env-vars")) {
          result = ["PUBLIC_APP_URL", "PUBLIC_ANDROID_INSTALL_URL"].map((key) => ({
            envVar: { key, value: env[key] },
          }));
        } else if (parsed.pathname.endsWith("/deploys") && options.method === "POST") {
          deploys.push(JSON.parse(options.body));
          const deploy = {
            id: "deploy-1",
            commit: { id: deploys.at(-1).commitId },
            createdAt: new Date(now()).toISOString(),
          };
          renderDeploys.push(deploy);
          return Response.json(deploy, { status: 201 });
        } else if (parsed.pathname.endsWith("/deploys")) {
          result = renderDeploys.map((deploy) => ({
            cursor: "deploy-cursor",
            deploy,
          }));
        } else if (parsed.pathname.endsWith("/deploys/deploy-1")) {
          result = { status: "live", commit: { id: deploys.at(-1).commitId } };
        } else if (/\/services\/(production|staging)-service$/.test(parsed.pathname)) {
          result = { autoDeploy: "no", branch: "main", serviceDetails: { url: origin } };
        } else {
          throw new Error(`Unexpected Render request: ${url}`);
        }
        return Response.json(result);
      };
      return (await render({ url: parsed, options, respond, now })) ?? respond();
    } else if (parsed.pathname.endsWith("/deployments") && options.method === "POST") {
      const response = await github({ url: parsed, options });
      if (response) return response;
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
    "setTimeout",
    "Date",
    body.replace(/^\s*import .*;$/gm, ""),
  );
  return {
    deploys,
    requests,
    summaries,
    sleeps,
    now,
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
        (resolve, milliseconds) => {
          sleeps.push(milliseconds);
          elapsed += milliseconds;
          resolve();
        },
        class extends Date {
          static now = now;
        },
      ),
  };
}

for (const environment of ["staging", "production"]) {
  for (const [failure, fail] of [
    [
      "connection reset",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "timeout",
      () => {
        throw new DOMException("request timed out", "TimeoutError");
      },
    ],
    ["rate limit", () => new Response("rate limited", { status: 429 })],
    ["server error", () => new Response("unavailable", { status: 503 })],
    [
      "response interruption",
      () => ({
        ok: true,
        text: async () => {
          throw new TypeError("terminated");
        },
      }),
    ],
  ]) {
    test(`${environment}: retries a first status poll ${failure} and finishes the release`, async () => {
      let polls = 0;
      const release = releaseHarness(environment, {
        render: ({ url }) => {
          if (url.pathname.endsWith("/deploys/deploy-1") && ++polls === 1) return fail();
        },
      });
      await release.run();
      assert.equal(polls, 2);
      assert.deepEqual(release.deploys, [{ commitId: sha }]);
      assert.ok(release.sleeps.length > 0);
      assert.match(release.summaries.join("\n"), new RegExp(`Deployed SHA: ${sha}`));
    });

    test(`${environment}: reconciles an accepted deploy after a POST ${failure}`, async () => {
      let posts = 0;
      let lists = 0;
      let polls = 0;
      const release = releaseHarness(environment, {
        render: ({ url, options, respond }) => {
          if (options.method === "POST") {
            posts++;
            respond();
            return fail();
          }
          if (url.pathname.endsWith("/deploys") && ++lists <= 2) return Response.json([]);
          if (url.pathname.endsWith("/deploys/deploy-1") && ++polls === 1) {
            throw new TypeError("first status poll failed");
          }
        },
      });
      await release.run();
      assert.equal(posts, 1);
      assert.equal(lists, 3);
      assert.equal(polls, 2);
      assert.deepEqual(release.deploys, [{ commitId: sha }]);
      assert.match(release.summaries.join("\n"), new RegExp(`Deployed SHA: ${sha}`));
    });
  }

  test(`${environment}: retries service reads and staging branch selection`, async () => {
    const attempts = new Map();
    const release = releaseHarness(environment, {
      render: ({ url, options }) => {
        if (url.pathname.includes("/deploys")) return;
        const key = `${options.method ?? "GET"} ${url.pathname}`;
        const count = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, count);
        if (count === 1) return new Response("unavailable", { status: 500 });
      },
    });
    await release.run();
    assert.ok([...attempts.values()].every((count) => count === 2));
    assert.equal(attempts.size, environment === "staging" ? 3 : 2);
  });

  test(`${environment}: resends a failed POST only after excluding old and unrelated deploys`, async () => {
    let posts = 0;
    let lists = 0;
    const release = releaseHarness(environment, {
      render: ({ url, options }) => {
        if (options.method === "POST" && ++posts === 1) throw new TypeError("connection reset");
        if (url.pathname.endsWith("/deploys") && !options.method) {
          lists++;
          return Response.json([
            {
              deploy: {
                id: "old",
                commit: { id: sha },
                createdAt: new Date(startedAt - 1).toISOString(),
              },
            },
            {
              deploy: {
                id: "other",
                commit: { id: previousSha },
                createdAt: new Date(release.now()).toISOString(),
              },
            },
            { deploy: { id: "unverified", createdAt: new Date(release.now()).toISOString() } },
            { deploy: { id: "undated", commit: { id: sha } } },
          ]);
        }
      },
    });
    const startedAt = release.now();
    await release.run();
    assert.equal(posts, 2);
    assert.ok(lists > 0 && lists <= 30);
    assert.deepEqual(release.deploys, [{ commitId: sha }]);
    const postIndexes = release.requests.flatMap(({ options }, index) =>
      options.method === "POST" ? [index] : [],
    );
    assert.ok(
      release.requests
        .slice(postIndexes[0] + 1, postIndexes[1])
        .every(({ url }) => url.pathname.endsWith("/deploys")),
    );
  });

  test(`${environment}: retries the deploy lookup before considering another POST`, async () => {
    let lists = 0;
    const release = releaseHarness(environment, {
      render: ({ url, options, respond }) => {
        if (options.method === "POST") {
          respond();
          throw new TypeError("POST response lost");
        }
        if (url.pathname.endsWith("/deploys") && ++lists === 1)
          throw new TypeError("lookup failed");
      },
    });
    await release.run();
    assert.equal(lists, 2);
    assert.deepEqual(release.deploys, [{ commitId: sha }]);
  });

  for (const visible of [true, false]) {
    test(`${environment}: queued deploy ${visible ? "is followed" : "times out"} without a second POST`, async () => {
      let posts = 0;
      let lists = 0;
      const release = releaseHarness(environment, {
        render: ({ url, options, respond }) => {
          if (options.method === "POST") {
            posts++;
            respond();
            return new Response(null, { status: 202 });
          }
          if (url.pathname.endsWith("/deploys") && (++lists < 3 || !visible))
            return Response.json([]);
        },
      });
      if (visible) await release.run();
      else await assert.rejects(release.run(), /Render did not create a deploy/);
      assert.equal(posts, 1);
      assert.deepEqual(release.deploys, [{ commitId: sha }]);
    });
  }

  for (const target of [
    "service",
    "status",
    "POST",
    ...(environment === "staging" ? ["PATCH", "env-vars"] : []),
  ]) {
    for (const status of [400, 401, 403, 404]) {
      test(`${environment}: fails immediately on ${target} HTTP ${status}`, async () => {
        let failures = 0;
        const release = releaseHarness(environment, {
          render: ({ url, options }) => {
            const matches =
              target === "POST" || target === "PATCH"
                ? options.method === target
                : target === "status"
                  ? url.pathname.endsWith("/deploys/deploy-1")
                  : target === "env-vars"
                    ? url.pathname.endsWith("/env-vars")
                    : !options.method && /\/services\/[^/]+$/.test(url.pathname);
            if (matches) {
              failures++;
              return new Response("rejected", { status });
            }
          },
        });
        await assert.rejects(release.run(), new RegExp(`HTTP ${status}`));
        assert.equal(failures, 1);
        assert.deepEqual(release.sleeps, []);
      });
    }
  }

  test(`${environment}: stops after bounded read retries with a fresh timeout per attempt`, async () => {
    const release = releaseHarness(environment, {
      render: () => {
        throw new TypeError("persistent connection failure");
      },
    });
    await assert.rejects(release.run(), /persistent connection failure/);
    assert.equal(release.requests.length, 4);
    assert.deepEqual(release.sleeps, [2_000, 4_000, 6_000]);
    const signals = release.requests.map(({ options }) => options.signal);
    assert.equal(new Set(signals).size, 4);
    assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  });

  test(`${environment}: stops after bounded POST retries when no deploy was created`, async () => {
    let posts = 0;
    const release = releaseHarness(environment, {
      render: ({ options }) => {
        if (options.method === "POST") {
          posts++;
          throw new TypeError("POST never reached Render");
        }
      },
    });
    await assert.rejects(release.run(), /POST never reached Render/);
    assert.equal(posts, 4);
    assert.deepEqual(release.deploys, []);
  });

  test(`${environment}: refuses to resend when the deploy lookup cannot complete`, async () => {
    let posts = 0;
    const release = releaseHarness(environment, {
      render: ({ url, options, respond }) => {
        if (options.method === "POST") {
          posts++;
          respond();
          throw new TypeError("POST response lost");
        }
        if (url.pathname.endsWith("/deploys")) return new Response("unavailable", { status: 503 });
      },
    });
    await assert.rejects(release.run(), /HTTP 503/);
    assert.equal(posts, 1);
    assert.deepEqual(release.deploys, [{ commitId: sha }]);
  });

  test(`${environment}: finds an accepted deploy beyond the first page`, async () => {
    let posts = 0;
    let lists = 0;
    const release = releaseHarness(environment, {
      render: ({ url, options, respond, now }) => {
        if (options.method === "POST") {
          posts++;
          respond();
          throw new TypeError("POST response lost");
        }
        if (url.pathname.endsWith("/deploys")) {
          lists++;
          assert.equal(url.searchParams.get("limit"), "100");
          assert.equal(Date.parse(url.searchParams.get("createdAfter")), startedAt);
          if (lists === 1) {
            assert.equal(url.searchParams.get("cursor"), null);
            return Response.json(
              Array.from({ length: 100 }, (_, index) => ({
                cursor: `cursor-${index}`,
                deploy: {
                  id: `unrelated-${index}`,
                  commit: { id: previousSha },
                  createdAt: new Date(now()).toISOString(),
                },
              })),
            );
          }
          assert.equal(url.searchParams.get("cursor"), "cursor-99");
        }
      },
    });
    const startedAt = release.now();
    await release.run();
    assert.equal(posts, 1);
    assert.equal(lists, 2);
    assert.deepEqual(release.deploys, [{ commitId: sha }]);
  });

  for (const [reason, entries, message] of [
    [
      "missing cursor",
      () => Array.from({ length: 100 }, () => ({ deploy: { id: "other" } })),
      /omitted a pagination cursor/,
    ],
    [
      "too many pages",
      () => Array.from({ length: 100 }, () => ({ cursor: "next", deploy: { id: "other" } })),
      /exceeded 10 pages/,
    ],
    ["an HTTP 401", () => new Response("rejected", { status: 401 }), /HTTP 401/],
  ]) {
    test(`${environment}: refuses to resend after a deploy lookup with ${reason}`, async () => {
      let posts = 0;
      const release = releaseHarness(environment, {
        render: ({ url, options, respond }) => {
          if (options.method === "POST") {
            posts++;
            respond();
            throw new TypeError("POST response lost");
          }
          if (url.pathname.endsWith("/deploys")) {
            const result = entries();
            return result instanceof Response ? result : Response.json(result);
          }
        },
      });
      await assert.rejects(release.run(), message);
      assert.equal(posts, 1);
      assert.deepEqual(release.deploys, [{ commitId: sha }]);
    });
  }

  for (const [reason, current, message] of [
    ["a different commit", { status: "live", commit: { id: previousSha } }, /instead of/],
    ["an unverified live commit", { status: "live" }, /did not confirm the deployed SHA/],
    ["a failed deploy", { status: "build_failed", commit: { id: sha } }, /ended with build_failed/],
  ]) {
    test(`${environment}: still rejects ${reason} after recovering a poll`, async () => {
      let polls = 0;
      const release = releaseHarness(environment, {
        render: ({ url }) => {
          if (url.pathname.endsWith("/deploys/deploy-1")) {
            if (++polls === 1) throw new TypeError("poll failed");
            return Response.json(current);
          }
        },
      });
      await assert.rejects(release.run(), message);
      assert.equal(polls, 2);
      assert.ok(release.requests.every(({ url }) => url.hostname !== "api.github.com"));
    });
  }

  test(`${environment}: leaves GitHub deployment writes unretried`, async () => {
    let writes = 0;
    const release = releaseHarness(environment, {
      github: () => {
        writes++;
        return new Response("unavailable", { status: 503 });
      },
    });
    await assert.rejects(release.run(), /api.github.com.*HTTP 503/);
    assert.equal(writes, 1);
  });

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
