import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { scriptsFrom } from "../src/scripts/html.test-helper.mjs";

const html = readFileSync("dist/index.html", "utf8");
function proseFrom(source) {
  let previous;
  do {
    previous = source;
    source = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  } while (source !== previous);
  return source.replace(/<[^>]+>/g, " ");
}
const prose = proseFrom(html);
const structured = scriptsFrom(html)
  .filter(({ attributes }) => attributes.type === "application/ld+json")
  .map(({ body }) => JSON.parse(body));

for (const hidden of [
  "<SCRIPT>hidden</SCRIPT>",
  "<script>hidden</script \n>",
  "<STYLE>hidden</sTyLe\t>",
  "<scr<script>inner</script>ipt>hidden</script>",
  "<sty<style>inner</style>le>hidden</style>",
]) {
  test(`prose extraction removes the complete hidden block ${hidden}`, () => {
    assert.equal(proseFrom(`<p>Before</p>${hidden}<p>After</p>`), " Before  After ");
  });
}

for (const [opening, closing] of [
  ["<SCRIPT", "</SCRIPT>"],
  ["<script", "</script \n>"],
  ["<ScRiPt", "</sCrIpT\t>"],
  ["<ScRiPt", "</sCrIpT\t\n bar>"],
]) {
  test(`built script extraction accepts ${opening} and ${closing.trim()}`, () => {
    for (const source of [html, readFileSync("dist/waitlist-confirmed/index.html", "utf8")]) {
      const expected = scriptsFrom(source);
      assert.ok(expected.length > 0);
      const variant = source.replaceAll("<script", opening).replaceAll("</script>", closing);
      assert.deepEqual(scriptsFrom(variant), expected);
    }
  });
}

