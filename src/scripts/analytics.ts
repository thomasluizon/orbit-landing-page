import type { PostHog, PostHogConfig } from "@posthog/types";

type MethodQueue = unknown[] & Record<string, unknown>;
type AnalyticsQueue = MethodQueue & {
  _i: unknown[];
  people: MethodQueue;
  init: (token: string, config: Partial<PostHogConfig>) => void;
};

declare global {
  interface Window {
    posthog?: PostHog;
  }
}

function installPostHogStub(): PostHog {
  if (window.posthog) return window.posthog;
  const queue = [] as unknown as AnalyticsQueue;
  window.posthog = queue as unknown as PostHog;
  queue._i = [];
  queue.__SV = 1;
  queue.init = (token, config) => {
    const script = document.createElement("script");
    script.crossOrigin = "anonymous";
    script.async = true;
    script.src = `${config.api_host}/static/array.js`;
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode?.insertBefore(script, firstScript);
    queue.people = [] as unknown as MethodQueue;
    for (const [target, methods] of [
      [queue, ["capture", "set_config"]],
      [queue.people, ["set", "set_once"]],
    ] as const) {
      for (const method of methods) {
        target[method] = (...args: unknown[]) => target.push([method, ...args]);
      }
    }
    queue._i.push([token, config, "posthog"]);
  };
  return queue as unknown as PostHog;
}

const analyticsKey = import.meta.env.PUBLIC_POSTHOG_KEY;
let analyticsStarted = false;
let consentGranted = false;
let pageSettled = false;

function startAnalytics() {
  if (!analyticsKey || analyticsStarted || !consentGranted || !pageSettled) return;
  analyticsStarted = true;
  installPostHogStub().init(analyticsKey, {
    api_host: `${location.origin}/relay`,
    ui_host: "https://us.posthog.com",
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: true,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    loaded: (posthog) => {
      window.dispatchEvent(new CustomEvent("orbit:analytics-ready", { detail: posthog }));
    },
  });
}

if (analyticsKey) {
  window.addEventListener("orbit:analytics-consent-granted", () => {
    consentGranted = true;
    startAnalytics();
  });
  window.addEventListener(
    "load",
    () => {
      const markPageSettled = () => {
        pageSettled = true;
        startAnalytics();
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(markPageSettled, { timeout: 2000 });
      } else {
        window.setTimeout(markPageSettled, 0);
      }
    },
    { once: true },
  );
}
