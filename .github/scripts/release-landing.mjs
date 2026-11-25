import { appendFileSync } from "node:fs";

const buildMarkerPattern = /<meta name="orbit-build" content="([0-9a-f]{40})"/;
const publicOrigin = "https://useorbit.org";
const servedCommitReads = 36;
const servedCommitInterval = 5_000;
const failedDeployStatuses = [
  "build_failed",
  "update_failed",
  "pre_deploy_failed",
  "canceled",
  "deactivated",
];

function releaseSettings(env) {
  const environment = env.RELEASE_ENVIRONMENT;
  if (!["production", "staging"].includes(environment)) {
    throw new Error(`Set RELEASE_ENVIRONMENT to production or staging, got ${environment}`);
  }
  const production = environment === "production";
  const serviceId = production ? env.RENDER_PRODUCTION_SERVICE_ID : env.RENDER_STAGING_SERVICE_ID;
  if (!env.RENDER_API_KEY || !serviceId || !env.GH_TOKEN) {
    throw new Error(`Configure RENDER_API_KEY, the ${environment} service ID and GH_TOKEN`);
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
  const response = await context.fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body = await response.text();
  return body.trim() === "" ? null : JSON.parse(body);
}

async function readServedCommit(context, origin) {
  const response = await context.fetch(new URL("/", origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const html = response.status === 200 ? await response.text() : "";
  return { status: response.status, commit: html.match(buildMarkerPattern)?.[1] };
}

async function waitForServedCommit(context, origin) {
  for (let read = 1; ; read++) {
    const served = await readServedCommit(context, origin);
    if ((served.status === 200 && served.commit === context.sha) || read === servedCommitReads) {
      return served;
    }
    await context.sleep(servedCommitInterval);
  }
}

async function admitStagedCommit(context) {
  const { env, sha } = context;
  context.appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Production staging admission\nSelected SHA: ${sha}\nforce_unstaged: ${env.FORCE_UNSTAGED}\n`,
  );
  if (env.FORCE_UNSTAGED === "true") {
    context.log(`force_unstaged permits production release of ${sha} without staging admission`);
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
  const { status, commit } = await waitForServedCommit(context, stagingOrigin);
  if (status !== 200 || commit !== sha) {
    throw new Error(
      `Staging must serve ${sha} with HTTP 200 before production release; got HTTP ${status} serving ${commit ?? "no build marker"}; force_unstaged is the explicit override`,
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

async function triggerDeploy(context) {
  const deploy = await jsonRequest(context, `${context.renderUrl}/deploys`, {
    method: "POST",
    headers: { ...context.renderHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ commitId: context.sha }),
  });
  if (!deploy?.id) {
    throw new Error(`Render returned no deploy for ${context.sha}; check the service deploys`);
  }
  return deploy;
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
    if (current.status === "live") return;
    if (failedDeployStatuses.includes(current.status)) {
      throw new Error(`Render deploy ended with ${current.status}`);
    }
    await context.sleep(10_000);
  }
  throw new Error("Render deploy did not go live before the timeout");
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
      task: "deploy",
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
 * Deploys `env.RELEASE_SHA` to the Render landing service of `env.RELEASE_ENVIRONMENT`, checks
 * polls the build marker of the public origin for about 3 minutes until it serves the SHA, and records a GitHub Deployment. Every side effect
 * goes through the dependencies, so a test can drive the whole release with fakes.
 */
export async function release(dependencies) {
  const context = { ...dependencies, ...releaseSettings(dependencies.env) };
  const { env, sha, production } = context;
  if (production) await admitStagedCommit(context);
  const serviceOrigin = await readServiceOrigin(context);
  if (!production) await selectStagingBranch(context);
  const deploy = await triggerDeploy(context);
  context.log(`Render deploy ${deploy.id} for ${sha}`);
  await waitUntilLive(context, deploy.id);
  const origin = production ? publicOrigin : serviceOrigin;
  const { status, commit } = await waitForServedCommit(context, origin);
  if (status !== 200 || commit !== sha) {
    throw new Error(
      `${origin}/ must serve ${sha} with HTTP 200; got HTTP ${status} serving ${commit ?? "no build marker"}`,
    );
  }
  await recordDeployment(context, `${origin}/`);
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
    appendFileSync,
    log: (message) => console.log(message),
  });
}
