import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { parse } from "@astrojs/compiler";
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
  focused = false;

  focus() {
    this.focused = true;
  }

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

function createHarness(initialChoice = null, values = new Map()) {
  const networkRequests = [];
  const capturedEvents = [];
  const capturedCalls = [];
  const configUpdates = [];
  const consentCalls = [];
  if (initialChoice) values.set("orbit_analytics_consent", initialChoice);

  const banner = new FakeElement();
  banner.hidden = true;
  const acceptButton = new FakeElement();
  const declineButton = new FakeElement();
  const preferencesButton = new FakeElement("button");
  const elements = new Map([
    ["consent-banner", banner],
    ["consent-accept", acceptButton],
    ["consent-decline", declineButton],
    ["cookie-preferences", preferencesButton],
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
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  function advanceTime(duration) {
    const destination = now + duration;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= destination)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = destination;
  }
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
    performance: { now: () => now },
    requestAnimationFrame: (callback) => callback(),
    window,
  });

  function completePostHogLoad() {
    const initialization = window.posthog?._i?.[0];
    if (!initialization) return null;
    const queued = [...window.posthog];
    const token = initialization[0];
    const config = initialization[1];
    const consentKey = `__ph_opt_in_out_${token}`;
    let initialPageviewCaptured = false;
    const captureInitialPageview = () => {
      if (
        !config.capture_pageview ||
        initialPageviewCaptured ||
        analytics.has_opted_out_capturing()
      )
        return;
      initialPageviewCaptured = true;
      analytics.capture("$pageview");
    };
    const analytics = {
      opt_in_capturing() {
        consentCalls.push("in");
        values.set(consentKey, "1");
        analytics.capture("$opt_in", undefined, { send_instantly: true });
        captureInitialPageview();
      },
      opt_out_capturing() {
        consentCalls.push("out");
        values.set(consentKey, "0");
      },
      has_opted_out_capturing() {
        const preference = values.get(consentKey);
        return (
          preference === "0" ||
          (preference === undefined && config.opt_out_capturing_by_default === true)
        );
      },
      capture(eventName, properties, options) {
        if (analytics.has_opted_out_capturing()) return;
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
    window.posthog = analytics;
    for (const [method, ...args] of queued) analytics[method]?.(...args);
    config.loaded?.(analytics);
    captureInitialPageview();
    if (config.capture_pageleave !== false) {
      window.addEventListener("pagehide", () => analytics.capture("$pageleave"));
    }
    return { analytics, config };
  }

  return {
    acceptButton,
    advanceTime,
    pendingTimers: () => timers.size,
    banner,
    capturedCalls,
    capturedEvents,
    completePostHogLoad,
    configUpdates,
    consentCalls,
    context,
    declineButton,
    preferencesButton,
    document,
    networkRequests,
    values,
    window,
  };
}

async function executeProductionScripts(harness) {
  const layout = await readFile("src/layouts/Layout.astro", "utf8");
  const imports = [...layout.matchAll(/import "\.\.\/scripts\/(analytics|consent)";/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(imports, ["analytics", "consent"]);
  harness.context.environment = { PUBLIC_POSTHOG_KEY: "phc_test" };
  for (const name of imports) {
    const source = await readFile(`src/scripts/${name}.ts`, "utf8");
    const script = ts.transpileModule(source.replaceAll("import.meta.env", "environment"), {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(script, harness.context);
  }
}

async function pricingControls() {
  const { ast } = await parse(await readFile("src/components/Pricing.astro", "utf8"));
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const buttons = descendants(ast).filter((node) => node.name === "PillButton");
  assert.equal(buttons.length, 2);
  return buttons.map((button) => {
    const attributes = Object.fromEntries(
      button.attributes.map(({ name, value }) => [name, value]),
    );
    const control = new FakeElement();
    control.dataset.analyticsEvent = attributes.analyticsEvent;
    control.dataset.analyticsSurface = attributes.analyticsSurface;
    return control;
  });
}

for (const [index, plan] of ["free", "pro"].entries()) {
  test(`allowing consent captures the ${plan} pricing control's event and surface`, async () => {
    const control = (await pricingControls())[index];
    const harness = createHarness();
    await executeProductionScripts(harness);
    harness.window.dispatchEvent({ type: "load" });
    harness.acceptButton.click();
    harness.completePostHogLoad();
    harness.capturedCalls.length = 0;
    harness.document.dispatchEvent({ type: "click", target: control });

    assert.deepEqual(harness.capturedCalls, [
      {
        eventName: `pricing_${plan}_cta_clicked`,
        properties: { surface: `pricing_${plan}` },
        options: { transport: "sendBeacon", send_instantly: true },
      },
    ]);

    harness.preferencesButton.click();
    harness.declineButton.click();
    harness.capturedCalls.length = 0;
    harness.networkRequests.length = 0;
    harness.document.dispatchEvent({ type: "click", target: control });
    assert.deepEqual(harness.capturedCalls, []);
    assert.deepEqual(harness.networkRequests, []);
  });

  test(`declining consent prevents ${plan} pricing capture now and after reload`, async () => {
    const control = (await pricingControls())[index];
    const harness = createHarness();
    await executeProductionScripts(harness);
    harness.window.dispatchEvent({ type: "load" });
    harness.declineButton.click();
    harness.completePostHogLoad();
    harness.document.dispatchEvent({ type: "click", target: control });
    assert.deepEqual(harness.capturedCalls, []);
    assert.deepEqual(harness.networkRequests, []);

    const reload = createHarness("declined");
    await executeProductionScripts(reload);
    reload.window.dispatchEvent({ type: "load" });
    reload.completePostHogLoad();
    reload.document.dispatchEvent({ type: "click", target: control });
    assert.deepEqual(reload.capturedCalls, []);
    assert.deepEqual(reload.networkRequests, []);
  });
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

test("an accepted visitor queues people mutations while PostHog loads", async () => {
  const harness = createHarness("accepted");
  await executeProductionScripts(harness);

  harness.window.dispatchEvent({ type: "load" });
  harness.window.posthog.people.set({ plan: "pro" });
  harness.window.posthog.people.set_once({ acquisition: "landing" });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.window.posthog.people)), [
    ["set", { plan: "pro" }],
    ["set_once", { acquisition: "landing" }],
  ]);
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

test("cookie preferences reopens an accepted choice, supports withdrawal and reacceptance, and returns focus", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.completePostHogLoad();
  h.preferencesButton.click();
  assert.equal(h.banner.hidden, false);
  assert.equal(h.declineButton.focused, true);
  h.declineButton.click();
  assert.equal(h.context.localStorage.getItem("orbit_analytics_consent"), "declined");
  assert.deepEqual(h.consentCalls, ["out"]);
  assert.equal(h.preferencesButton.focused, true);
  h.capturedEvents.length = 0;
  const cta = new FakeElement();
  cta.dataset.analyticsEvent = "hero_app_cta_clicked";
  cta.dataset.analyticsSurface = "footer";
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(h.capturedEvents, []);
  h.preferencesButton.click();
  h.acceptButton.click();
  assert.deepEqual(h.consentCalls, ["out", "in"]);
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(h.capturedEvents, ["$opt_in", "hero_app_cta_clicked"]);
});

test("withdrawal survives reload and reacceptance resumes pageviews and CTA capture", async () => {
  const h = createHarness();
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.acceptButton.click();
  h.completePostHogLoad();
  h.preferencesButton.click();
  h.declineButton.click();
  assert.equal(h.values.get("__ph_opt_in_out_phc_test"), "0");

  const cta = new FakeElement();
  cta.dataset.analyticsEvent = "hero_app_cta_clicked";
  cta.dataset.analyticsSurface = "hero";
  h.capturedEvents.length = 0;
  h.networkRequests.length = 0;
  h.document.dispatchEvent({ type: "click", target: cta });
  h.window.dispatchEvent({ type: "pagehide" });
  assert.deepEqual(h.capturedEvents, []);
  assert.deepEqual(h.networkRequests, []);

  const reload = createHarness(null, h.values);
  await executeProductionScripts(reload);
  reload.window.dispatchEvent({ type: "load" });
  assert.equal(reload.completePostHogLoad(), null);
  reload.document.dispatchEvent({ type: "click", target: cta });
  reload.window.dispatchEvent({ type: "pagehide" });
  assert.deepEqual(reload.networkRequests, []);

  reload.preferencesButton.click();
  reload.acceptButton.click();
  assert.equal(reload.values.get("orbit_analytics_consent"), "accepted");
  const loaded = reload.completePostHogLoad();
  assert.equal(loaded.analytics.has_opted_out_capturing(), false);
  assert.equal(reload.values.get("__ph_opt_in_out_phc_test"), "1");
  reload.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(reload.capturedEvents, ["$opt_in", "$pageview", "hero_app_cta_clicked"]);

  reload.preferencesButton.click();
  reload.declineButton.click();
  reload.capturedEvents.length = 0;
  reload.networkRequests.length = 0;
  reload.document.dispatchEvent({ type: "click", target: cta });
  reload.window.dispatchEvent({ type: "pagehide" });
  assert.deepEqual(reload.capturedEvents, []);
  assert.deepEqual(reload.networkRequests, []);
});

test("withdrawal while the SDK loads remains opted out when loading completes", async () => {
  const h = createHarness();
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.acceptButton.click();
  h.preferencesButton.click();
  h.declineButton.click();
  const loaded = h.completePostHogLoad();
  assert.equal(loaded.analytics.has_opted_out_capturing(), true);
  h.window.dispatchEvent({ type: "pagehide" });
  assert.deepEqual(h.capturedEvents, []);
});

test("a previously declined visitor can reopen preferences and allow the original consent-gated loader", async () => {
  const h = createHarness("declined");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  assert.equal(h.banner.hidden, true);
  h.preferencesButton.click();
  assert.equal(h.banner.hidden, false);
  h.acceptButton.click();
  assert.equal(h.context.localStorage.getItem("orbit_analytics_consent"), "accepted");
  assert.ok(h.completePostHogLoad());
  assert.deepEqual(h.capturedEvents, ["$pageview"]);
});

test("withdrawal before the page settles cancels deferred analytics initialization", async () => {
  const h = createHarness();
  await executeProductionScripts(h);
  h.preferencesButton.click();
  h.acceptButton.click();
  h.preferencesButton.click();
  h.declineButton.click();
  h.window.dispatchEvent({ type: "load" });
  assert.equal(h.context.localStorage.getItem("orbit_analytics_consent"), "declined");
  assert.deepEqual(h.networkRequests, []);
  assert.equal(h.completePostHogLoad(), null);
});

async function pageNodes(path) {
  const source = await readFile(path, "utf8");
  const imports = new Map(
    [...source.matchAll(/import (\w+) from "(\.[^"]+\.astro)";/g)].map(([, name, relative]) => [
      name,
      resolve(dirname(path), relative),
    ]),
  );
  const { ast } = await parse(source);
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const nodes = descendants(ast);
  const children = await Promise.all(
    nodes.filter((node) => imports.has(node.name)).map((node) => pageNodes(imports.get(node.name))),
  );
  return [...nodes, ...children.flat()];
}

for (const page of ["index", "waitlist-confirmed", "404"]) {
  test(`${page} exposes one bilingual cookie preferences button connected to the shared banner`, async () => {
    const nodes = await pageNodes(`src/pages/${page}.astro`);
    const attribute = (node, name) => node.attributes?.find((entry) => entry.name === name)?.value;
    const controls = nodes.filter((node) => attribute(node, "id") === "cookie-preferences");
    assert.equal(controls.length, 1, `${page} must expose one preferences control`);
    assert.equal(controls[0].name, "button");
    assert.equal(attribute(controls[0], "type"), "button");
    assert.equal(attribute(controls[0], "aria-controls"), "consent-banner");
    assert.equal(nodes.filter((node) => attribute(node, "id") === "consent-banner").length, 1);
    const copy = controls[0].children.find((node) => node.name === "Copy");
    const source = await readFile("src/i18n/translations.ts", "utf8");
    const script = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const context = vm.createContext({ exports: {} });
    vm.runInContext(script, context);
    const key = attribute(copy, "name");
    assert.equal(context.exports.landingCopy.en[key], "Cookie preferences");
    assert.equal(context.exports.landingCopy["pt-BR"][key], "Preferências de cookies");
  });
}

test("reopening consent and keeping Allow continues CTA capture", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.completePostHogLoad();
  h.preferencesButton.click();
  h.acceptButton.click();
  h.capturedCalls.length = 0;
  const cta = (await pricingControls())[0];
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.equal(h.values.get("orbit_analytics_consent"), "accepted");
  assert.deepEqual(h.capturedEvents.slice(-1), ["pricing_free_cta_clicked"]);
  assert.equal(h.preferencesButton.focused, true);
});

function ctaCaptures(harness) {
  return harness.capturedCalls.filter(({ eventName }) => !eventName.startsWith("$"));
}

const freePricingCapture = {
  eventName: "pricing_free_cta_clicked",
  properties: { surface: "pricing_free" },
  options: { transport: "sendBeacon", send_instantly: true },
};

test("a newly accepted CTA click before SDK readiness is captured exactly once on ready", async () => {
  const h = createHarness();
  const cta = (await pricingControls())[0];
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.acceptButton.click();
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(h.capturedCalls, []);
  const loaded = h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
  h.window.dispatchEvent(
    new FakeCustomEvent("orbit:analytics-ready", { detail: loaded.analytics }),
  );
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
});

test("a returning accepted visitor's CTA before the page settles is captured on ready", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  const cta = (await pricingControls())[0];
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(h.networkRequests, []);
  h.window.dispatchEvent({ type: "load" });
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
});

