import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { parse } from "@astrojs/compiler";
import qrcode from "qrcode-generator";
import { scriptsFrom } from "../src/scripts/html.test-helper.mjs";

const html = readFileSync("dist/index.html", "utf8");
const storeUrl = process.env.PUBLIC_IOS_APP_STORE_URL;
function scriptSource({ attributes, body }) {
  return attributes.src ? readFileSync(`dist${attributes.src}`, "utf8") : body;
}
const structured = scriptsFrom(html)
  .filter(({ attributes }) => attributes.type === "application/ld+json")
  .map(({ body }) => JSON.parse(body));

for (const [event, region, label] of [
  ["header_app_cta_clicked", /<header\b[^>]*>[\s\S]*?<\/header>/, "header.cta"],
  [
    "hero_app_cta_clicked",
    /<section\b[^>]*data-section="final"[^>]*>[\s\S]*?<\/section>/,
    "final.cta",
  ],
  [
    "hero_app_cta_clicked",
    /<section\b[^>]*data-section="hero"[^>]*>[\s\S]*?<\/section>/,
    "hero.cta",
  ],
]) {
  test(`the built ${event} keeps its action and destination`, () => {
    const attribute = `data-analytics-event="${event}"`;
    const surface = html.match(region)?.[0];
    assert.ok(surface);
    assert.equal(surface.split(attribute).length - 1, 1);
    const anchor = [...surface.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(attribute));
    assert.ok(
      label === "final.cta"
        ? anchor?.includes('data-copy-en="Open Orbit"')
        : anchor?.includes(`data-i18n="${label}"`),
    );
    const destination = process.env.PUBLIC_APP_URL || "https://app.useorbit.org";
    assert.ok(anchor.includes("data-app-entry"));
    assert.doesNotMatch(anchor, /target="_blank"/);
    assert.ok(anchor.includes(`href="${destination}"`));
  });
}

test("generic hero and closing app actions retain distinct surface attribution", () => {
  const event = 'data-analytics-event="hero_app_cta_clicked"';
  assert.equal(html.split(event).length - 1, 2);
  const action = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(event) && tag.includes('data-analytics-surface="footer"'));
  assert.ok(action.includes('data-analytics-surface="footer"'));
  assert.ok(action.includes('data-copy-en="Open Orbit"'));
  assert.ok(action.includes('data-copy-pt="Abrir Orbit"'));
});

for (const [plan, copy, path] of [
  ["free", "Start free", ""],
  ["pro", "Try Pro", "/upgrade"],
]) {
  test(`the built ${plan} pricing action keeps its attribution, copy and destination`, () => {
    const pricing = html.match(/<section\b[^>]*id="pricing"[^>]*>[\s\S]*?<\/section>/)?.[0];
    assert.ok(pricing);
    const actions = [...pricing.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([tag]) => tag);
    assert.equal(actions.length, 2);
    const action = actions.find((tag) => tag.includes(`data-copy-en="${copy}"`));
    assert.ok(action, `${plan} pricing retains its copy`);
    assert.ok(action.includes(`data-analytics-event="pricing_${plan}_cta_clicked"`));
    assert.ok(action.includes(`data-analytics-surface="pricing_${plan}"`));
    const appUrl = process.env.PUBLIC_APP_URL || "https://app.useorbit.org";
    assert.ok(action.includes(`href="${appUrl}${path}"`));
  });
}

test("the application metadata describes Orbit as the AI without retired FAQ structured data", () => {
  assert.equal(structured.length, 1);
  assert.doesNotMatch(html, /FAQPage/);
  const applications = structured[0]["@graph"].filter((entry) =>
    /Application$/.test(entry["@type"]),
  );
  assert.equal(applications.length, 2);
  for (const app of applications) {
    assert.match(app.description, /^Tell Orbit what you want to do, and it turns that into habits/);
    assert.deepEqual(
      app.offers.map(({ price }) => price),
      [0, 9.99, 69.99],
    );
    assert.ok(app.offers.every(({ priceCurrency }) => priceCurrency === "USD"));
  }
});

