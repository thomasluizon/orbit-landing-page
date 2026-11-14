import { appendFileSync } from "node:fs";

const sha = process.env.RELEASE_SHA;
const {
  RELEASE_ENVIRONMENT,
  RENDER_API_KEY,
  RENDER_PRODUCTION_SERVICE_ID,
  RENDER_STAGING_SERVICE_ID,
  RELEASE_BRANCH,
  FORCE_UNSTAGED,
  GH_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
  GITHUB_STEP_SUMMARY,
} = process.env;
if (!["production", "staging"].includes(RELEASE_ENVIRONMENT)) {
  throw new Error(`Set RELEASE_ENVIRONMENT to production or staging, got ${RELEASE_ENVIRONMENT}`);
}
const production = RELEASE_ENVIRONMENT === "production";
const serviceId = production ? RENDER_PRODUCTION_SERVICE_ID : RENDER_STAGING_SERVICE_ID;
if (!RENDER_API_KEY || !serviceId || !GH_TOKEN) {
  throw new Error(
    production
      ? "Configure the production environment secret RENDER_API_KEY and variable RENDER_LANDING_SERVICE_ID"
      : "Configure the staging environment secret RENDER_API_KEY and variable RENDER_LANDING_STAGING_SERVICE_ID",
  );
}

const renderUrl = `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}`;
const renderHeaders = {
  Authorization: `Bearer ${RENDER_API_KEY}`,
  Accept: "application/json",
};
const githubUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/deployments`;
const githubHeaders = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isTransient = (error) =>
  error.retryable ?? ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
const maxRetryAfterMs = 60_000;
const wasNotSent = (error) =>
  error.name === "TypeError" && ["ENOTFOUND", "ECONNREFUSED"].includes(error.cause?.code);

function retryDelay(error, attempt) {
  const seconds = error.retryAfter;
  return typeof seconds === "string" && /^\d+$/.test(seconds)
    ? Math.min(Number(seconds) * 1_000, maxRetryAfterMs)
    : 2_000 * attempt;
}

async function jsonRequest(url, options = {}) {
  const idempotent =
    url.startsWith("https://api.render.com/") && ["GET", "PATCH"].includes(options.method ?? "GET");
  const attempts = idempotent ? 4 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
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
      console.log(`Render request failed (${attempt}/${attempts}): ${error.message}`);
      await sleep(retryDelay(error, attempt));
    }
  }
}

async function readDeploys(triggeredAt) {
  const url = new URL(`${renderUrl}/deploys`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("createdAfter", new Date(triggeredAt).toISOString());
  const deploys = [];
  for (let page = 0; page < 10; page++) {
    const recent = await jsonRequest(url.href, { headers: renderHeaders });
    deploys.push(...recent.map(({ deploy }) => deploy));
    if (recent.length < 100) return deploys;
    const cursor = recent.at(-1)?.cursor;
    if (!cursor) throw new Error("Render deploy lookup omitted a pagination cursor");
    url.searchParams.set("cursor", cursor);
  }
  throw new Error("Render deploy lookup exceeded 10 pages; refusing to repeat the deploy request");
}

async function reconcileDeploy(triggeredAt, existingIds) {
  for (let lookup = 0; lookup < 30; lookup++) {
    await sleep(5_000);
    const recent = await readDeploys(triggeredAt);
    const deploy = recent.find(
      (deploy) =>
        deploy?.id &&
        !existingIds.has(deploy.id) &&
        deploy.commit?.id === sha &&
        Date.parse(deploy.createdAt) >= triggeredAt,
    );
    if (deploy) return deploy;
  }
  throw new Error(
    `Ambiguous Render deploy outcome for commit ${sha}; check the service's deploys before dispatching again`,
  );
}

async function triggerDeploy() {
  const triggeredAt = Date.now();
  const existing = await jsonRequest(`${renderUrl}/deploys?limit=100`, { headers: renderHeaders });
  const existingIds = new Set(existing.map(({ deploy }) => deploy.id));
  for (let attempt = 1; attempt <= 4; attempt++) {
    let deploy;
    try {
      deploy = await jsonRequest(`${renderUrl}/deploys`, {
        method: "POST",
        headers: { ...renderHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ commitId: sha }),
      });
    } catch (error) {
      if (!isTransient(error)) throw error;
      if (error.status === 429 || wasNotSent(error)) {
        if (attempt === 4) throw error;
        console.log(`Render refused deploy request (${attempt}/4): ${error.message}`);
        await sleep(retryDelay(error, attempt));
        continue;
      }
      console.log(
        `Render deploy response ambiguous: ${error.message}; checking recent deploys without another POST`,
      );
      return reconcileDeploy(triggeredAt, existingIds);
    }
    if (deploy?.id) return deploy;
    return reconcileDeploy(triggeredAt, existingIds);
  }
}

