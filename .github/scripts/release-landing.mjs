import { appendFileSync } from "node:fs";

const buildMarkerPattern = /<meta name="orbit-build" content="([0-9a-f]{40})"/;
const publicOrigin = "https://useorbit.org";
const verificationWindowMs = 300_000;
const wholeSecondHeaderMarginMs = 2_000;
const maxRetryAfterMs = 60_000;
const failedDeployStatuses = [
  "build_failed",
  "update_failed",
  "pre_deploy_failed",
  "canceled",
  "deactivated",
];

const isTransient = (error) =>
  error.retryable ?? ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
const wasNotSent = (error) =>
  error.name === "TypeError" && ["ENOTFOUND", "ECONNREFUSED"].includes(error.cause?.code);

function retryDelay(error, attempt) {
  const seconds = error.retryAfter;
  return typeof seconds === "string" && /^\d+$/.test(seconds)
    ? Math.min(Number(seconds) * 1_000, maxRetryAfterMs)
    : 2_000 * attempt;
}

function releaseSettings(env) {
  const environment = env.RELEASE_ENVIRONMENT;
  if (!["production", "staging"].includes(environment)) {
    throw new Error(`Set RELEASE_ENVIRONMENT to production or staging, got ${environment}`);
  }
  const production = environment === "production";
  const serviceId = production ? env.RENDER_PRODUCTION_SERVICE_ID : env.RENDER_STAGING_SERVICE_ID;
  if (!env.RENDER_API_KEY || !serviceId || !env.GH_TOKEN) {
    throw new Error(
      production
        ? "Configure the production environment secret RENDER_API_KEY and variable RENDER_LANDING_SERVICE_ID"
        : "Configure the staging environment secret RENDER_API_KEY and variable RENDER_LANDING_STAGING_SERVICE_ID",
    );
  }
  return {
    env,
    sha: env.RELEASE_SHA,
    environment,
    production,
    renderUrl: `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}`,
    renderHeaders: { Authorization: `Bearer ${env.RENDER_API_KEY}`, Accept: "application/json" },
    githubUrl: `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/deployments`,
    githubHeaders: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
  };
}

async function jsonRequest(context, url, options = {}) {
  const idempotent =
    url.startsWith("https://api.render.com/") && ["GET", "PATCH"].includes(options.method ?? "GET");
  const attempts = idempotent ? 4 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await context.fetch(url, {
        ...options,
        signal: context.timeoutSignal(30_000),
      });
      if (!response.ok) {
        throw Object.assign(new Error(`${url}: HTTP ${response.status}`), {
          status: response.status,
          retryAfter: response.status === 429 ? response.headers.get("Retry-After") : null,
          retryable: response.status === 429 || (response.status >= 500 && response.status <= 599),
        });
      }
      const body = await response.text();
      return body.trim() === "" ? null : JSON.parse(body);
    } catch (error) {
      if (attempt === attempts || !isTransient(error)) throw error;
      context.log(`Render request failed (${attempt}/${attempts}): ${error.message}`);
      await context.sleep(retryDelay(error, attempt));
    }
  }
}

async function readDeploys(context, triggeredAt) {
  const url = new URL(`${context.renderUrl}/deploys`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("createdAfter", new Date(triggeredAt).toISOString());
  const deploys = [];
  for (let page = 0; page < 10; page++) {
    const recent = await jsonRequest(context, url.href, { headers: context.renderHeaders });
    deploys.push(...recent.map(({ deploy }) => deploy));
    if (recent.length < 100) return deploys;
    const cursor = recent.at(-1)?.cursor;
    if (!cursor) throw new Error("Render deploy lookup omitted a pagination cursor");
    url.searchParams.set("cursor", cursor);
  }
  throw new Error("Render deploy lookup exceeded 10 pages; refusing to repeat the deploy request");
}

async function reconcileDeploy(context, triggeredAt, existingIds) {
  for (let lookup = 0; lookup < 30; lookup++) {
    await context.sleep(5_000);
    const recent = await readDeploys(context, triggeredAt);
    const deploy = recent.find(
      (deploy) =>
        deploy?.id &&
        !existingIds.has(deploy.id) &&
        deploy.commit?.id === context.sha &&
        Date.parse(deploy.createdAt) >= triggeredAt,
    );
    if (deploy) return deploy;
  }
  throw new Error(
    `Ambiguous Render deploy outcome for commit ${context.sha}; check the service's deploys before dispatching again`,
  );
}

async function triggerDeploy(context) {
  const triggeredAt = context.now();
  const existing = await jsonRequest(context, `${context.renderUrl}/deploys?limit=100`, {
    headers: context.renderHeaders,
  });
  const existingIds = new Set(existing.map(({ deploy }) => deploy.id));
  for (let attempt = 1; attempt <= 4; attempt++) {
    let deploy;
    try {
      deploy = await jsonRequest(context, `${context.renderUrl}/deploys`, {
        method: "POST",
        headers: { ...context.renderHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ commitId: context.sha }),
      });
    } catch (error) {
      if (!isTransient(error)) throw error;
      if (error.status === 429 || wasNotSent(error)) {
        if (attempt === 4) throw error;
        context.log(`Render refused deploy request (${attempt}/4): ${error.message}`);
        await context.sleep(retryDelay(error, attempt));
        continue;
      }
      context.log(
        `Render deploy response ambiguous: ${error.message}; checking recent deploys without another POST`,
      );
      return reconcileDeploy(context, triggeredAt, existingIds);
    }
    if (deploy?.id) return deploy;
    return reconcileDeploy(context, triggeredAt, existingIds);
  }
}