test("the built header lockup paints pale ink with only the moon in the accent", async () => {
  const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
  const lockup = header?.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
  assert.ok(lockup, "the header must inline the lockup so currentColor resolves");
  const css =
    readFileSync("src/styles/global.css", "utf8") + readFileSync("src/styles/landing.css", "utf8");
  assert.match(css, /\.brand\s*\{[^}]*color:\s*var\(--color-fg-1\)/);
  assert.match(css, /--primary:\s*var\(--color-primary\)/);
  const token = (name) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]+)`))?.[1];
  const fills = [...lockup.matchAll(/<path\b[^>]*fill="([^"]+)"/g)].map(([, fill]) => fill);
  assert.deepEqual(fills, ["currentColor", "var(--primary, currentColor)", "currentColor"]);
  const resolved = lockup
    .replaceAll("var(--primary, currentColor)", token("primary"))
    .replaceAll("currentColor", token("fg-1"));
  const { data } = await sharp(Buffer.from(resolved))
    .resize({ width: 448 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Array.from({ length: data.length / 4 }, (_, index) =>
    [...data.subarray(index * 4, index * 4 + 4)].map(Number),
  );
  for (const name of ["fg-1", "primary"]) {
    const color = token(name)
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16));
    assert.ok(
      pixels.some((pixel) => pixel[3] === 255 && color.every((value, i) => pixel[i] === value)),
      `${name} must be visible in the built lockup`,
    );
  }
});

for (const [event, region, label] of [
  ["header_app_cta_clicked", /<header\b[^>]*>[\s\S]*?<\/header>/, "header.cta"],
  [
    "hero_app_cta_clicked",
    /<section\b[^>]*data-section="final"[^>]*>[\s\S]*?<\/section>/,
    "final.cta",
  ],
  [
    "hero_google_play_cta_clicked",
    /<main\b[^>]*id="main-content"[^>]*>[\s\S]*?<\/main>/,
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
        ? anchor?.includes('data-copy-en="Open in your browser"')
        : anchor?.includes(`data-i18n="${label}"`),
    );
    const destination =
      event !== "hero_google_play_cta_clicked"
        ? process.env.PUBLIC_APP_URL || "https://app.useorbit.org"
        : process.env.PUBLIC_ANDROID_INSTALL_URL ||
          "https://play.google.com/store/apps/details?id=org.useorbit.app";
    assert.ok(anchor.includes(`href="${destination}"`));
  });
}

test("the single closing web app action keeps the existing app event and footer surface", () => {
  const event = 'data-analytics-event="hero_app_cta_clicked"';
  assert.equal(html.split(event).length - 1, 1);
  const action = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(event));
  assert.ok(action.includes('data-analytics-surface="footer"'));
  assert.ok(action.includes('data-copy-en="Open in your browser"'));
  assert.ok(action.includes('data-copy-pt="Abrir no navegador"'));
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

test("the built homepage follows the scrolling Astra composition with the dedicated waitlist section", () => {
  assert.match(html, /class="landing-shell"/);
  assert.match(html, /id="astra-demo"/);
  assert.match(html, /<section[^>]*id="ios"[^>]*aria-labelledby="ios-title"/);
  assert.match(html, /href="#ios"[^>]*id="ios-trigger"/);
  assert.deepEqual(
    [...html.matchAll(/data-section="([^"]+)"/g)].map(([, name]) => name),
    ["hero", "trust", "features", "pricing", "ios", "faq", "final"],
  );
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /data-state="proposed"/);
  assert.match(html, /id="demo-today"[^>]*hidden/);
  for (const action of ["Approve", "Edit", "Reject"]) assert.ok(prose.includes(action));
  for (const example of ["start", "restart", "move"])
    assert.match(html, new RegExp(`data-demo="${example}"`));
  assert.match(html, /<details name="orbit-questions">/);
  assert.match(html, /src="\/orbit-install-qr.svg"/);
});

test("the built proposal has one trailing row of two ghost actions and a filled approval", () => {
  const row = html.match(/<div class="demo-preview-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(row);
  const buttons = [...row.matchAll(/<button\b([^>]+)>/g)].map(([, attributes]) => attributes);
  assert.equal(buttons.length, 3);
  for (const [index, action] of ["reject", "edit", "approve"].entries()) {
    assert.ok(buttons[index].includes(`id="demo-${action}"`));
    assert.ok(buttons[index].includes('type="button"'));
    assert.ok(buttons[index].includes("pill-sm"));
    assert.ok(buttons[index].includes(index === 2 ? "bg-primary" : "bg-transparent"));
    assert.doesNotMatch(buttons[index], /\sdisabled(?:\s|=|$)|\stabindex="-1"/);
  }
});

test("the application metadata describes Astra without retired FAQ structured data", () => {
  assert.equal(structured.length, 1);
  assert.doesNotMatch(html, /FAQPage/);
  const applications = structured[0]["@graph"].filter((entry) =>
    /Application$/.test(entry["@type"]),
  );
  assert.equal(applications.length, 2);
  for (const app of applications) {
    assert.match(app.description, /Astra/);
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
    .map(({ body }) => body)
    .find((code) => code.includes('get("status")'));
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
    assert.deepEqual(visibleDestinations(ast, elements), [invalid ? "/#ios" : appDestination]);
  }
});

test("the complete local script graph stays inside the raw byte budget", () => {
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
  for (const { attributes, body } of scriptsFrom(html)) {
    if (attributes.type === "application/ld+json") continue;
    const path = attributes.src;
    bytes += path ? bytesFor(path) : Buffer.byteLength(body);
  }
  assert.ok(bytes <= 24000, `${bytes} script bytes exceed 24000`);
});

test("the built billing control leads with Yearly and puts its saving only on that option", () => {
  const pro = html.match(/<article class="plan-card plan-pro"[^>]*>([\s\S]*?)<\/article>/)?.[1];
  assert.ok(pro);
  const group = html.match(/<div\b[^>]*data-billing-control[^>]*>[\s\S]*?<\/div>/)?.[0];
  assert.match(group, /role="radiogroup"/);
  assert.match(group, /data-billing-period="monthly"[^>]*aria-checked="false"[^>]*tabindex="-1"/);
  assert.match(group, /data-billing-period="yearly"[^>]*aria-checked="true"[^>]*tabindex="0"/);
  assert.match(pro, /data-pro-price[^>]*>[^<]+\/day/);
  assert.match(pro, /data-billed-total[^>]*>[^<]+billed yearly/);
  assert.match(group, /data-billing-saving/);
  assert.doesNotMatch(pro, /data-annual-saving/);
  assert.doesNotMatch(pro, /data-annual-(?:equivalent|saving)[^>]*hidden/);
  assert.match(pro, /data-copy-en="Try Pro" data-copy-pt="Testar o Pro"/);
});

test("the built examples contain exactly one product and one localized sentence each", async () => {
  const { parse } = await import("@astrojs/compiler");
  const { ast } = await parse(html);
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const rows = descendants(ast).filter((node) => attrs(node)["data-example-row"]);
  assert.equal(rows.length, 6);
  for (const [index, row] of rows.entries()) {
    assert.equal(attrs(row)["data-card-side"], index % 2 ? "right" : "left");
    const nodes = descendants(row);
    assert.equal(nodes.filter((node) => attrs(node).class === "example-card").length, 1);
    assert.equal(nodes.filter((node) => attrs(node).class === "example-sentence").length, 1);
    assert.equal(nodes.filter((node) => attrs(node)["data-product-kind"]).length, 1);
    assert.equal(nodes.filter((node) => node.name === "a").length, 0);
  }
  const cards = descendants(ast).filter((node) => attrs(node)["data-product-kind"]);
  const kinds = cards.map((node) => attrs(node)["data-product-kind"]);
  assert.ok(kinds.includes("week"));
  assert.ok(!kinds.includes("today"), "Today belongs to the full phone screen");
});

test("the built hero has two shared headers, two pager segments and a full Today habit list", async () => {
  const { parse } = await import("@astrojs/compiler");
  const { ast } = await parse(html);
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const nodes = descendants(ast);
  const screens = nodes.filter((node) => attrs(node)["data-phone-slide"]);
  assert.deepEqual(
    screens.map((node) => attrs(node)["data-phone-slide"]),
    ["chat", "today"],
  );
  for (const screen of screens) {
    assert.equal(
      descendants(screen).filter((node) => attrs(node).class === "phone-app-header").length,
      1,
    );
  }
  const segments = nodes.filter((node) => Object.hasOwn(attrs(node), "data-carousel-segment"));
  assert.deepEqual(
    segments.map((node) => attrs(node)["aria-controls"]),
    ["phone-chat", "phone-today"],
  );
  const habits = descendants(screens[1]).filter(
    (node) =>
      Object.hasOwn(attrs(node), "data-habit-toggle") && !Object.hasOwn(attrs(node), "hidden"),
  );
  assert.equal(habits.length, 5);
  assert.deepEqual(
    habits.map((node) => attrs(node)["aria-pressed"]),
    ["true", "true", "false", "false", "false"],
  );
  const columns = nodes.filter((node) => Object.hasOwn(attrs(node), "data-hero-column"));
  assert.deepEqual(
    columns.map(
      (column) =>
        descendants(column).filter((node) => Object.hasOwn(attrs(node), "data-hero-float")).length,
    ),
    [2, 2],
  );
  assert.deepEqual(
    columns
      .flatMap(descendants)
      .map((node) => attrs(node)["data-product-kind"])
      .filter(Boolean),
    ["reminder", "insight", "week"],
  );
});

test("built product examples carry the localized templates their controls consume", async () => {
  const { parse } = await import("@astrojs/compiler");
  const { ast } = await parse(html);
  const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
  const attrs = (node) =>
    Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
  const nodes = descendants(ast);
  const blocks = nodes.filter((node) => attrs(node)["data-example-block"]);
  assert.deepEqual(
    blocks.map((node) => attrs(node)["data-example-block"]),
    ["metrics"],
  );
  const breakdowns = nodes.filter((node) =>
    (attrs(node).class ?? "").split(/\s+/).includes("block-breakdown"),
  );
  assert.equal(breakdowns.length, 1);
  assert.equal(
    descendants(breakdowns[0]).filter((node) => ["button", "a"].includes(node.name)).length,
    0,
  );
  const frames = new Map(
    nodes
      .filter((node) => node.name === "symbol")
      .map((node) => [attrs(node).id, attrs(node).viewBox]),
  );
  const glyphs = nodes.filter(
    (node) =>
      node.name === "svg" &&
      descendants(node).some(
        (child) => child.name === "use" && attrs(child).href?.startsWith("#astra-mark"),
      ),
  );
  assert.ok(glyphs.length > 0);
  for (const glyph of glyphs) {
    const use = descendants(glyph).find((node) => node.name === "use");
    const name = attrs(use).href.slice(1);
    const asset = readFileSync(`public/brand/${name}.svg`, "utf8");
    const viewBox = asset.match(/viewBox="([^"]+)"/)[1];
    assert.equal(attrs(glyph).viewBox, viewBox);
    assert.equal(frames.get(name), viewBox);
  }
});

test("the built feature compositions use full width without backing panels", () => {
  const stylesheets = [
    ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"/g),
  ].map(([, href]) => readFileSync(`dist${href}`, "utf8"));
  const rules = stylesheets.join("\n").match(/\.example-card\{[^}]*\}/g);
  assert.ok(rules?.length);
  for (const rule of rules) assert.doesNotMatch(rule, /background|box-shadow|aspect-ratio/);
});

test("the built stylesheet lets the closing data request sentence wrap inside its link", () => {
  const stylesheets = [
    ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"/g),
  ].map(([, href]) => readFileSync(`dist${href}`, "utf8"));
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(([, css]) => css);
  const target = ".closing-legal p .text-link>[data-copy-en]";
  const wraps = [...[...stylesheets, ...inline].join("\n").matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(
    ([, selectors, body]) =>
      selectors
        .split(",")
        .map((selector) => selector.trim().replace(/\s*>\s*/g, ">"))
        .includes(target) && /white-space:\s?normal/.test(body),
  );
  assert.ok(
    wraps,
    "the closing data request copy must wrap, or it widens the closing block past a 320px viewport",
  );
});
