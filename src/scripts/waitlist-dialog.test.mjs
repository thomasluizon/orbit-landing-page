import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

function harness(hash = "") {
  const listeners = new Map();
  const elements = new Map(
    ["ios", "ios-trigger", "ios-faq-trigger", "ios-close"].map((id) => [
      id,
      {
        open: false,
        focused: false,
        listeners: new Map(),
        addEventListener(name, callback) {
          this.listeners.set(name, callback);
        },
        focus() {
          this.focused = true;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
          this.listeners.get("close")();
        },
      },
    ]),
  );
  const location = { hash, pathname: "/", search: "?source=link" };
  const history = [];
  const update = (url) => {
    location.hash = url.includes("#") ? "#" + url.split("#")[1] : "";
    history.push(url);
  };
  const code = ts.transpileModule(readFileSync("src/scripts/waitlist-dialog.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    document: {
      getElementById: (id) => elements.get(id),
      querySelectorAll: () => [elements.get("ios-trigger"), elements.get("ios-faq-trigger")],
    },
    window: {
      location,
      history: {
        pushState: (_state, _title, url) => update(url),
        replaceState: (_state, _title, url) => update(url),
      },
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
  });
  return {
    dialog: elements.get("ios"),
    trigger: elements.get("ios-trigger"),
    faqTrigger: elements.get("ios-faq-trigger"),
    close: elements.get("ios-close"),
    location,
    history,
    listeners,
  };
}

test("the legacy ios fragment opens the native modal and close returns focus to its entry", () => {
  const h = harness("#ios");
  assert.equal(h.dialog.open, true);
  h.close.listeners.get("click")();
  assert.equal(h.dialog.open, false);
  assert.equal(h.location.hash, "");
  assert.deepEqual(h.history, ["/?source=link"]);
  assert.equal(h.trigger.focused, true);
});

test("the trigger opens repeatedly and history navigation synchronizes the modal", () => {
  const h = harness();
  assert.equal(h.dialog.open, false);
  h.trigger.listeners.get("click")({ preventDefault() {} });
  assert.equal(h.location.hash, "#ios");
  assert.equal(h.dialog.open, true);
  h.location.hash = "";
  h.listeners.get("popstate")();
  assert.equal(h.dialog.open, false);
  h.location.hash = "#ios";
  h.listeners.get("hashchange")();
  assert.equal(h.dialog.open, true);
  h.dialog.close();
  assert.equal(h.trigger.focused, true);
});

test("the platform FAQ opens the same waitlist and receives focus again on close", () => {
  const h = harness();
  h.faqTrigger.listeners.get("click")({ preventDefault() {} });
  assert.equal(h.dialog.open, true);
  assert.deepEqual(h.history, ["#ios"]);
  h.close.listeners.get("click")();
  assert.equal(h.dialog.open, false);
  assert.equal(h.faqTrigger.focused, true);
  assert.equal(h.trigger.focused, false);
});

test("the owning dialog contains the unchanged real form, status, privacy and close control", async () => {
  const { ast } = await parse(readFileSync("src/components/IosWaitlist.astro", "utf8"));
  const descendants = [];
  function visit(node, inside = false) {
    const attrs = Object.fromEntries(
      (node.attributes ?? []).map(({ name, value }) => [name, value]),
    );
    if (node.name === "dialog") {
      inside = true;
      assert.equal(attrs["aria-labelledby"], "ios-title");
    }
    if (inside && attrs.id) descendants.push(attrs.id);
    for (const child of node.children ?? []) visit(child, inside);
  }
  visit(ast);
  for (const id of [
    "ios-close",
    "waitlist-form",
    "waitlist-email",
    "waitlist-turnstile",
    "waitlist-submit",
    "waitlist-status",
    "waitlist-privacy",
  ])
    assert.ok(descendants.includes(id), id);
  assert.doesNotMatch(
    readFileSync("src/scripts/waitlist-dialog.ts", "utf8"),
    /addEventListener\("cancel"/,
  );
});
