import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: options.once === true });
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const listeners = [...(this.listeners.get(event.type) ?? [])];
    for (const entry of listeners) {
      entry.listener.call(this, event);
      if (entry.once) {
        this.listeners.set(
          event.type,
          (this.listeners.get(event.type) ?? []).filter((candidate) => candidate !== entry),
        );
      }
    }
    return true;
  }
}

class FakeElement extends FakeEventTarget {
  classNames = new Set();
  dataset = {};
  hidden = false;

  constructor(tagName = "a") {
    super();
    this.tagName = tagName;
  }

  classList = {
    add: (...names) => names.forEach((name) => this.classNames.add(name)),
    remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
  };

  click() {
    this.dispatchEvent({ type: "click", target: this });
  }

  closest(selector) {
    const selectors = selector.split(",").map((candidate) => candidate.trim());
    const analyticsSelector = `${this.tagName}[data-analytics-event]`;
    return this.dataset.analyticsEvent && selectors.includes(analyticsSelector) ? this : null;
  }
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createHarness(initialChoice = null) {
  const networkRequests = [];
  const capturedEvents = [];
  const capturedCalls = [];
  const configUpdates = [];
  const values = new Map();
  if (initialChoice) values.set("orbit_analytics_consent", initialChoice);

  const banner = new FakeElement();
  banner.hidden = true;
  const acceptButton = new FakeElement();
  const declineButton = new FakeElement();
  const elements = new Map([
    ["consent-banner", banner],
    ["consent-accept", acceptButton],
    ["consent-decline", declineButton],
  ]);

  const document = new FakeEventTarget();
  document.getElementById = (id) => elements.get(id) ?? null;
  document.createElement = () => ({});
  document.getElementsByTagName = () => [
    {
      parentNode: {
        insertBefore(script) {
          const upstreamUrl = script.src.replace(
            "https://useorbit.org/relay/static/",
            "https://us-assets.i.posthog.com/static/",
          );
          networkRequests.push(upstreamUrl);
        },
      },
    },
  ];

  const window = new FakeEventTarget();
  window.setTimeout = (callback) => callback();
  window.requestIdleCallback = (callback) => callback();

  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const context = vm.createContext({
    CustomEvent: FakeCustomEvent,
    Element: FakeElement,
    console,
    document,
    exports: {},
    localStorage,
    location: { origin: "https://useorbit.org" },
    requestAnimationFrame: (callback) => callback(),
    window,
  });

  function completePostHogLoad() {
    const initialization = window.posthog?._i?.[0];
    if (!initialization) return null;
    const config = initialization[1];
    const analytics = {
      capture(eventName, properties, options) {
        capturedEvents.push(eventName);
        capturedCalls.push({
          eventName,
          properties: properties ? { ...properties } : null,
          options: options ? { ...options } : null,
        });
        networkRequests.push("https://us.i.posthog.com/e/");
      },
      set_config(update) {
        configUpdates.push(update);
      },
    };
    if (config.capture_pageview !== false) analytics.capture("$pageview");
    if (config.capture_pageleave !== false) {
      window.addEventListener("pagehide", () => analytics.capture("$pageleave"));
    }
    config.loaded?.(analytics);
    return { analytics, config };
  }

  return {
    acceptButton,
    banner,
    capturedCalls,
    capturedEvents,
    completePostHogLoad,
    configUpdates,
    context,
    declineButton,
    document,
    networkRequests,
    window,
  };
}

async function executeProductionScripts(harness) {
  const layout = await readFile("src/layouts/Layout.astro", "utf8");
  const inlineScript = layout.match(
    /<script is:inline define:vars=\{\{ posthogKey \}\}>\s*([\s\S]*?)\s*<\/script>/,
  )?.[1];
  assert.ok(inlineScript, "PostHog inline script exists");
  vm.runInContext(`const posthogKey = "phc_test";\n${inlineScript}`, harness.context);

  const consentSource = await readFile("src/scripts/consent.ts", "utf8");
  const consentScript = ts.transpileModule(consentSource, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(consentScript, harness.context);
}

test("a first-time visitor makes no PostHog request and captures nothing before consent", async () => {
  const harness = createHarness();
  await executeProductionScripts(harness);

  harness.window.dispatchEvent({ type: "load" });
  harness.completePostHogLoad();
  harness.window.dispatchEvent({ type: "pagehide" });

  assert.deepEqual(harness.networkRequests, []);
  assert.deepEqual(harness.capturedEvents, []);
});

test("a first-time visitor can allow analytics and capture a hero CTA click", async () => {
  const harness = createHarness();
  await executeProductionScripts(harness);

  harness.window.dispatchEvent({ type: "load" });
  assert.equal(harness.banner.hidden, false);
  assert.equal(harness.banner.classNames.has("is-visible"), true);

  harness.acceptButton.click();
  assert.equal(harness.context.localStorage.getItem("orbit_analytics_consent"), "accepted");
  harness.completePostHogLoad();

  const cta = new FakeElement();
  cta.dataset.analyticsEvent = "hero_app_cta_clicked";
  cta.dataset.analyticsSurface = "hero";
  harness.document.dispatchEvent({ type: "click", target: cta });

  assert.deepEqual(harness.networkRequests, [
    "https://us-assets.i.posthog.com/static/array.js",
    "https://us.i.posthog.com/e/",
    "https://us.i.posthog.com/e/",
  ]);
  assert.deepEqual(harness.capturedEvents, ["$pageview", "hero_app_cta_clicked"]);
  assert.deepEqual(harness.capturedCalls, [
    { eventName: "$pageview", properties: null, options: null },
    {
      eventName: "hero_app_cta_clicked",
      properties: { surface: "hero" },
      options: { transport: "sendBeacon", send_instantly: true },
    },
  ]);
});

test("decline prevents all later PostHog requests and captures now and after reload", async () => {
  const harness = createHarness();
  await executeProductionScripts(harness);

  harness.window.dispatchEvent({ type: "load" });
  harness.completePostHogLoad();
  harness.declineButton.click();
  harness.networkRequests.length = 0;
  harness.capturedEvents.length = 0;

  const cta = new FakeElement();
  cta.dataset.analyticsEvent = "hero_app_cta_clicked";
  cta.dataset.analyticsSurface = "hero";
  harness.document.dispatchEvent({ type: "click", target: cta });
  harness.window.dispatchEvent({ type: "pagehide" });

  assert.deepEqual(harness.networkRequests, []);
  assert.deepEqual(harness.capturedEvents, []);

  const reload = createHarness("declined");
  await executeProductionScripts(reload);
  reload.window.dispatchEvent({ type: "load" });
  reload.completePostHogLoad();
  reload.document.dispatchEvent({ type: "click", target: cta });
  reload.window.dispatchEvent({ type: "pagehide" });

  assert.deepEqual(reload.networkRequests, []);
  assert.deepEqual(reload.capturedEvents, []);
});

test("a returning accepted visitor chooses cookie persistence before PostHog init", async () => {
  const harness = createHarness("accepted");
  await executeProductionScripts(harness);

  harness.window.dispatchEvent({ type: "load" });
  const initialization = harness.completePostHogLoad();

  assert.equal(initialization?.config.persistence, "localStorage+cookie");
  assert.equal(initialization?.config.cross_subdomain_cookie, true);
  assert.deepEqual(harness.configUpdates, []);
});

test("an accepted visitor captures analytics from a button", async () => {
  const harness = createHarness("accepted");
  await executeProductionScripts(harness);
  harness.window.dispatchEvent({ type: "load" });
  harness.completePostHogLoad();
  harness.capturedEvents.length = 0;

  const button = new FakeElement("button");
  button.dataset.analyticsEvent = "consent_action_clicked";
  button.dataset.analyticsSurface = "consent_banner";
  harness.document.dispatchEvent({ type: "click", target: button });

  assert.deepEqual(harness.capturedEvents, ["consent_action_clicked"]);
});
