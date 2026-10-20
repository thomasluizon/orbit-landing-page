import assert from "node:assert/strict";
import test from "node:test";
import { scriptsFrom } from "./html.test-helper.mjs";

for (const [source, body] of [
  ["<script>console.log(1)</script/foo>", "console.log(1)"],
  ["<script>console.log(1)</script/ >", "console.log(1)"],
  ["<SCRIPT>console.log(1)</SCRIPT>", "console.log(1)"],
  ["<script>console.log(1)</script \n>", "console.log(1)"],
  ["<ScRiPt>console.log(1)</sCrIpT\t>", "console.log(1)"],
  ["<ScRiPt>console.log(1)</sCrIpT\t\n bar>", "console.log(1)"],
  ["<script>console.log(1)</script\r\f>", "console.log(1)"],
  ["<script>console.log(1)", "console.log(1)"],
  [
    '<p>🌙</p><script>\r\nconst value = "🌙 &amp; <SCRIPT>";\r</script>',
    '\r\nconst value = "🌙 &amp; <SCRIPT>";\r',
  ],
  ['<script>const marker = "</scripture>";</script>', 'const marker = "</scripture>";'],
]) {
  test(`script extraction preserves the original body from ${JSON.stringify(source)}`, () => {
    assert.deepEqual(scriptsFrom(source), [{ attributes: {}, body }]);
  });
}

test("Chromium ends script data at an end tag inside a JavaScript string", () => {
  assert.deepEqual(
    scriptsFrom('<script>const marker = "</script>"; console.log(marker);</script>'),
    [{ attributes: {}, body: 'const marker = "' }],
  );
});

test("script extraction keeps the attribute map consumers read", () => {
  assert.deepEqual(
    scriptsFrom('<script TYPE="module" src="/startup.js"></script><script async>run()</script>'),
    [
      { attributes: { type: "module", src: "/startup.js" }, body: "" },
      { attributes: { async: "" }, body: "run()" },
    ],
  );
});