async function admitStagedCommit() {
  appendFileSync(
    GITHUB_STEP_SUMMARY,
    `## Production staging admission\nSelected SHA: ${sha}\nforce_unstaged: ${FORCE_UNSTAGED}\n`,
  );
  if (FORCE_UNSTAGED === "true") {
    console.log(
      `Operator override force_unstaged permits production release of ${sha} without staging admission`,
    );
    return;
  }
  if (!RENDER_STAGING_SERVICE_ID) {
    throw new Error("Configure the repository variable RENDER_LANDING_STAGING_SERVICE_ID");
  }
  const stagingService = await jsonRequest(
    `https://api.render.com/v1/services/${encodeURIComponent(RENDER_STAGING_SERVICE_ID)}`,
    { headers: renderHeaders },
  );
  const stagingOrigin = stagingService.serviceDetails?.url;
  if (!stagingOrigin) throw new Error("Render did not return the staging landing service URL");
  const url = new URL("/", stagingOrigin);
  url.searchParams.set("orbit-verify", crypto.randomUUID());
  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const html = response.status === 200 ? await response.text() : "";
  const commit = html.match(/<meta name="orbit-build" content="([0-9a-f]{40})"/)?.[1];
  if (response.status !== 200 || commit !== sha) {
    throw new Error(
      `Staging must serve ${sha} with HTTP 200 before production release; got HTTP ${response.status} serving ${commit ?? "no build marker"}; force_unstaged is the explicit override`,
    );
  }
  appendFileSync(GITHUB_STEP_SUMMARY, `Staging served ${sha} with HTTP 200\n`);
}

async function selectStagingBranch() {
  const buildVariables = await jsonRequest(`${renderUrl}/env-vars?limit=100`, {
    headers: renderHeaders,
  });
  for (const key of ["PUBLIC_APP_URL", "PUBLIC_ANDROID_INSTALL_URL"]) {
    const configured = buildVariables.find(({ envVar }) => envVar.key === key)?.envVar.value;
    if (configured !== process.env[key]) {
      throw new Error(
        `Set the Render staging build variable ${key} to ${process.env[key]} before releasing`,
      );
    }
  }

  const updated = await jsonRequest(renderUrl, {
    method: "PATCH",
    headers: { ...renderHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ branch: RELEASE_BRANCH }),
  });
  if (updated.branch !== RELEASE_BRANCH) {
    throw new Error(`Render did not select staging branch ${RELEASE_BRANCH}`);
  }
}

if (production) await admitStagedCommit();

const service = await jsonRequest(renderUrl, { headers: renderHeaders });
if (service.autoDeploy !== "no") {
  throw new Error("The Render landing service must have auto-deploy disabled");
}
const serviceOrigin = service.serviceDetails?.url;
if (!serviceOrigin) throw new Error("Render did not return the landing service URL");

if (!production) await selectStagingBranch();

const deploy = await triggerDeploy();
console.log(`Render deploy ${deploy.id} for ${sha}`);

let live = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const current = await jsonRequest(`${renderUrl}/deploys/${deploy.id}`, {
    headers: renderHeaders,
  });
  if (current.commit?.id && current.commit.id !== sha) {
    throw new Error(`Render is deploying ${current.commit.id} instead of ${sha}`);
  }
  console.log(`Render status: ${current.status}`);
  if (current.status === "live") {
    if (current.commit?.id !== sha) throw new Error("Render did not confirm the deployed SHA");
    live = true;
    break;
  }
  if (
    ["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"].includes(
      current.status,
    )
  ) {
    throw new Error(`Render deploy ended with ${current.status}`);
  }
  await sleep(10_000);
}
if (!live) throw new Error("Render deploy did not go live before the timeout");

const verificationStarted = performance.now();
const verificationDeadline = verificationStarted + 300_000;

async function servedCommit(origin) {
  const url = new URL("/", origin);
  url.searchParams.set("orbit-verify", crypto.randomUUID());
  const remaining = Math.max(1, Math.ceil(verificationDeadline - performance.now()));
  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(Math.min(15_000, remaining)),
  });
  if (response.status !== 200) return { status: response.status, commit: null };
  const html = await response.text();
  return {
    status: 200,
    commit: html.match(/<meta name="orbit-build" content="([0-9a-f]{40})"/)?.[1] ?? null,
  };
}

async function requireServedCommit(origin) {
  while (performance.now() < verificationDeadline) {
    try {
      const result = await servedCommit(origin);
      if (
        result.status === 200 &&
        result.commit === sha &&
        performance.now() <= verificationDeadline
      ) {
        console.log(
          `${origin} serves ${sha} after ${Math.round(performance.now() - verificationStarted)} ms`,
        );
        return;
      }
      console.log(
        `${origin} returned HTTP ${result.status} serving ${result.commit ?? "no build marker"}`,
      );
    } catch (error) {
      console.log(`${origin} check failed: ${error.message}`);
    }
    const remaining = verificationDeadline - performance.now();
    if (remaining > 0) await sleep(Math.min(5_000, remaining));
  }
  throw new Error(`${origin}/ does not serve ${sha} within 300000 ms of Render going live`);
}

await requireServedCommit(serviceOrigin);
if (production) await requireServedCommit("https://useorbit.org");
const environmentUrl = production ? "https://useorbit.org/" : `${serviceOrigin}/`;

const deployment = await jsonRequest(githubUrl, {
  method: "POST",
  headers: { ...githubHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({
    ref: sha,
    environment: RELEASE_ENVIRONMENT,
    auto_merge: false,
    required_contexts: [],
    description: "Render landing release",
  }),
});
if (deployment.sha !== sha) throw new Error("GitHub Deployment did not record the deployed SHA");

await jsonRequest(`${githubUrl}/${deployment.id}/statuses`, {
  method: "POST",
  headers: { ...githubHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({
    state: "success",
    environment_url: environmentUrl,
    log_url: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
    description: "Render deploy is live and serves the deployed commit",
  }),
});
console.log(`GitHub Deployment ${deployment.id} succeeded for ${sha}`);
appendFileSync(
  GITHUB_STEP_SUMMARY,
  `## Landing ${RELEASE_ENVIRONMENT} release\nDeployed SHA: ${sha}\n`,
);