for (const choice of [null, "declined"]) {
  test(`CTA clicks with ${choice ?? "no"} consent are never retrospectively captured after acceptance`, async () => {
    const h = createHarness(choice);
    await executeProductionScripts(h);
    const cta = (await pricingControls())[0];
    h.window.dispatchEvent({ type: "load" });
    h.document.dispatchEvent({ type: "click", target: cta });
    h.preferencesButton.click();
    h.acceptButton.click();
    h.completePostHogLoad();
    assert.deepEqual(ctaCaptures(h), []);
    h.document.dispatchEvent({ type: "click", target: cta });
    assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
  });
}

test("keeping acceptance while the SDK loads preserves the pending CTA", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  const cta = (await pricingControls())[0];
  h.document.dispatchEvent({ type: "click", target: cta });
  h.preferencesButton.click();
  h.acceptButton.click();
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
});

for (const reacceptBeforeReady of [false, true]) {
  test(`withdrawal discards pending clicks with reacceptance ${reacceptBeforeReady ? "before" : "after"} ready`, async () => {
    const h = createHarness("accepted");
    await executeProductionScripts(h);
    h.window.dispatchEvent({ type: "load" });
    const cta = (await pricingControls())[0];
    h.document.dispatchEvent({ type: "click", target: cta });
    h.preferencesButton.click();
    h.declineButton.click();
    h.document.dispatchEvent({ type: "click", target: cta });
    if (reacceptBeforeReady) {
      h.preferencesButton.click();
      h.acceptButton.click();
    }
    h.completePostHogLoad();
    assert.deepEqual(ctaCaptures(h), []);
    if (!reacceptBeforeReady) {
      h.preferencesButton.click();
      h.acceptButton.click();
    }
    h.document.dispatchEvent({ type: "click", target: cta });
    assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
  });
}

