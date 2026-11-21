import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/build.yml", import.meta.url), "utf8");
const stepIds = new Set([...workflow.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((match) => match[1]));
const conditions = [...workflow.matchAll(/^\s+if:\s*(.+)$/gm)].map((match) => match[1]);
const references = conditions.flatMap((condition) =>
  [...condition.matchAll(/steps\.([\w-]+)\./g)].map((match) => ({ condition, id: match[1] })),
);

test("every step condition names a step that exists", () => {
  assert.ok(references.length > 0);
  for (const { condition, id } of references) {
    assert.ok(stepIds.has(id), `${condition} reads the missing step "${id}"`);
  }
});

test("the Build step runs when the install passes", () => {
  const build = workflow.match(/- name: Build\n\s+id: build\n\s+if: (.+)\n/);
  assert.ok(build, "the Build step has an id and a condition");
  assert.equal(build[1], "${{ !cancelled() && steps.install.outcome == 'success' }}");
});
