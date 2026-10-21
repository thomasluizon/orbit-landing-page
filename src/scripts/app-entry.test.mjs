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
      const web = new URL(app + path);
      assert.equal(nativeTitle(intent.url), web.searchParams.get("title"));
      assert.deepEqual([...intent.url.searchParams.keys()], [...web.searchParams.keys()]);
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
  assert.equal(nativeTitle(decodedIntent(h.assignments[2]).url), demo.searchParams.get("title"));
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
function nativeTitle(url) {
  const value = url.searchParams.get("title");
  return value === null ? null : decodeURIComponent(decodeURIComponent(decodeURIComponent(value)));
}
const nativeTitleVectors = [
  ["", "title="],
  ["Walk", "title=Walk"],
  ["Walk today", "title=Walk%25252520today"],
  [
    " Olá 🌙 ",
    "title=%25252520Ol%252525C3%252525A1%25252520%252525F0%2525259F%2525258C%25252599%25252520",
  ],
  ["Read & reflect", "title=Read%25252520%25252526%25252520reflect"],
  ["a+b", "title=a%2525252Bb"],
  ["a#b", "title=a%25252523b"],
  ["100%", "title=100%25252525"],
  ["%26", "title=%2525252526"],
  ["%2526", "title=%252525252526"],
  ["a;b", "title=a%2525253Bb"],
  ["a?b", "title=a%2525253Fb"],
  ["a=b", "title=a%2525253Db"],
  ["a/b\\c", "title=a%2525252Fb%2525255Cc"],
  [
    "emoji 👩🏽‍🚀",
    "title=emoji%25252520%252525F0%2525259F%25252591%252525A9%252525F0%2525259F%2525258F%252525BD%252525E2%25252580%2525258D%252525F0%2525259F%2525259A%25252580",
  ],
  ["'!()*", "title='!()*"],
  ["line\nbreak", "title=line%2525250Abreak"],
  ["trailing ", "title=trailing%25252520"],
  ["\tline\nnext\r", "title=%25252509line%2525250Anext%2525250D"],
  ["nonbreaking space", "title=nonbreaking%252525C2%252525A0space"],
  [
    "中文字",
    "title=%252525E4%252525B8%252525AD%252525E6%25252596%25252587%252525E5%252525AD%25252597",
  ],
  [
    "#Intent;scheme=evil;package=evil;S.browser_fallback_url=https://evil.invalid;end",
    "title=%25252523Intent%2525253Bscheme%2525253Devil%2525253Bpackage%2525253Devil%2525253BS.browser_fallback_url%2525253Dhttps%2525253A%2525252F%2525252Fevil.invalid%2525253Bend",
  ],
  [" \n", "title=%25252520%2525250A"],
  [" a\u0000b ", "title=%25252520a%25252500b%25252520"],
];
for (const environment of [production, staging]) {
  test(`${environment.PUBLIC_APP_URL}: Expo Router 57.0.24 title vectors dispatch once without directive injection`, () => {
    const h = harness(environment);
    for (const [title, query] of nativeTitleVectors) {
      const url = new URL("/habits/new", environment.PUBLIC_APP_URL);
      url.searchParams.set("title", title);
      const link = h.anchor(url.href);
      const before = h.assignments.length;
      assert.equal(h.click(link).defaultPrevented, true, title);
      assert.equal(h.assignments.length, before + 1, title);
      assert.equal(link.href, url.href);
      const intent = decodedIntent(h.assignments.at(-1));
      assert.equal(intent.url.pathname, "/habits/new");
      assert.equal(intent.url.search, `?${query}`);
      assert.equal(intent.url.hash, "");
      assert.deepEqual([...intent.url.searchParams.keys()], ["title"]);
      assert.equal(nativeTitle(intent.url), title);
      assert.equal(
        intent.package,
        new URL(environment.PUBLIC_ANDROID_INSTALL_URL).searchParams.get("id"),
      );
      assert.equal(intent.scheme, environment === staging ? "orbit-staging" : "orbit");
      assert.equal(
        intent["S.browser_fallback_url"],
        encodeURIComponent(environment.PUBLIC_ANDROID_INSTALL_URL),
      );
    }
  });
}
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
