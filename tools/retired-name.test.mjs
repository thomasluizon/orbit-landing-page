import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  demoAnchor,
  feminineOrbit,
  retiredCapitalised,
  retiredName,
  retiredNameFindings,
  retiredWord,
} from "./lib/retired-name.mjs";

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
  const name = retiredWord;
  const capitalised = retiredCapitalised;
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

test("the guard flags the name in every spelling a source file uses", () => {
  const upper = retiredWord.toUpperCase();
  for (const text of [
    capitalisedUse("Ask X"),
    upper,
    `${retiredWord}Tools`,
    `${retiredCapitalised}Glyph`,
    `with${retiredCapitalised}Glyph`,
    `phone-today-${retiredWord}`,
    `class="${retiredWord}-old"`,
  ]) {
    assert.equal(retiredNameFindings("src/new.ts", text).length, 1, text);
  }
});

test("the guard keeps ordinary words that hold the same letters", () => {
  for (const word of ["cadastrado", "cadastrar", "alastrar", "desastrado", "astray", "astral"]) {
    assert.deepEqual(retiredNameFindings("src/new.ts", `Você já está ${word}`), [], word);
  }
  for (const word of ["Astral", "Astray", "ASTRAL", "CADASTRADO"]) {
    assert.deepEqual(retiredNameFindings("src/new.ts", `${word} starts this sentence`), [], word);
  }
});

function capitalisedUse(prefix) {
  return prefix.replace("X", retiredCapitalised);
}

test("the feminine article guard catches the contraction that starts with a non-ASCII letter", () => {
  for (const text of ["Peça à Orbit", "Fale com a Orbit", "A Orbit ajuda", "Conversa da Orbit"]) {
    assert.match(text, feminineOrbit, text);
  }
  for (const text of [
    "Peça ao Orbit",
    "Conversa com o Orbit",
    "Para o Orbit",
    "Fale com ele, o Orbit",
  ]) {
    assert.doesNotMatch(text, feminineOrbit, text);
  }
});
