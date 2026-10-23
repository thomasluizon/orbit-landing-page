import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const guard = fileURLToPath(new URL("./validate-turnstile.mjs", import.meta.url));

for (const [scenario, value] of [
  ["empty", ""],
  ["overlong", "x".repeat(33)],
]) {
  test(`the build rejects an ${scenario} site key before producing artifacts`, () => {
    const result = spawnSync("npm", ["run", "build"], {
      encoding: "utf8",
      env: { ...process.env, PUBLIC_TURNSTILE_SITE_KEY: value },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /PUBLIC_TURNSTILE_SITE_KEY/);
    assert.doesNotMatch(result.stdout + result.stderr, /building client|built in/);
    if (value) assert.ok(!(result.stdout + result.stderr).includes(value));
  });
}

test("the guard accepts both documented length boundaries", () => {
  for (const length of [1, 32]) {
    const result = spawnSync(process.execPath, [guard], {
      encoding: "utf8",
      env: { ...process.env, PUBLIC_TURNSTILE_SITE_KEY: "x".repeat(length) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  }
});

test("the guard reads production env files and rejects whitespace without printing values", () => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-turnstile-"));
  const env = { ...process.env };
  delete env.PUBLIC_TURNSTILE_SITE_KEY;
  try {
    writeFileSync(join(directory, ".env.production"), "PUBLIC_TURNSTILE_SITE_KEY=synthetic\n");
    const result = spawnSync(process.execPath, [guard], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const rejected = spawnSync(process.execPath, [guard], {
      cwd: directory,
      env: { ...env, PUBLIC_TURNSTILE_SITE_KEY: "   " },
      encoding: "utf8",
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /PUBLIC_TURNSTILE_SITE_KEY/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
