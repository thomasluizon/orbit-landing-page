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
  const elements = new Map();
  for (const id of ["form", "email", "submit", "submit-label", "status", "turnstile"]) {
    elements.set(`waitlist-${id}`, {
      value: "person@example.com",
      textContent: "",
      style: {},
      disabled: true,
      listeners: new Map(),
      addEventListener(type, listener) {
        this.listeners.set(type, listener);
      },
      focus() {},
      getBoundingClientRect: () => ({ width }),
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
      challenge = options;
      if (renderError) vendorError(options);
      return "test-widget";
    },
    reset: (id) => resets.push(id),
    remove: (id) => {
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
    environment: { PUBLIC_TURNSTILE_SITE_KEY: siteKey },
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
      requests.push({ url, ...options });
      const response = responses.shift();
      assert.ok(response, "a response is available for every request");
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

  test(`${language}: unrecognized API failures keep the generic error with protection on or off`, async () => {
    for (const siteKey of ["test-site-key"]) {
      for (const payload of [
        { error: "Unrelated request failure" },
        { type: "ValidationFailure", errors: { Language: ["Unsupported language"] } },
      ]) {
        const harness = createHarness(language, [Response.json(payload, { status: 400 })], {
          siteKey,
        });
        if (siteKey) await harness.solve("valid-token");
        await harness.submit();
        assert.equal(harness.requests.length, 1);
        assert.equal(
          harness.elements.get("waitlist-status").textContent,
          harness.strings["ios.error"],
        );
      }
    }
  });

  test(`${language}: a render throw allows a later input to retry`, async () => {
    const harness = createHarness(language, [], { renderFailures: 1 });
    harness.triggerChallenge("focus");
    await Promise.resolve();
    assert.equal(harness.renderCalls, 1);
    assert.equal(harness.challenge, undefined);
    assert.equal(harness.elements.get("waitlist-submit").disabled, true);
    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.challengeFailed"],
    );

    await harness.advance(2000);
    harness.triggerChallenge("input");
    await harness.flush();
    assert.equal(harness.renderCalls, 2);
    assert.ok(harness.challenge);
    harness.challenge.callback("fresh-token");
    assert.equal(harness.elements.get("waitlist-submit").disabled, false);
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
    await harness.submit();
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
  });

  test(`${language}: explicit server email validation keeps the email error`, async () => {
    // https://github.com/thomasluizon/orbit-api/blob/94960e88d63e8dcfaac831e6a76d86acb6a6ec16/src/Orbit.Api/Middleware/ValidationExceptionHandler.cs
    const response = Response.json(
      {
        type: "ValidationFailure",
        status: 400,
        requestId: "test-request",
        errors: { Email: ["test email validation failure"] },
      },
      { status: 400 },
    );
    const harness = createHarness(language, [response]);
    await harness.solve("valid-token");
    await harness.submit();
    assert.equal(
      harness.elements.get("waitlist-status").textContent,
      harness.strings["ios.invalidEmail"],
    );
    assert.deepEqual(harness.resets, ["test-widget"]);
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
  });

  test(`${language}: an unreadable 400 response shows the generic error`, async () => {
    const harness = createHarness(language, [new Response("Bad Request", { status: 400 })]);
    await harness.solve("valid-token");
    await harness.submit();
    assert.equal(harness.elements.get("waitlist-status").textContent, harness.strings["ios.error"]);
    assert.deepEqual(harness.resets, ["test-widget"]);
    assert.equal(harness.elements.get("waitlist-submit").disabled, true);
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: hard errors stop once without reset or re-render`, async () => {
    for (const code of [
      "110100",
      "110110",
      "110200",
      "200100",
      "400020",
      "400021",
      "400070",
      "999999",
    ]) {
      const h = createHarness(language, []);
      h.triggerChallenge("focus");
      await h.flush();
      for (let i = 0; i < 25; i++) h.challenge["error-callback"](code);
      await h.flush();
      h.triggerChallenge("input");
      h.toggleLanguage();
      h.resize(272);
      await h.flush();
      assert.deepEqual(h.resets, []);
      assert.equal(h.renderCalls, 1);
      assert.deepEqual(h.removals, ["test-widget"]);
      assert.equal(h.statusUpdates, 1);
      assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.challengeFailed"]);
      assert.deepEqual(h.logs, [["[Turnstile] error-callback", code]]);
      assert.equal(h.elements.get("waitlist-submit").disabled, true);
    }
  });

  test(`${language}: retryable callbacks use vendor backoff and stop after three failures`, async () => {
    for (const code of ["110600", "110620", "200500", "300001", "600001"]) {
      const h = createHarness(language, [], { renderError: code });
      h.triggerChallenge("focus");
      await h.flush();
      assert.equal(h.challenge.retry, "auto");
      assert.equal(h.challenge["retry-interval"], 8000);
      assert.deepEqual(h.resets, []);
      assert.equal(h.removals.length, 0);
      await h.advance(9999);
      assert.equal(h.logs.length, 1);
      await h.advance(1);
      assert.equal(h.logs.length, 2);
      await h.advance(10000);
      assert.equal(h.logs.length, 3);
      assert.deepEqual(h.removals, ["test-widget"]);
      await h.advance(60000);
      assert.equal(h.logs.length, 3);
      assert.equal(h.renderCalls, 1);
      assert.deepEqual(h.resets, []);
      assert.equal(h.statusUpdates, 1);
    }
  });

  test(`${language}: recovery clears errors and expiry renews without error copy`, async () => {
    const h = createHarness(language, []);
    await h.solve("first-token");
    h.challenge["error-callback"]("200500");
    assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.challengeFailed"]);
    h.challenge.callback("recovered-token");
    assert.equal(h.elements.get("waitlist-status").textContent, "");
    assert.notEqual(h.elements.get("waitlist-status").style.color, "var(--color-status-bad)");
    h.challenge["expired-callback"]("expired-token-must-not-be-logged");
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.elements.get("waitlist-status").textContent, "");
    h.challenge.callback("renewed-token");
    assert.equal(h.elements.get("waitlist-submit").disabled, false);
    h.challenge["timeout-callback"]();
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.challengeFailed"]);
    assert.deepEqual(h.resets, []);
    assert.deepEqual(h.logs, [
      ["[Turnstile] error-callback", "200500"],
      ["[Turnstile] expired-callback"],
      ["[Turnstile] timeout-callback"],
    ]);
  });

  test(`${language}: language toggles replace the widget and reject stale callbacks`, async () => {
    const h = createHarness(language, []);
    await h.solve("old-token");
    const old = h.challenge;
    h.toggleLanguage();
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    old.callback("late-old-token");
    await h.flush();
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.challenge.language, language === "en" ? "pt-br" : "en");
    assert.equal(h.renderCalls, 2);
    h.challenge.callback("new-token");
    assert.equal(h.elements.get("waitlist-submit").disabled, false);
    h.toggleLanguage();
    await h.flush();
    assert.equal(h.challenge.language, language === "en" ? "en" : "pt-br");
    assert.equal(h.elements.get("waitlist-submit").disabled, true);
    assert.equal(h.renderCalls, 3);
  });

  test(`${language}: widget sizing follows the measured content box on resize and rotation`, async () => {
    for (const [viewport, contentWidth, size, widgetWidth] of [
      [320, 272, "compact", 150],
      [360, 312, "flexible", 312],
    ]) {
      const h = createHarness(language, [], { width: contentWidth });
      await h.solve("portrait-token");
      assert.equal(h.challenge.size, size, `${viewport}px viewport`);
      assert.ok(widgetWidth <= contentWidth);
      h.resize(592, "orientationchange");
      assert.equal(h.elements.get("waitlist-submit").disabled, size === "compact");
      await h.flush();
      assert.equal(h.challenge.size, "flexible");
      h.resize(299);
      await h.flush();
      assert.equal(h.challenge.size, "compact");
      h.resize(300);
      await h.flush();
      assert.equal(h.challenge.size, "flexible");
    }
  });
}

test("an empty script response times out, removes its global and reports failure", async () => {
  const h = createHarness("en", [], { loader: "empty" });
  h.triggerChallenge("focus");
  await h.flush();
  assert.equal(h.appendedScripts.length, 1);
  await h.advance(14999);
  assert.equal(h.statusUpdates, 0);
  await h.advance(1);
  assert.equal(h.loadGlobal, undefined);
  assert.equal(h.appendedScripts[0].removed, true);
  assert.equal(h.elements.get("waitlist-status").textContent, h.strings["ios.challengeFailed"]);
  assert.equal(h.elements.get("waitlist-submit").disabled, true);
  assert.equal(h.timers.size, 0);
});

test("failed script retries require input, back off, clean up and stop after three attempts", async () => {
  const h = createHarness("en", [], { loader: "network-error" });
  h.triggerChallenge("focus");
  await h.flush();
  for (let i = 0; i < 25; i++) h.triggerChallenge("input");
  await h.flush();
  assert.equal(h.appendedScripts.length, 1);
  await h.advance(2000);
  h.triggerChallenge("focus");
  await h.flush();
  assert.equal(h.appendedScripts.length, 1);
  h.triggerChallenge("input");
  await h.flush();
  assert.equal(h.appendedScripts.length, 2);
  await h.advance(3999);
  h.triggerChallenge("input");
  await h.flush();
  assert.equal(h.appendedScripts.length, 2);
  await h.advance(1);
  h.triggerChallenge("input");
  await h.flush();
  assert.equal(h.appendedScripts.length, 3);
  for (let i = 0; i < 25; i++) {
    await h.advance(60000);
    h.triggerChallenge("input");
    await h.flush();
  }
  assert.equal(h.appendedScripts.length, 3);
  assert.ok(h.appendedScripts.every((script) => script.removed));
  assert.equal(h.loadGlobal, undefined);
  assert.equal(h.statusUpdates, 1);
});

test("a slow real script resolves via the load event and language toggles do not duplicate it", async () => {
  const h = createHarness("en", [], { loader: "slow" });
  h.triggerChallenge("focus");
  h.toggleLanguage();
  h.triggerChallenge("input");
  await h.advance(14000);
  await h.loadScript({ globalCallback: false });
  assert.equal(h.renderCalls, 1);
  assert.equal(h.challenge.language, "pt-br");
  assert.equal(h.appendedScripts.length, 1);
  assert.equal(h.loadGlobal, undefined);
  assert.equal(h.timers.size, 0);
  await h.advance(20000);
  assert.equal(h.statusUpdates, 0);
});
