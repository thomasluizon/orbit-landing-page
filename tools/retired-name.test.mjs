import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { demoAnchor, retiredName, retiredNameFindings } from "./lib/retired-name.mjs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const textOf = (path) => {
  const bytes = readFileSync(path);
  return bytes.includes(0) ? "" : bytes.toString("utf8");
};

test("no tracked path holds the retired AI name", () => {
  assert.deepEqual(
    tracked.filter((path) => retiredName.test(path)),
    [],
  );
});

test("no tracked text file holds the retired AI name outside the demo anchor and the licence", () => {
  assert.deepEqual(
    tracked.flatMap((path) => retiredNameFindings(path, textOf(path))),
    [],
  );
});

test("the guard flags a new use of the retired name and keeps the two allowed uses", () => {
  const name = retiredName.source;
  const capitalised = `${name[0].toUpperCase()}${name.slice(1)}`;
  assert.deepEqual(retiredNameFindings("src/new.ts", `const title = "Ask ${capitalised}";`), [
    `src/new.ts line 1: const title = "Ask ${capitalised}";`,
  ]);
  assert.deepEqual(retiredNameFindings("src/a.ts", `<section id="${demoAnchor}" class="x">`), []);
  assert.equal(
    retiredNameFindings("src/b.ts", `<section id="${demoAnchor}" class="${name}-old">`).length,
    1,
  );
  assert.deepEqual(retiredNameFindings("LICENSE", `"Orbit" and "${capitalised}", together`), []);
  assert.equal(retiredNameFindings("README.md", `"Orbit" and "${capitalised}"`).length, 1);
});