test("all built pages expose translated copy and stable waitlist controls", () => {
  for (const file of ["dist/index.html", "dist/404.html", "dist/waitlist-confirmed/index.html"]) {
    const page = readFileSync(file, "utf8");
    assert.match(page, /id="lang-toggle"/);
    assert.match(page, /data-i18n="meta\./);
    assert.match(page, /viewport-fit=cover/);
  }
  if (storeUrl) return;
  assert.match(html, /<label[^>]*for="waitlist-email"[^>]*data-i18n="ios.label"/);
  assert.match(html, /aria-describedby="waitlist-status waitlist-privacy"/);
  for (const id of ["form", "email", "submit", "submit-label", "status"]) {
    assert.ok(html.includes(`id="waitlist-${id}"`));
  }
  assert.equal(html.includes('id="waitlist-turnstile"'), !!process.env.PUBLIC_TURNSTILE_SITE_KEY);
});

test("confirmation uses native hidden state for both response paths", async () => {
  const { default: vm } = await import("node:vm");
  const page = readFileSync("dist/waitlist-confirmed/index.html", "utf8");
  const tags = Object.fromEntries(
    [...page.matchAll(/<div\b([^>]*id="(confirmed-(?:ok|invalid))"[^>]*)>/g)].map(
      ([, attributes, id]) => [id, attributes],
    ),
  );
  const script = scriptsFrom(page)
    .map(scriptSource)
    .find((code) => code.includes("URLSearchParams"));
  assert.ok(script, "confirmation chooses the response state");
  const { parse } = await import("@astrojs/compiler");
  const { ast } = await parse(page);
  const attributes = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const hasCtaLabel = (node) =>
    attributes(node)["data-i18n"]?.startsWith("waitlistConfirmed.") ||
    (node.children ?? []).some(hasCtaLabel);
  function visibleDestinations(node, states, inherited = false) {
    const attrs = attributes(node);
    const hidden =
      states[attrs.id]?.hidden ??
      (inherited || (node.attributes ?? []).some(({ name }) => name === "hidden"));
    if (hidden) return [];
    if (node.name === "a" && hasCtaLabel(node)) return [attrs.href];
    return (node.children ?? []).flatMap((child) => visibleDestinations(child, states, hidden));
  }
  const appDestination = visibleDestinations(ast, {})[0];
  assert.ok(appDestination.startsWith("https://"), "the app destination is configured");
  for (const [search, invalid] of [
    ["", false],
    ["?status=invalid", true],
  ]) {
    const elements = Object.fromEntries(
      Object.entries(tags).map(([id, attributes]) => [
        id,
        { hidden: /(?:^|\s)hidden(?:\s|=|$)/.test(attributes) },
      ]),
    );
    assert.equal(elements["confirmed-invalid"].hidden, true);
    vm.runInNewContext(script, {
      URLSearchParams,
      window: { location: { search } },
      document: { getElementById: (id) => elements[id] },
    });
    assert.equal(elements["confirmed-ok"].hidden, invalid);
    assert.equal(elements["confirmed-invalid"].hidden, !invalid);
    assert.deepEqual(visibleDestinations(ast, elements), [
      invalid ? "/#downloads" : appDestination,
    ]);
  }
});

function scriptBytesFrom(page) {
  const seen = new Set();
  function bytesFor(path) {
    if (seen.has(path)) return 0;
    seen.add(path);
    const source = readFileSync(`dist${path}`, "utf8");
    let bytes = Buffer.byteLength(source);
    for (const [, imported] of source.matchAll(/(?:from|import)\s*["']([^"']+\.js)["']/g)) {
      bytes += bytesFor(new URL(imported, `https://useorbit.org${path}`).pathname);
    }
    return bytes;
  }
  let bytes = 0;
  for (const { attributes, body } of scriptsFrom(page)) {
    if (attributes.type === "application/ld+json") continue;
    const path = attributes.src;
    bytes += path ? bytesFor(path) : Buffer.byteLength(body);
  }
  return bytes;
}

for (const closing of ["</script>", "</script/foo>", "</script/ >"]) {
  test(`the complete local script graph stays inside the raw byte budget with ${closing}`, () => {
    const page = html.replaceAll("</script>", closing);
    const bytes = scriptBytesFrom(page);
    assert.ok(bytes > 0, "the budget must count the script graph");
    assert.equal(bytes, scriptBytesFrom(html), "every script must count toward the budget");
    assert.ok(bytes <= 24000, `${bytes} script bytes exceed 24000`);
    const oversized = scriptBytesFrom(`${page}<script>${" ".repeat(24001)}${closing}`);
    assert.equal(oversized, bytes + 24001, "the budget must count oversized inline scripts");
    assert.ok(oversized > 24000, "an oversized script must exceed the budget");
  });
}

test("the built eight-entry inventory opts in only the intended HTTPS anchors", async () => {
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const expectedApp = process.env.PUBLIC_APP_URL || "https://app.useorbit.org";
  const expectedPlay =
    process.env.PUBLIC_ANDROID_INSTALL_URL ||
    "https://play.google.com/store/apps/details?id=org.useorbit.app";
  const home = descendants((await parse(html)).ast);
  const confirmed = descendants(
    (await parse(readFileSync("dist/waitlist-confirmed/index.html", "utf8"))).ast,
  );
  const entry = (nodes) => nodes.filter((node) => Object.hasOwn(attrs(node), "data-app-entry"));
  const homeEntries = entry(home);
  assert.equal(homeEntries.length, 7);
  assert.deepEqual(
    homeEntries.map((node) => attrs(node).href),
    [
      expectedApp,
      expectedApp,
      expectedApp,
      expectedApp,
      `${expectedApp}/upgrade`,
      expectedApp,
      expectedApp,
    ],
  );
  assert.ok(homeEntries.every((node) => node.name === "a" && !attrs(node).target));
  assert.deepEqual(
    entry(confirmed).map((node) => attrs(node).href),
    [expectedApp],
  );
  assert.equal(attrs(homeEntries[2]).id, "demo-continue-link");
  assert.deepEqual(
    homeEntries.map((node) => attrs(node)["data-analytics-surface"]),
    ["header", "hero", undefined, "pricing_free", "pricing_pro", "footer", undefined],
  );
  for (const href of [
    expectedPlay,
    `${expectedApp}/privacy`,
    `${expectedApp}/terms`,
    storeUrl ? new URL(storeUrl).href : "#ios",
    "#features",
    "mailto:contact@useorbit.org",
  ]) {
    const links = home.filter((node) => node.name === "a" && attrs(node).href === href);
    assert.ok(links.length > 0, href);
    assert.ok(
      links.every((node) => !Object.hasOwn(attrs(node), "data-app-entry")),
      href,
    );
  }
  const installs = home.filter((node) => node.name === "a" && attrs(node).href === expectedPlay);
  assert.equal(installs.length, 2, "explicit Android link and clickable QR remain Play-only");
  assert.deepEqual(
    installs.map((node) => [
      attrs(node)["data-analytics-event"],
      attrs(node)["data-analytics-surface"],
    ]),
    [
      ["android_install_clicked", "footer"],
      ["android_install_clicked", "footer_qr"],
    ],
  );
  const qr = installs.find((node) => attrs(node).class === "downloads-qr");
  assert.ok(
    descendants(qr).some(
      (node) =>
        attrs(node)["data-copy-en"] === "Install on Android" &&
        attrs(node)["data-copy-pt"] === "Instalar no Android",
    ),
  );
  const expectedQr = qrcode(0, "H");
  expectedQr.addData(expectedPlay);
  expectedQr.make();
  assert.equal(
    readFileSync("dist/orbit-install-qr.svg", "utf8"),
    expectedQr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }),
  );
  assert.equal(
    structured[0]["@graph"].find((entry) => entry.operatingSystem === "Android").installUrl,
    expectedPlay,
  );
  const retry = confirmed.find((node) => node.name === "a" && attrs(node).href === "/#downloads");
  assert.ok(retry);
  assert.ok(!Object.hasOwn(attrs(retry), "data-app-entry"));
  assert.doesNotMatch(html, /hero_google_play_cta_clicked/);
});

