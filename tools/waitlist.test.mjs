import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const scripts = new Map();
for (const path of ["../i18n/translations", "./i18n", "./waitlist"]) {
  const source = await readFile(new URL(`../src/scripts/${path}.ts`, import.meta.url), "utf8");
  scripts.set(
    path,
    ts.transpileModule(source.replaceAll("import.meta.env", "environment"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
}

function createHarness(language, responses) {
  const requests = [];
  const resets = [];
  let challenge;
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
      reset() {
        formResets++;
      },
    });
  }
  const context = vm.createContext({
    environment: { PUBLIC_TURNSTILE_SITE_KEY: "test-site-key" },
    navigator: { language },
    document: {
      cookie: `orbit_lang=${language}`,
      documentElement: {},
      querySelectorAll: () => [],
      getElementById: (id) => elements.get(id) ?? null,
    },
    window: {
      turnstile: {
        render(container, options) {
          assert.equal(container, elements.get("waitlist-turnstile"));
          challenge = options;
          return "test-widget";
        },
        reset: (id) => resets.push(id),
      },
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
    elements,
    strings: require("../i18n/translations").translations[language],
    get formResets() {
      return formResets;
    },
    async solve(token) {
      elements.get("waitlist-email").listeners.get("focus")();
      await Promise.resolve();
      assert.ok(challenge, "focus initializes the production challenge");
      challenge.callback(token);
    },
    submit: () => elements.get("waitlist-form").listeners.get("submit")({ preventDefault() {} }),
  };
}

// https://github.com/thomasluizon/orbit-tickets/issues/107 specifies error/requestId, not error wording.
const challengeRejection = () =>
  Response.json({ error: "test challenge rejection", requestId: "test-request" }, { status: 400 });

for (const language of ["en", "pt-BR"]) {
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
