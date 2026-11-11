import assert from "node:assert/strict";
import test from "node:test";
import { documentFrom } from "./lib/mini-dom.mjs";

const page = `<!doctype html><html lang="en"><body><main><ul>${'<li><button data-day-key="2026-03-02">2</button></li>'.repeat(7)}</ul></main></body></html>`;

test("a failing assertion on two elements formats a short message", () => {
  const document = documentFrom(page);
  const [first, second] = document.querySelectorAll("button");
  // Checked first: on a surface that exposes its tree, the formatting below grows without bound.
  for (const value of [document, document.documentElement, first]) {
    assert.deepEqual(Object.keys(value), ["tagName"]);
  }
  assert.equal(first.parentElement.tagName, "li");
  assert.equal(first.dataset.dayKey, "2026-03-02");
  assert.throws(
    () => assert.equal(first, second),
    (error) => error.code === "ERR_ASSERTION" && error.message.length < 400,
  );
});
