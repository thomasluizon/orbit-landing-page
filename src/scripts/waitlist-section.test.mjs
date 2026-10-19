import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness(hash = "", reduced = false) {
  const listeners = new Map(),
    entries = [];
  const section = {
      scrollIntoView(options) {
        entries.push(options);
      },
    },
    email = {
      focused: { preventScroll: false },
      focus(options) {
        this.focused = options;
      },
    };
  const triggers = [{}, {}].map(() => ({
    addEventListener(name, fn) {
      this[name] = fn;
    },
  }));
  const location = { hash };
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/waitlist-section.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      document: {
        getElementById: (id) => (id === "ios" ? section : email),
        querySelectorAll: () => triggers,
      },
      window: {
        location,
        matchMedia: () => ({ matches: reduced }),
        history: {
          pushState(_state, _title, value) {
            location.hash = value;
          },
        },
        addEventListener: (name, fn) => listeners.set(name, fn),
      },
    },
  );
  return { entries, email, triggers, listeners, location };
}
test("the ios fragment scrolls to the dedicated section and focuses its real email field", () => {
  for (const reduced of [false, true]) {
    const h = harness("#ios", reduced);
    assert.equal(h.entries.length, 1);
    assert.equal(h.entries[0].behavior, reduced ? "instant" : "smooth");
    assert.equal(h.email.focused.preventScroll, true);
  }
});
test("footer and FAQ entries repeat the same fragment behavior and history stays usable", () => {
  const h = harness();
  assert.equal(h.entries.length, 0);
  for (const trigger of h.triggers) trigger.click({ preventDefault() {} });
  assert.equal(h.location.hash, "#ios");
  assert.equal(h.entries.length, 2);
  h.location.hash = "";
  h.listeners.get("popstate")();
  assert.equal(h.entries.length, 2);
  h.location.hash = "#ios";
  h.listeners.get("hashchange")();
  assert.equal(h.entries.length, 3);
});
test("the section precedes FAQ and owns the existing waitlist and Turnstile controls", () => {
  const source = readFileSync("src/components/IosWaitlist.astro", "utf8");
  assert.match(source, /<section\s+id="ios"/);
  assert.doesNotMatch(source, /<dialog|ios-close/);
  for (const id of ["form", "email", "submit", "submit-label", "status", "turnstile", "privacy"])
    assert.ok(source.includes(`id="waitlist-${id}"`));
  const page = readFileSync("src/pages/index.astro", "utf8");
  assert.ok(page.indexOf("<IosWaitlist />") < page.indexOf("<Faq />"));
});
