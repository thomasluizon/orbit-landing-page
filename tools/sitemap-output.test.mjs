import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generated sitemap contains only indexable pages", async () => {
  const sitemap = await readFile("dist/sitemap-0.xml", "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.deepEqual(locations, ["https://useorbit.org/"]);
});