test("both built pages eagerly bind app entry and preserve consent-gated surface capture", () => {
  for (const file of ["dist/index.html", "dist/waitlist-confirmed/index.html"]) {
    const page = readFileSync(file, "utf8");
    for (const choice of ["accepted", "declined"]) {
      const clickListeners = [];
      const windowListeners = new Map();
      const assignments = [];
      const captured = [];
      class Element {
        constructor(anchor) {
          this.anchor = anchor;
        }
        closest(selector) {
          if (selector === "a[data-app-entry]") return this.anchor;
          if (selector === "a[data-analytics-event], button[data-analytics-event]")
            return this.anchor;
          throw new Error(`Unexpected selector: ${selector}`);
        }
      }
      const context = vm.createContext({
        URL,
        Element,
        performance,
        navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140.0" },
        localStorage: { getItem: () => choice },
        CustomEvent: class {
          constructor(type) {
            this.type = type;
          }
        },
        IntersectionObserver: class {
          observe() {}
        },
        document: {
          getElementById: () => null,
          querySelectorAll: () => [],
          addEventListener(name, listener) {
            assert.equal(name, "click");
            clickListeners.push(listener);
          },
        },
        window: {
          setTimeout,
          clearTimeout,
          addEventListener: (name, listener) => windowListeners.set(name, listener),
          dispatchEvent() {},
          location: { assign: (uri) => assignments.push(uri) },
        },
      });
      for (const script of scriptsFrom(page)) {
        if (script.attributes.type !== "module") continue;
        const body = scriptSource(script);
        if (body.includes("orbit:analytics-ready") || body.includes("a[data-app-entry]"))
          vm.runInContext(`(function() {${body}\n})()`, context);
      }
      assert.equal(
        clickListeners.length,
        2,
        "consent and routing bind before deferred page startup",
      );
      assert.deepEqual(assignments, []);
      windowListeners.get("orbit:analytics-ready")({
        detail: {
          opt_out_capturing() {},
          capture: (event, properties, options) =>
            captured.push(JSON.parse(JSON.stringify({ event, properties, options }))),
        },
      });
      const app = process.env.PUBLIC_APP_URL || "https://app.useorbit.org";
      const root = new URL(app);
      const enhanced = ["app.useorbit.org", "app-staging.useorbit.org"].includes(root.hostname);
      const surfaces = file === "dist/index.html" ? ["hero", "footer"] : [undefined];
      for (const surface of surfaces) {
        const anchor = {
          href: app,
          target: "",
          hasAttribute: () => false,
          getAttribute: () => null,
          dataset: surface
            ? { analyticsEvent: "hero_app_cta_clicked", analyticsSurface: surface }
            : {},
        };
        const event = {
          target: new Element(anchor),
          button: 0,
          isTrusted: true,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
        };
        for (const listener of clickListeners) listener(event);
        assert.equal(event.defaultPrevented, enhanced);
        assert.equal(anchor.href, app);
      }
      assert.equal(assignments.length, enhanced ? surfaces.length : 0);
      assert.deepEqual(
        captured,
        choice === "accepted"
          ? surfaces.filter(Boolean).map((surface) => ({
              event: "hero_app_cta_clicked",
              properties: { surface },
              options: { transport: "sendBeacon", send_instantly: true },
            }))
          : [],
      );
    }
  }
});

