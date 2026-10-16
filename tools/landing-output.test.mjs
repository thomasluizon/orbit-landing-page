import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("dist/index.html", "utf8");
const prose = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ");
const structured = [
  ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
].map((match) => JSON.parse(match[1]));

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
