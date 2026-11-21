import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const scripts = new Map();
for (const path of ["../config/pricing", "../i18n/translations", "./i18n", "./waitlist"]) {
  const source = await readFile(new URL(`../src/scripts/${path}.ts`, import.meta.url), "utf8");
  scripts.set(
    path,
    ts.transpileModule(source.replaceAll("import.meta.env", "environment"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
}

function createHarness(
  language,
  responses,
  {
    dev = true,
    renderFailures = 0,
    siteKey = "test-site-key",
    loader = "ready",
    renderError,
    width = 312,
  } = {},
) {
  const requests = [];
  const resets = [];
  const removals = [];
  const logs = [];
  const appendedScripts = [];
  const windowListeners = new Map();
  const timers = new Map();
  let now = 0;
  let timerId = 0;
  let resizeCallback;
  let statusUpdates = 0;
  let challenge;
  let renderCalls = 0;
  let formResets = 0;
  let widgetPresent = false;
  const elements = new Map();
  for (const id of ["form", "email", "submit", "submit-label", "status", "turnstile"]) {
    elements.set(`waitlist-${id}`, {
      value: "person@example.com",
      textContent: "",
      style: {},
      dataset: {},
      disabled: true,
      listeners: new Map(),
      addEventListener(type, listener) {
        this.listeners.set(type, listener);
      },
      focus() {},
      getBoundingClientRect: () => ({
        width: id === "turnstile" && !widgetPresent ? 0 : width,
      }),
      reset() {
        formResets++;
      },
    });
  }
  elements.set("lang-toggle", {
    setAttribute() {},
    addEventListener: (type, listener) => windowListeners.set(`toggle:${type}`, listener),
  });
  let statusText = "";
  Object.defineProperty(elements.get("waitlist-status"), "textContent", {
    get: () => statusText,
    set(value) {
      statusUpdates++;
      statusText = value;
    },
  });
  let vendorTimer;
  const vendorError = (options) => {
    options["error-callback"](renderError);
    vendorTimer = schedule(() => vendorError(options), 2000 + (options["retry-interval"] ?? 8000));
  };
  const api = {
    render(container, options) {
      assert.equal(container, elements.get("waitlist-turnstile"));
      renderCalls++;
      if (renderCalls <= renderFailures) throw new Error("Turnstile render failed");
      widgetPresent = true;
      challenge = options;
      if (renderError) vendorError(options);
      return "test-widget";
    },
    reset: (id) => resets.push(id),
    remove: (id) => {
      widgetPresent = false;
      removals.push(id);
      cancel(vendorTimer);
    },
  };
  const schedule = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  const cancel = (id) => timers.delete(id);
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  const context = vm.createContext({
    environment: { PUBLIC_TURNSTILE_SITE_KEY: siteKey, DEV: dev },
    navigator: { language },
    console: { error: (...args) => logs.push(args) },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setTimeout: schedule,
    clearTimeout: cancel,
    queueMicrotask,
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    ResizeObserver: class {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
    },
    document: {
      cookie: `orbit_lang=${language}`,
      head: {
        append(script) {
          appendedScripts.push(script);
          if (loader === "network-error") queueMicrotask(() => script.fire("error"));
          if (loader === "empty") queueMicrotask(() => script.fire("load"));
        },
      },
      createElement() {
        const listeners = new Map();
        return {
          removed: false,
          addEventListener: (type, callback) => listeners.set(type, callback),
          removeEventListener: (type) => listeners.delete(type),
          fire: (type) => listeners.get(type)?.(),
          remove() {
            this.removed = true;
          },
        };
      },
      documentElement: {},
      querySelectorAll: () => [],
      getElementById: (id) => elements.get(id) ?? null,
    },
    window: {
      turnstile: loader === "ready" ? api : undefined,
      addEventListener: (type, listener) => windowListeners.set(type, listener),
      dispatchEvent: (event) => windowListeners.get(event.type)?.(event),
    },
    fetch: async (url, options) => {
      requests.push({ url, ...options, headers: { ...options.headers } });
      const response = responses.shift();
      assert.ok(response, "a response is available for every request");
      if (response instanceof Error) throw response;
      return response;
    },
  });
  const modules = new Map();
  function require(path) {
    if (!modules.has(path)) {
      assert.ok(scripts.has(path), `production module exists: ${path}`);
      const exports = {};
      vm.runInContext(`(function(exports, require) {\n${scripts.get(path)}\n})`, context)(
        exports,
        require,
      );
      modules.set(path, exports);
    }
    return modules.get(path);
  }
  require("./waitlist");
  return {
    requests,
    resets,
    removals,
    logs,
    appendedScripts,
    timers,
    flush,
    get statusUpdates() {
      return statusUpdates;
    },
    async advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = target;
      await flush();
    },
    async loadScript({ globalCallback = true } = {}) {
      context.window.turnstile = api;
      if (globalCallback) context.window.onWaitlistTurnstileLoad?.();
      else appendedScripts.at(-1).fire("load");
      await flush();
    },
    get loadGlobal() {
      return context.window.onWaitlistTurnstileLoad;
    },
    toggleLanguage: () => windowListeners.get("toggle:click")(),
    resize(value, event = "resize") {
      width = value;
      windowListeners.get(event)?.();
      resizeCallback?.();
    },
    elements,
    strings: require("../i18n/translations").translations[language],
    get formResets() {
      return formResets;
    },
    get renderCalls() {
      return renderCalls;
    },
    triggerChallenge: (event) => elements.get("waitlist-email").listeners.get(event)(),
    get challenge() {
      return challenge;
    },
    async solve(token) {
      elements.get("waitlist-email").listeners.get("focus")();
      await flush();
      assert.ok(challenge, "focus initializes the production challenge");
      challenge.callback(token);
    },
    submit: () => elements.get("waitlist-form").listeners.get("submit")({ preventDefault() {} }),
  };
}

const challengeRejection = () =>
  Response.json(
    { error: "Invalid verification token", requestId: "test-request" },
    { status: 400 },
  );

for (const language of ["en", "pt-BR"]) {
  test(`${language}: missing key stays closed and announces failure once across 25 keystrokes`, async () => {
    const harness = createHarness(language, [], { siteKey: "" });
    for (let i = 0; i < 25; i++) {
      harness.elements.get("waitlist-email").value += "a";
      harness.triggerChallenge("input");
    }
    await harness.flush();
    assert.equal(harness.elements.get("waitlist-submit").disabled, true);
    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.challengeFailed"],
    );
    assert.equal(harness.statusUpdates, 1);
    harness.elements.get("waitlist-email").value = "person@example.com";
    await harness.submit();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.statusUpdates, 1);
  });

  test(`${language}: server challenge rejection shows recovery and retries with a fresh token`, async () => {
    const harness = createHarness(language, [
      challengeRejection(),
      new Response(null, { status: 200 }),
    ]);
    await harness.solve("rejected-token");
    await harness.submit();

    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.challengeFailed"],
    );
    assert.equal(harness.elements.get("waitlist-email").value, "person@example.com");
    assert.equal(harness.elements.get("waitlist-status").style.color, "var(--color-status-bad)");
    assert.equal(harness.elements.get("waitlist-submit").disabled, true);
    assert.equal(harness.formResets, 0);
    assert.deepEqual(harness.resets, ["test-widget"]);
    await harness.submit();
    assert.equal(harness.requests.length, 1, "the rejected token cannot be reused");

    await harness.solve("fresh-token");
    assert.equal(harness.elements.get("waitlist-submit").disabled, false);
    assert.equal(harness.elements.get("waitlist-status").textContent, "");
    assert.notEqual(harness.elements.get("waitlist-status").style.color, "var(--color-status-bad)");
    await harness.submit();
    harness.challenge.callback("renewed-token");
    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.success"],
    );
    assert.equal(harness.formResets, 1);
    assert.deepEqual(
      harness.requests.map((request) => JSON.parse(request.body)),
      [
        { email: "person@example.com", language, turnstileToken: "rejected-token" },
        { email: "person@example.com", language, turnstileToken: "fresh-token" },
      ],
    );
    assert.ok(harness.requests.every((request) => request.url.endsWith("/api/waitlist")));
    assert.ok(harness.requests.every((request) => request.method === "POST"));
    for (const request of harness.requests)
      assert.deepEqual(request.headers, { "Content-Type": "application/json" });
  });

  test(`${language}: invalid local email never sends a request`, async () => {
    const harness = createHarness(language, []);
    harness.elements.get("waitlist-email").value = "invalid";
    await harness.submit();
    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.invalidEmail"],
    );
    assert.equal(harness.requests.length, 0);
  });

  test(`${language}: service unavailability keeps the generic error`, async () => {
    const harness = createHarness(language, [new Response(null, { status: 503 })]);
    await harness.solve("valid-token");
    await harness.submit();
    assert.equal(harness.elements.get("waitlist-status").textContent, harness.strings["ios.error"]);
    assert.deepEqual(harness.resets, ["test-widget"]);
    harness.challenge.callback("renewed-token");
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.elements.get("waitlist-email").value, "person@example.com");
    assert.equal(harness.elements.get("waitlist-submit").disabled, false);
    assert.equal(harness.elements.get("waitlist-status").textContent, harness.strings["ios.error"]);
    assert.equal(harness.elements.get("waitlist-status").style.color, "var(--color-status-bad)");
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: accepts 254 email characters and refuses 255 before fetching`, async () => {
    for (const length of [254, 255]) {
      const h = createHarness(language, [new Response(null, { status: 200 })]);
      const email = `${"a".repeat(length - 12)}@example.com`;
      assert.equal(email.length, length);
      h.elements.get("waitlist-email").value = email;
      await h.solve("valid-token");
      await h.submit();
      assert.equal(h.requests.length, length === 254 ? 1 : 0);
      assert.equal(
        h.elements.get("waitlist-status").textContent,
        h.strings[length === 254 ? "ios.success" : "ios.invalidEmail"],
      );
    }
  });

  test(`${language}: a rejected fetch shows the generic error and renews the challenge`, async () => {
    const h = createHarness(language, [new TypeError("Failed to fetch")]);
    await h.solve("valid-token");
    await h.submit();
    assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.error"]);
    assert.deepEqual(h.resets, ["test-widget"]);
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.requests.length, 1);
    h.challenge.callback("fresh-token");
    assert.equal(h.elements.get("waitlist-submit").disabled, false);
  });

  test(`${language}: shows the submitting label while the join is in flight`, async () => {
    let complete;
    const response = new Promise((resolve) => {
      complete = resolve;
    });
    const h = createHarness(language, [response]);
    await h.solve("valid-token");
    const pending = h.submit();
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.elements.get("waitlist-submit-label").textContent, h.strings["ios.submitting"]);
    complete(new Response(null, { status: 200 }));
    await pending;
    assert.equal(h.elements.get("waitlist-submit-label").textContent, h.strings["ios.button"]);
    assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.success"]);
  });

  test(`${language}: shows success for a repeat join of the same email`, async () => {
    const h = createHarness(language, [
      new Response(null, { status: 200 }),
      new Response(null, { status: 200 }),
    ]);
    for (const token of ["first-token", "second-token"]) {
      h.elements.get("waitlist-email").value = "person@example.com";
      await h.solve(token);
      await h.submit();
      assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.success"]);
      assert.equal(h.elements.get("waitlist-status").dataset.kind, "success");
    }
    assert.equal(h.requests.length, 2);
    assert.ok(
      h.requests.every((request) => JSON.parse(request.body).email === "person@example.com"),
    );
  });
}