const builtPages = readdirSync("dist", { recursive: true })
  .filter((path) => path.endsWith(".html"))
  .map((path) => `dist/${path}`);

test("built pages contain no executable inline scripts", () => {
  for (const file of builtPages) {
    for (const { attributes, body } of scriptsFrom(readFileSync(file, "utf8"))) {
      if (attributes.type === "application/ld+json") continue;
      assert.ok(attributes.src, `${file}: executable script must have a src`);
      assert.equal(body.trim(), "");
    }
  }
});

test("JSON-LD keeps script-closing copy inside one data element", async () => {
  const { ast } = await parse(readFileSync("src/layouts/Layout.astro", "utf8"));
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const block = descendants(ast).find(
    (node) =>
      node.name === "script" &&
      node.attributes.some(({ name, value }) => name === "type" && value === "application/ld+json"),
  );
  const expression = block.attributes.find(({ name }) => name === "set:html").value;
  const malicious = "A </script><script>alert(1)</script> description";
  for (const noindex of [false, true]) {
    const data = { "@context": "https://schema.org", "@graph": [{ description: malicious }] };
    const serialized = vm.runInNewContext(`(${expression})`, { noindex, structuredData: data });
    const template = scriptsFrom(html).find(
      ({ attributes }) => attributes.type === "application/ld+json",
    ).body;
    const rendered = html.replace(template, serialized);
    const scripts = scriptsFrom(rendered);
    assert.equal(scripts.length, scriptsFrom(html).length);
    const json = scripts.filter(({ attributes }) => attributes.type === "application/ld+json");
    assert.equal(json.length, 1);
    assert.deepEqual(JSON.parse(json[0].body), data);
    assert.equal((serialized.match(/<\/script/gi) ?? []).length, 0);
  }
});

test("the waitlist uses POST and caps the native email field", { skip: !!storeUrl }, () => {
  assert.match(html, /<form\b[^>]*id="waitlist-form"[^>]*method="post"/);
  assert.match(html, /<input\b[^>]*id="waitlist-email"[^>]*maxlength="254"/);
});