test("the pending CTA queue retains only the latest 20 events in order", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  const controls = await pricingControls();
  for (let index = 0; index < 25; index++) {
    h.document.dispatchEvent({ type: "click", target: controls[index < 5 ? 0 : index % 2] });
  }
  h.completePostHogLoad();
  assert.deepEqual(
    ctaCaptures(h),
    Array.from({ length: 20 }, (_, index) => {
      const plan = index % 2 === 0 ? "pro" : "free";
      return {
        eventName: `pricing_${plan}_cta_clicked`,
        properties: { surface: `pricing_${plan}` },
        options: { transport: "sendBeacon", send_instantly: true },
      };
    }),
  );
});

test("a pending CTA just under 30 seconds old still captures", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  h.document.dispatchEvent({ type: "click", target: (await pricingControls())[0] });
  h.advanceTime(29_999);
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
  assert.equal(h.pendingTimers(), 0);
});

test("the queue expires at 30 seconds even when PostHog never loads", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  const cta = (await pricingControls())[0];
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.equal(h.pendingTimers(), 1);
  h.advanceTime(30_000);
  assert.equal(h.pendingTimers(), 0);
  assert.deepEqual(h.capturedEvents, []);
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), []);
});

test("expiry removes old pending clicks while retaining a newer click", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  const [free, pro] = await pricingControls();
  h.document.dispatchEvent({ type: "click", target: pro });
  h.advanceTime(15_000);
  h.document.dispatchEvent({ type: "click", target: free });
  h.advanceTime(15_000);
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
  assert.equal(h.pendingTimers(), 0);
});

test("pagehide discards pending CTA events even if the same document resumes", async () => {
  const h = createHarness("accepted");
  await executeProductionScripts(h);
  h.window.dispatchEvent({ type: "load" });
  const cta = (await pricingControls())[0];
  h.document.dispatchEvent({ type: "click", target: cta });
  h.window.dispatchEvent({ type: "pagehide" });
  h.completePostHogLoad();
  assert.deepEqual(ctaCaptures(h), []);
  h.document.dispatchEvent({ type: "click", target: cta });
  assert.deepEqual(ctaCaptures(h), [freePricingCapture]);
});
