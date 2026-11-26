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

test("the workflow builds once with the App Store listing set", () => {
  const step = workflow.match(
    /- name: Build with the App Store listing\n([\s\S]*?)(?=\n\s+- name:|$)/,
  );
  assert.ok(step, "the App Store build step exists");
  assert.match(step[1], /if: \$\{\{ !cancelled\(\) && steps\.build\.outcome == 'success' \}\}/);
  assert.match(step[1], /run: npm run build\n/);
  assert.match(
    step[1],
    /PUBLIC_IOS_APP_STORE_URL: https:\/\/apps\.apple\.com\/us\/app\/orbit\/id\d+\n/,
  );
});

test("the Build workflow runs on pull requests only", () => {
  const triggers = workflow.match(/^on:\n((?:\s+.*\n)+?)\n/m);
  assert.ok(triggers, "the workflow has a trigger block");
  assert.match(triggers[1], /^ {2}pull_request:/m);
  assert.doesNotMatch(triggers[1], /^ {2}push:/m);
});

test("the Build workflow has no Audit step", () => {
  assert.doesNotMatch(workflow, /npm audit/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test("a pull request run saves the npm cache after a cache miss", () => {
  const step = workflow.match(/- name: Save the npm cache\n([\s\S]*?)(?=\n\s+- name:|$)/);
  assert.ok(step, "the cache save step exists");
  assert.match(step[1], /cache-hit != 'true'/);
  assert.doesNotMatch(step[1], /event_name/);
});

const codeql = readFileSync(new URL("../workflows/codeql.yml", import.meta.url), "utf8");

test("the CodeQL workflow runs on a weekly schedule and on dispatch only", () => {
  const triggers = codeql.match(/^on:\n((?:\s+.*\n)+?)\n/m);
  assert.ok(triggers, "the CodeQL workflow has a trigger block");
  assert.match(triggers[1], /^ {2}schedule:/m);
  assert.match(triggers[1], /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(triggers[1], /^ {2}(pull_request|push):/m);
  assert.match(triggers[1], /cron: "\d+ \d+ \* \* \d"/);
});

test("every action in the CodeQL workflow is pinned to a full commit SHA", () => {
  const uses = [...codeql.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses) {
    assert.match(reference, /@[0-9a-f]{40}$/, `${reference} is not pinned`);
  }
});