test("404 and home brand links point to their accepted destinations", async () => {
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const { ast: missing } = await parse(readFileSync("dist/404.html", "utf8"));
  const anchors = descendants(missing).filter((node) => node.name === "a");
  assert.equal(
    attrs(anchors.find((node) => attrs(node).class?.split(/\s+/).includes("brand"))).href,
    "/",
  );
  const home = anchors.find((node) =>
    descendants(node).some((child) => attrs(child)["data-i18n"] === "notFound.cta"),
  );
  assert.ok(home, "the home PillButton exists");
  assert.equal(attrs(home).href, "/");
  const { ast } = await parse(html);
  const header = descendants(ast).find((node) => node.name === "header");
  const footer = descendants(ast).find((node) => attrs(node)["data-section"] === "final");
  for (const [region, href] of [
    [header, "/"],
    [footer, "#hero"],
  ]) {
    const brand = descendants(region).find(
      (node) => node.name === "a" && attrs(node).class?.split(/\s+/).includes("brand"),
    );
    assert.ok(brand);
    assert.equal(attrs(brand).href, href);
  }
});

test("built consent markup reflects the PostHog key and retains the privacy link", async () => {
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  for (const file of builtPages) {
    const { ast } = await parse(readFileSync(file, "utf8"));
    const banner = descendants(ast).find((node) => attrs(node).id === "consent-banner");
    assert.equal(
      attrs(banner)["data-analytics-enabled"],
      String(Boolean(process.env.PUBLIC_POSTHOG_KEY)),
    );
    assert.ok(Object.hasOwn(attrs(banner), "hidden"));
    const privacy = descendants(banner).find(
      (node) => attrs(node)["data-i18n"] === "consent.privacy",
    );
    assert.equal(
      attrs(privacy).href,
      `${process.env.PUBLIC_APP_URL || "https://app.useorbit.org"}/privacy`,
    );
  }
});

const slice = (pattern) => html.match(pattern)?.[0] ?? "";
const storeHref = storeUrl ? new URL(storeUrl).href : "";
const iphoneSurfaces = [
  {
    surface: "the hero iPhone label",
    text: slice(/<span\b[^>]*data-hero-download-label="iphone"[^>]*>[\s\S]*?<\/span>/),
    store: ["Download on the App Store"],
    waitlist: ["iPhone waitlist"],
  },
  {
    surface: "the downloads iPhone entry",
    text: slice(
      /<a\b(?=[^>]*downloads-entry)(?=[^>]*data-download-target="iphone")[^>]*>[\s\S]*?<\/a>/,
    ),
    store: [
      `href="${storeHref}"`,
      'data-analytics-event="ios_install_clicked"',
      "/badges/app-store-en.svg",
      "/badges/app-store-pt-br.svg",
    ],
    waitlist: ['href="#ios"', "data-ios-trigger", "iPhone waitlist"],
  },
  {
    surface: "the FAQ platforms answer",
    text: slice(/id="faq-answer-platforms"[\s\S]*?<\/p>/),
    store: ["On iPhone, iPad, Android, the web, Mac and Windows."],
    waitlist: ["The iPhone app has a waitlist.", 'href="#ios"'],
  },
  {
    surface: "the trust strip caption",
    text: slice(/<section\b[^>]*data-section="trust"[^>]*>[\s\S]*?<\/section>/),
    store: ["iPhone on the App Store"],
    waitlist: ["iPhone waitlist open"],
  },
  {
    surface: "the waitlist section",
    text: html,
    store: [],
    waitlist: ['id="ios"', 'id="waitlist-form"'],
  },
];

test(`the iPhone surfaces and every fragment link follow the ${storeUrl ? "App Store" : "waitlist"} build`, () => {
  for (const { surface, text, store, waitlist } of iphoneSurfaces) {
    const [shown, hidden] = storeUrl ? [store, waitlist] : [waitlist, store];
    assert.ok(text, `${surface} is built`);
    for (const fragment of shown)
      assert.ok(text.includes(fragment), `${surface} shows ${fragment}`);
    for (const fragment of hidden)
      assert.ok(!text.includes(fragment), `${surface} hides ${fragment}`);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
  for (const file of ["dist/index.html", "dist/waitlist-confirmed/index.html"]) {
    const page = readFileSync(file, "utf8");
    const fragments = [...page.matchAll(/\shref="(?:\/)?#([^"]+)"/g)].map(([, id]) => id);
    assert.ok(fragments.length > 0, file);
    for (const id of fragments) assert.ok(ids.has(id), `${file} links to the missing #${id}`);
  }
});
