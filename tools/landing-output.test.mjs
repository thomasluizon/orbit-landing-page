import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("dist/index.html", "utf8");
const prose = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ");
const structured = [
  ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
].map((match) => JSON.parse(match[1]));

for (const [event, region, label] of [
  [
    "final_app_cta_clicked",
    /<section\b[^>]*class="[^"]*final-cta[^"]*"[^>]*>[\s\S]*?<\/section>/,
    "cta.button",
  ],
  ["header_app_cta_clicked", /<header\b[^>]*>[\s\S]*?<\/header>/, "header.cta"],
  ["hero_app_cta_clicked", /<section\b[^>]*id="hero"[^>]*>[\s\S]*?<\/section>/, "hero.web"],
  ["hero_google_play_cta_clicked", /<section\b[^>]*id="hero"[^>]*>[\s\S]*?<\/section>/, "hero.cta"],
  [
    "platforms_google_play_cta_clicked",
    /<section\b[^>]*id="platforms"[^>]*>[\s\S]*?<\/section>/,
    "platforms.android.cta",
  ],
  [
    "platforms_web_cta_clicked",
    /<section\b[^>]*id="platforms"[^>]*>[\s\S]*?<\/section>/,
    "platforms.web.cta",
  ],
  [
    "pricing_free_cta_clicked",
    /<article\b[^>]*class="plan"[^>]*>[\s\S]*?<\/article>/,
    "pricing.cta",
  ],
  [
    "pricing_pro_cta_clicked",
    /<article\b[^>]*class="plan plan-pro"[^>]*>[\s\S]*?<\/article>/,
    "pricing.cta",
  ],
]) {
  test(`the built ${event} stays on its original CTA`, () => {
    const attribute = `data-analytics-event="${event}"`;
    assert.equal(html.split(attribute).length - 1, 1, `${event} occurs exactly once`);
    const surface = html.match(region)?.[0];
    assert.ok(surface, `CTA region for ${event} exists`);
    const anchor = [...surface.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(attribute));
    assert.ok(anchor, `${event} belongs to a link in its original region`);
    assert.ok(anchor.includes(`data-i18n="${label}"`), `${event} labels its original CTA`);
    const destination =
      event.includes("google_play") || event.startsWith("final_") || event.startsWith("header_")
        ? "https://play.google.com/store/apps/details?id=org.useorbit.app"
        : process.env.PUBLIC_APP_URL || "https://app.useorbit.org";
    assert.ok(anchor.includes(`href="${destination}"`), `${event} keeps its destination`);
  });
}

test("the built offer names the routine friction and links directly to Android", () => {
  assert.match(html, /id="hero"/);
  const hero = html.split('id="hero"')[1].split("</section>")[0];
  assert.match(hero, /Keeping a routine is hard/);
  assert.match(hero, /play\.google\.com\/store\/apps\/details\?id=org\.useorbit\.app/);
  assert.match(hero, /proof\.founder\.body/);
  assert.doesNotMatch(hero, /hero-rise|animation-delay|<video/);
});

test("built marketing contains no retired claims or decorative behavior", () => {
  assert.doesNotMatch(
    html,
    /data-count-target|count-up|Most popular|MCP|AI memory|accountability|leaderboards|500 AI|20 AI|unlimited habits/i,
  );
  assert.doesNotMatch(html, /data-tilt|starfield|orbit-dot|satellite-bob|<video/);
  assert.match(html, /data-screen="today"/);
  assert.match(html, /data-screen="astra"/);
  assert.match(html, /data-state="proposed"/);
  for (const action of ["Approve", "Edit", "Reject"]) assert.ok(prose.includes(action));
});

test("application offers and FAQ use complete, visible values", () => {
  assert.equal(structured.length, 2);
  for (const block of structured) assert.ok(!JSON.stringify(block).includes("undefined"));
  const graph = structured[0]["@graph"];
  for (const app of graph.filter((entry) => /Application$/.test(entry["@type"]))) {
    assert.equal(app.offers.length, 3);
    assert.deepEqual(
      app.offers.map(({ price }) => price),
      [0, 9.99, 69.99],
    );
    for (const offer of app.offers) {
      assert.equal(offer.priceCurrency, "USD");
      assert.ok(prose.includes(`$${offer.price.toFixed(2)}`), `visible price ${offer.price}`);
    }
  }
  for (const question of structured[1].mainEntity) {
    assert.ok(question.name && question.acceptedAnswer.text);
    assert.ok(prose.includes(question.name));
    assert.ok(prose.includes(question.acceptedAnswer.text));
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
  for (const id of ["form", "email", "submit", "submit-label", "status", "turnstile"]) {
    assert.ok(html.includes(`id="waitlist-${id}"`));
  }
});

test("confirmation uses native hidden state for both response paths", async () => {
  const { default: vm } = await import("node:vm");
  const page = readFileSync("dist/waitlist-confirmed/index.html", "utf8");
  const tags = Object.fromEntries(
    [...page.matchAll(/<div\b([^>]*id="(confirmed-(?:ok|invalid))"[^>]*)>/g)].map(
      ([, attributes, id]) => [id, attributes],
    ),
  );
  const script = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, code]) => code)
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
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (attributes.includes("application/ld+json")) continue;
    const path = attributes.match(/src="([^"]+)"/)?.[1];
    bytes += path ? bytesFor(path) : Buffer.byteLength(body);
  }
  assert.ok(bytes <= 24000, `${bytes} script bytes exceed 24000`);
});