async function admitStagedCommit(context) {
  const { env, sha } = context;
  context.appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Production staging admission\nSelected SHA: ${sha}\nforce_unstaged: ${env.FORCE_UNSTAGED}\n`,
  );
  if (env.FORCE_UNSTAGED === "true") {
    context.log(
      `Operator override force_unstaged permits production release of ${sha} without staging admission`,
    );
    return;
  }
  if (!env.RENDER_STAGING_SERVICE_ID) {
    throw new Error("Configure the repository variable RENDER_LANDING_STAGING_SERVICE_ID");
  }
  const stagingService = await jsonRequest(
    context,
    `https://api.render.com/v1/services/${encodeURIComponent(env.RENDER_STAGING_SERVICE_ID)}`,
    { headers: context.renderHeaders },
  );
  const stagingOrigin = stagingService.serviceDetails?.url;
  if (!stagingOrigin) throw new Error("Render did not return the staging landing service URL");
  const response = await context.fetch(new URL("/", stagingOrigin), {
    redirect: "manual",
    signal: context.timeoutSignal(30_000),
  });
  const html = response.status === 200 ? await response.text() : "";
  const commit = html.match(buildMarkerPattern)?.[1];
  if (response.status !== 200 || commit !== sha) {
    throw new Error(
      `Staging must serve ${sha} with HTTP 200 before production release; got HTTP ${response.status} serving ${commit ?? "no build marker"}; force_unstaged is the explicit override`,
    );
  }
  context.appendFileSync(env.GITHUB_STEP_SUMMARY, `Staging served ${sha} with HTTP 200\n`);
}

async function selectStagingBranch(context) {
  const { env } = context;
  const buildVariables = await jsonRequest(context, `${context.renderUrl}/env-vars?limit=100`, {
    headers: context.renderHeaders,
  });
  for (const key of ["PUBLIC_APP_URL", "PUBLIC_ANDROID_INSTALL_URL"]) {
    const configured = buildVariables.find(({ envVar }) => envVar.key === key)?.envVar.value;
    if (configured !== env[key]) {
      throw new Error(
        `Set the Render staging build variable ${key} to ${env[key]} before releasing`,
      );
    }
  }
  const updated = await jsonRequest(context, context.renderUrl, {
    method: "PATCH",
    headers: { ...context.renderHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ branch: env.RELEASE_BRANCH }),
  });
  if (updated.branch !== env.RELEASE_BRANCH) {
    throw new Error(`Render did not select staging branch ${env.RELEASE_BRANCH}`);
  }
}

async function readServiceOrigin(context) {
  const service = await jsonRequest(context, context.renderUrl, { headers: context.renderHeaders });
  if (service.autoDeploy !== "no") {
    throw new Error("The Render landing service must have auto-deploy disabled");
  }
  const serviceOrigin = service.serviceDetails?.url;
  if (!serviceOrigin) throw new Error("Render did not return the landing service URL");
  return serviceOrigin;
}

async function waitUntilLive(context, deployId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await jsonRequest(context, `${context.renderUrl}/deploys/${deployId}`, {
      headers: context.renderHeaders,
    });
    if (current.commit?.id && current.commit.id !== context.sha) {
      throw new Error(`Render is deploying ${current.commit.id} instead of ${context.sha}`);
    }
    context.log(`Render status: ${current.status}`);
    if (current.status === "live") {
      if (current.commit?.id !== context.sha) {
        throw new Error("Render did not confirm the deployed SHA");
      }
      return Date.parse(current.finishedAt);
    }
    if (failedDeployStatuses.includes(current.status)) {
      throw new Error(`Render deploy ended with ${current.status}`);
    }
    await context.sleep(10_000);
  }
  throw new Error("Render deploy did not go live before the timeout");
}

async function servedCommit(verification, origin) {
  const remaining = Math.max(1, Math.ceil(verification.deadline - verification.monotonicNow()));
  const response = await verification.fetch(new URL("/", origin), {
    redirect: "manual",
    signal: verification.timeoutSignal(Math.min(15_000, remaining)),
  });
  const edge = {
    cacheStatus: response.headers.get("cf-cache-status"),
    age: response.headers.get("age"),
    date: response.headers.get("date"),
    lastModified: response.headers.get("last-modified"),
  };
  if (response.status !== 200) return { status: response.status, commit: null, edge };
  const html = await response.text();
  return { status: 200, commit: html.match(buildMarkerPattern)?.[1] ?? null, edge };
}

