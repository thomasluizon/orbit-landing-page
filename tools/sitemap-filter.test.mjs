import assert from "node:assert/strict";
import test from "node:test";
import { hasNoindexRobotsMeta } from "../astro.config.mjs";

test("detects robots noindex with reordered or additional attributes", () => {
  const variants = [
    '<meta content="noindex, nofollow" name="robots">',
    '<meta name="robots" data-owner="layout" content="noindex, nofollow">',
    "<meta content='NOINDEX' data-owner=layout name='ROBOTS' />",
    '<meta data-owner=">" content="noindex" name="robots">',
  ];

  for (const metaTag of variants) {
    assert.equal(hasNoindexRobotsMeta(`<head>${metaTag}</head>`), true);
  }
});

test("keeps pages without a robots noindex directive", () => {
  const variants = [
    '<meta name="robots" content="index, follow">',
    '<meta name="description" content="noindex">',
    '<meta name="robots" content="noindexable">',
  ];

  for (const metaTag of variants) {
    assert.equal(hasNoindexRobotsMeta(`<head>${metaTag}</head>`), false);
  }
});
