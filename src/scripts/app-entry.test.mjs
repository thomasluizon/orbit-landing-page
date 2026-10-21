import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const production = {
  PUBLIC_APP_URL: "https://app.useorbit.org",
  PUBLIC_ANDROID_INSTALL_URL: "https://play.google.com/store/apps/details?id=org.useorbit.app",
};
const staging = {
  PUBLIC_APP_URL: "https://app-staging.useorbit.org",
  PUBLIC_ANDROID_INSTALL_URL:
    "https://play.google.com/store/apps/details?id=org.useorbit.app.staging",
};
function harness(environment = {}, userAgent = "Mozilla/5.0 (Linux; Android 15) Chrome/140.0") {
  class Element {
    constructor(anchor) {
      this.anchor = anchor;
    }
    closest(selector) {
      if (selector === "a") return this.anchor ?? null;
      if (selector === "a[data-app-entry]") return this.anchor?.marked ? this.anchor : null;
      throw new Error(`Unexpected selector: ${selector}`);
    }
  }
  const assignments = [];
  const listeners = [];
  let blocked = false;
  const context = vm.createContext({
    URL,
    Element,
    environment,
    navigator: { userAgent },
    window: {
      location: {
        assign(value) {
          if (blocked) throw new Error("navigation blocked");
          assignments.push(value);
        },
      },
    },
    document: {
      addEventListener(name, listener) {
        assert.equal(name, "click");
        listeners.push(listener);
      },
    },
  });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(`src/scripts/${path}.ts`, "utf8").replaceAll(
      "import.meta.env",
      "environment",
    );
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {${code}\n})`, context)(exports, load);
    modules.set(path, exports);
    return exports;
  }
  load("./app-entry");
  load("./app-entry");
  assert.equal(listeners.length, 1, "shared eager imports bind once through the module cache");
  assert.deepEqual(assignments, [], "entry never launches during initialization");
  const anchor = (href, properties = {}) => ({
    href,
    marked: true,
    target: "",
    hasAttribute: () => false,
    ...properties,
  });
  const click = (link, properties = {}) => {
    const event = {
      target: new Element(link),
      button: 0,
      isTrusted: true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...properties,
    };
    for (const listener of listeners) listener(event);
    return event;
  };
  return {
    anchor,
    click,
    assignments,
    block() {
      blocked = true;
    },
  };
}
function decodedIntent(value) {
  const [route, directives] = value.split("#Intent;");
  assert.ok(directives.endsWith(";end"));
  const pairs = Object.fromEntries(
    directives
      .slice(0, -4)
      .split(";")
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
  assert.deepEqual(Object.keys(pairs).sort(), ["S.browser_fallback_url", "package", "scheme"]);
  return { url: new URL(route.replace("intent:", `${pairs.scheme}:`)), ...pairs };
}
for (const [environment, scheme, packageName] of [
  [{}, "orbit", "org.useorbit.app"],
  [production, "orbit", "org.useorbit.app"],
  [staging, "orbit-staging", "org.useorbit.app.staging"],
]) {
  test(`${scheme}: root, Pro and supported demo routes dispatch one isolated intent per activation`, () => {
    const h = harness(environment);
    const app = environment.PUBLIC_APP_URL || production.PUBLIC_APP_URL;
    const play = environment.PUBLIC_ANDROID_INSTALL_URL || production.PUBLIC_ANDROID_INSTALL_URL;
    for (const path of [
      "/",
      "/upgrade",
      "/habits/new?title=Ol%C3%A1+%F0%9F%8C%99%3Bwalk%3Ftoday",
      `/habits/new?title=${"Walk".repeat(1000)}`,
    ]) {
      const link = h.anchor(app + path);
      const before = h.assignments.length;
      assert.equal(h.click(link).defaultPrevented, true);
      assert.equal(h.assignments.length, before + 1);
      assert.equal(link.href, app + path, "copied and subsequent modified links stay HTTPS");
      const intent = decodedIntent(h.assignments.at(-1));
      assert.equal(intent.scheme, scheme);
      assert.equal(intent.package, packageName);
      assert.equal(decodeURIComponent(intent["S.browser_fallback_url"]), play);
      assert.equal(intent.url.pathname, path.split("?")[0]);
      assert.equal(intent.url.search, new URL(app + path).search);
    }
  });
}
test("current accepted href is read on each click, with nested and keyboard targets", () => {
  const h = harness();
  const link = h.anchor(production.PUBLIC_APP_URL);
  h.click(link);
  link.href += "/upgrade";
  h.click(link, { detail: 0 });
  const demo = new URL("/habits/new", production.PUBLIC_APP_URL);
  demo.searchParams.set("title", "Olá 🌙;package=foreign;end?today");
  link.href = demo.href;
  h.click(link);
  assert.equal(h.assignments.length, 3);
  assert.equal(decodedIntent(h.assignments[1]).url.pathname, "/upgrade");
  assert.equal(
    decodedIntent(h.assignments[2]).url.searchParams.get("title"),
    demo.searchParams.get("title"),
  );
});
test("browser fallback is encoded independently, including configured store query values", () => {
  const environment = {
    ...production,
    PUBLIC_ANDROID_INSTALL_URL:
      production.PUBLIC_ANDROID_INSTALL_URL + "&hl=pt_BR&referrer=source%3Dlanding%26medium%3Dqr",
  };
  const h = harness(environment);
  h.click(h.anchor(production.PUBLIC_APP_URL));
  assert.equal(
    decodedIntent(h.assignments[0])["S.browser_fallback_url"],
    encodeURIComponent(environment.PUBLIC_ANDROID_INSTALL_URL),
  );
});
test("lossy receiver titles stay HTTPS, with no intent directive injection", () => {
  const h = harness();
  for (const title of [
    "Read & reflect",
    "a+b",
    "a#b",
    "%26",
    "100%",
    "#Intent;scheme=evil;package=evil;S.browser_fallback_url=https://evil.invalid;end",
    "line\nbreak",
    "trailing ",
  ]) {
    const url = new URL("/habits/new", production.PUBLIC_APP_URL);
    url.searchParams.set("title", title);
    const link = h.anchor(url.href);
    assert.equal(h.click(link).defaultPrevented, false, title);
    assert.equal(link.href, url.href);
  }
  assert.deepEqual(h.assignments, []);
});
test("desktop, iOS, unknown and unsupported activations retain ordinary link semantics", () => {
  for (const ua of [
    "",
    "Mozilla/5.0 (Windows NT 10.0) Chrome/140",
    "Mozilla/5.0 (Macintosh) Firefox/140",
    "Mozilla/5.0 (iPhone) Safari/604",
    "Mozilla/5.0 (iPad) Safari/604",
    "Mozilla/5.0 (Linux; Android 15)",
    "Mozilla/5.0 (Linux; Android 15) Firefox/140",
    "Mozilla/5.0 (Linux; Android 15; wv) Version/4.0 Chrome/140",
    "Mozilla/5.0 (Linux; Android 15) Chrome/140 SamsungBrowser/29",
    "Mozilla/5.0 (Linux; Android 15) Chrome/140 EdgA/140",
    "Mozilla/5.0 (Linux; Android 15) Chrome/140 Instagram",
  ]) {
    const h = harness({}, ua);
    assert.equal(h.click(h.anchor(production.PUBLIC_APP_URL)).defaultPrevented, false);
    assert.deepEqual(h.assignments, []);
  }
  const h = harness();
  for (const properties of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { button: 2 },
    { isTrusted: false },
    { defaultPrevented: true },
    { target: null },
  ]) {
    const event = h.click(h.anchor(production.PUBLIC_APP_URL), properties);
    assert.equal(event.defaultPrevented, properties.defaultPrevented ?? false);
  }
  for (const properties of [
    { marked: false },
    { target: "_blank" },
    { target: "frame" },
    { hasAttribute: () => true },
  ]) {
    assert.equal(h.click(h.anchor(production.PUBLIC_APP_URL, properties)).defaultPrevented, false);
  }
  assert.deepEqual(h.assignments, []);
});
test("unmarked store, legal, waitlist, contact and other app-origin links are excluded", () => {
  const h = harness();
  for (const href of [
    production.PUBLIC_APP_URL,
    production.PUBLIC_APP_URL + "/upgrade",
    production.PUBLIC_ANDROID_INSTALL_URL,
    "#ios",
    "/#ios",
    "#features",
    "mailto:contact@useorbit.org",
  ]) {
    assert.equal(h.click(h.anchor(href, { marked: false })).defaultPrevented, false);
  }
  for (const href of [
    "/privacy",
    "/terms",
    "/auth-callback",
    "/r/code",
    "/habits/new/",
    "/upgrade/",
    "/upgrade?source=landing",
    "/?tracking=secret",
    "/habits/new?title=walk&token=secret",
    "/habits/new?title=a&title=b",
    "/habits/new",
    "/upgrade#Intent;scheme=evil;end",
  ]) {
    assert.equal(h.click(h.anchor(production.PUBLIC_APP_URL + href)).defaultPrevented, false, href);
  }
  for (const href of [
    "::::",
    "javascript:alert(1)",
    "http://app.useorbit.org",
    "https://other.invalid/upgrade",
    "https://app-staging.useorbit.org/upgrade",
    "https://user:pass@app.useorbit.org/upgrade",
  ]) {
    assert.equal(h.click(h.anchor(href)).defaultPrevented, false, href);
  }
  assert.deepEqual(h.assignments, []);
});
test("unrecognized, malformed and crossed configurations never guess a native package", () => {
  for (const environment of [
    { ...production, PUBLIC_APP_URL: staging.PUBLIC_APP_URL },
    { ...staging, PUBLIC_APP_URL: production.PUBLIC_APP_URL },
    { ...production, PUBLIC_APP_URL: "https://preview.invalid" },
    { ...production, PUBLIC_APP_URL: "http://app.useorbit.org" },
    { ...production, PUBLIC_APP_URL: "https://app.useorbit.org/subpath" },
    { ...production, PUBLIC_APP_URL: "https://app.useorbit.org?token=secret" },
    { ...production, PUBLIC_APP_URL: "https://user@app.useorbit.org" },
    { ...production, PUBLIC_APP_URL: "malformed" },
    { ...production, PUBLIC_ANDROID_INSTALL_URL: "malformed" },
    { ...production, PUBLIC_ANDROID_INSTALL_URL: "https://other.invalid/?id=org.useorbit.app" },
    {
      ...production,
      PUBLIC_ANDROID_INSTALL_URL: "http://play.google.com/store/apps/details?id=org.useorbit.app",
    },
    {
      ...production,
      PUBLIC_ANDROID_INSTALL_URL:
        production.PUBLIC_ANDROID_INSTALL_URL + "&id=org.useorbit.app.staging",
    },
    {
      ...production,
      PUBLIC_ANDROID_INSTALL_URL:
        production.PUBLIC_ANDROID_INSTALL_URL + "#Intent;package=evil;end",
    },
  ]) {
    const h = harness(environment);
    assert.equal(h.click(h.anchor(environment.PUBLIC_APP_URL)).defaultPrevented, false);
    assert.deepEqual(h.assignments, []);
  }
});
test("dispatch preserves bubbling and a blocked assignment leaves the HTTPS default available", () => {
  const h = harness();
  const event = h.click(h.anchor(production.PUBLIC_APP_URL));
  assert.equal(event.defaultPrevented, true);
  assert.equal(
    event.stopPropagation,
    undefined,
    "routing must not require stopping consent capture",
  );
  h.block();
  assert.equal(h.click(h.anchor(production.PUBLIC_APP_URL)).defaultPrevented, false);
  assert.equal(h.assignments.length, 1, "no retry or timer follows refusal");
});