function previousBuildSource({ sha, deployId, liveAt }, { commit, edge }) {
  const storedAt = Date.parse(edge.date) - Number(edge.age ?? 0) * 1_000;
  if (!commit || commit === sha || !Number.isFinite(storedAt) || !Number.isFinite(liveAt)) {
    return "";
  }
  const times = `edge copy stored ${new Date(storedAt).toISOString()}, deploy ${deployId} live ${new Date(liveAt).toISOString()}`;
  if (storedAt < liveAt - wholeSecondHeaderMarginMs) {
    return `; Render's CDN kept a copy of ${commit} from before the deploy went live, so the deploy did not invalidate this edge (${times})`;
  }
  if (storedAt > liveAt + wholeSecondHeaderMarginMs) {
    return `; Render gave its CDN ${commit} after it reported the deploy live (${times})`;
  }
  return `; Render's CDN stored ${commit} within ${wholeSecondHeaderMarginMs / 1_000} s of the deploy going live (${times})`;
}

async function requireServedCommit(verification, origin) {
  const { sha, deadline, monotonicNow, log } = verification;
  let previousBuildReason = "";
  while (monotonicNow() < deadline) {
    try {
      const result = await servedCommit(verification, origin);
      if (result.status === 200 && result.commit === sha && monotonicNow() <= deadline) {
        log(
          `${origin} serves ${sha} after ${Math.round(monotonicNow() - verification.startedAt)} ms`,
        );
        return;
      }
      previousBuildReason = previousBuildSource(verification, result);
      const { cacheStatus, age, lastModified } = result.edge;
      log(
        `${origin} returned HTTP ${result.status} serving ${result.commit ?? "no build marker"} (cf-cache-status ${cacheStatus ?? "none"}, age ${age ?? "none"}, last-modified ${lastModified ?? "none"})`,
      );
    } catch (error) {
      log(`${origin} check failed: ${error.message}`);
    }
    const remaining = deadline - monotonicNow();
    if (remaining > 0) await verification.sleep(Math.min(5_000, remaining));
  }
  throw new Error(
    `${origin}/ does not serve ${sha} within ${verificationWindowMs} ms of Render going live${previousBuildReason}`,
  );
}

/**
 * Waits until the Render service origin, and in production also https://useorbit.org, serves the
 * build marker of `sha`. Both origins share one window that starts when this call starts.
 */
export async function verifyServedCommit(input) {
  const startedAt = input.monotonicNow();
  const verification = { ...input, startedAt, deadline: startedAt + verificationWindowMs };
  await requireServedCommit(verification, input.serviceOrigin);
  if (input.production) await requireServedCommit(verification, publicOrigin);
}

async function recordDeployment(context, environmentUrl) {
  const { env, sha } = context;
  const headers = { ...context.githubHeaders, "Content-Type": "application/json" };
  const deployment = await jsonRequest(context, context.githubUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref: sha,
      environment: context.environment,
      auto_merge: false,
      required_contexts: [],
      description: "Render landing release",
    }),
  });
  if (deployment.sha !== sha) throw new Error("GitHub Deployment did not record the deployed SHA");
  await jsonRequest(context, `${context.githubUrl}/${deployment.id}/statuses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state: "success",
      environment_url: environmentUrl,
      log_url: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      description: "Render deploy is live and serves the deployed commit",
    }),
  });
  context.log(`GitHub Deployment ${deployment.id} succeeded for ${sha}`);
}

/**
 * Deploys `env.RELEASE_SHA` to the Render landing service of `env.RELEASE_ENVIRONMENT`, verifies
 * that it is served, and records a GitHub Deployment. Every side effect goes through the
 * dependencies, so a test can drive the whole release with fakes.
 */
export async function release(dependencies) {
  const context = { ...dependencies, ...releaseSettings(dependencies.env) };
  const { env, sha, production } = context;
  if (production) await admitStagedCommit(context);
  const serviceOrigin = await readServiceOrigin(context);
  if (!production) await selectStagingBranch(context);
  const deploy = await triggerDeploy(context);
  context.log(`Render deploy ${deploy.id} for ${sha}`);
  const liveAt = await waitUntilLive(context, deploy.id);
  await verifyServedCommit({ ...context, serviceOrigin, deployId: deploy.id, liveAt });
  await recordDeployment(context, production ? `${publicOrigin}/` : `${serviceOrigin}/`);
  context.appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Landing ${context.environment} release\nDeployed SHA: ${sha}\n`,
  );
}

if (import.meta.main) {
  await release({
    env: process.env,
    fetch,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
    monotonicNow: () => performance.now(),
    timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
    appendFileSync,
    log: (message) => console.log(message),
  });
}
