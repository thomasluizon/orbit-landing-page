import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

const html = readFileSync("dist/index.html", "utf8");
const prose = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ");
const structured = [
  ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
].map((match) => JSON.parse(match[1]));

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
  ["hero_app_cta_clicked", /<footer\b[^>]*>[\s\S]*?<\/footer>/, "hero.web"],
  [
    "hero_google_play_cta_clicked",
    /<main\b[^>]*id="main-content"[^>]*>[\s\S]*?<\/main>/,
    "hero.cta",
  ],
]) {
  test(`the built ${event} keeps its action and destination`, () => {
    const attribute = `data-analytics-event="${event}"`;
    assert.equal(html.split(attribute).length - 1, 1);
    const surface = html.match(region)?.[0];
    assert.ok(surface);
    const anchor = [...surface.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(attribute));
    assert.ok(anchor?.includes(`data-i18n="${label}"`));
    const destination =
      event !== "hero_google_play_cta_clicked"
        ? process.env.PUBLIC_APP_URL || "https://app.useorbit.org"
        : "https://play.google.com/store/apps/details?id=org.useorbit.app";
    assert.ok(anchor.includes(`href="${destination}"`));
  });
}

test("the built homepage follows the scrolling Astra composition with the original waitlist dialog", () => {
  assert.match(html, /class="landing-shell"/);
  assert.match(html, /id="astra-demo"/);
  assert.match(html, /<dialog[^>]*id="ios"[^>]*aria-labelledby="ios-title"/);
  assert.match(html, /href="#ios"[^>]*id="ios-trigger"/);
  assert.deepEqual(
    [...html.matchAll(/data-section="([^"]+)"/g)].map(([, name]) => name),
    [
      "hero",
      "trust",
      "features",
      "details",
      "progress",
      "restart",
      "security",
      "pricing",
      "faq",
      "final",
      "footer",
    ],
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

test("the built proposal has three native neutral pill actions beneath the hero CTA", () => {
  const row = html.match(/<div class="demo-preview-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(row);
  const buttons = [...row.matchAll(/<button\b([^>]+)>/g)].map(([, attributes]) => attributes);
  assert.equal(buttons.length, 3);
  for (const [index, action] of ["reject", "edit", "approve"].entries()) {
    assert.ok(buttons[index].includes(`id="demo-${action}"`));
    assert.ok(buttons[index].includes('type="button"'));
    assert.ok(buttons[index].includes("pill-sm"));
    assert.ok(buttons[index].includes("bg-transparent"));
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

test("the built billing control defaults to monthly and keeps annual arithmetic out of its resting view", () => {
  const pro = html.match(/<article class="plan-card plan-pro">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(pro);
  const group = html.match(/<div[^>]*role="radiogroup"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(group);
  assert.match(group, /data-billing-period="monthly"[^>]*aria-checked="true"[^>]*tabindex="0"/);
  assert.match(group, /data-billing-period="yearly"[^>]*aria-checked="false"[^>]*tabindex="-1"/);
  assert.match(pro, /data-price="monthly"/);
  assert.doesNotMatch(pro, /data-price="yearly"/);
  assert.match(pro, /data-annual-equivalent[^>]*hidden/);
  assert.doesNotMatch(pro, /or \$69\.99 per year/);
  const action = pro.match(/<a\b[^>]*href="[^"]*\/upgrade"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  assert.match(action, /data-copy-en="Try Pro" data-copy-pt="Testar Pro"/);
  assert.match(pro, /Try Pro free for 7 days/);
  assert.match(pro, /Teste o Pro grátis por 7 dias/);
});

test("multi-sentence section headings preserve full sentences in both locales", () => {
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.match(
    css,
    /@media \(min-width: 48rem\)\s*\{\s*\.heading-sentence\s*\{\s*display:\s*block/,
  );
  assert.match(css, /\.sentence-title\s*\{[^}]*text-wrap:\s*balance/);
  for (const id of ["pricing-title", "understand-title", "restart-title", "security-title"]) {
    const heading = html.match(new RegExp(`<h2\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/h2>`))?.[0];
    assert.ok(heading, id);
    const sentences = [
      ...heading.matchAll(
        /<span class="heading-sentence" data-copy-en="([^"]+)" data-copy-pt="([^"]+)" aria-hidden="true">/g,
      ),
    ];
    assert.equal(sentences.length, 2, `${id} breaks only between complete sentences`);
    for (const [, en, pt] of sentences) {
      assert.match(en, /[.!?]$/);
      assert.match(pt, /[.!?]$/);
    }
    assert.ok(heading.includes(`aria-label="${sentences.map(([, en]) => en).join(" ")}"`));
    assert.ok(
      heading.includes(`data-copy-label-pt="${sentences.map(([, , pt]) => pt).join(" ")}"`),
    );
  }
});
