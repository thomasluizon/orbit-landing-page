import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-instructions.mjs");
const BUDGET = Number(/const HARNESS_LINE_BUDGET = (\d+);/.exec(readFileSync(SCRIPT, "utf8"))[1]);
const lines = (count) => "x\n".repeat(count);
const doc = (count) => `# Doc\n${lines(count - 1)}`;

const cases = [
  {
    name: "an always-loaded file over 6,000 B",
    files: { "CLAUDE.md": "a".repeat(6001) },
    finding: "CLAUDE.md: 6001 B is over the 6000 B budget",
  },
  {
    name: "an always-loaded file at 6,000 B",
    files: { "CLAUDE.md": "a".repeat(6000) },
  },
  {
    name: "a nested AGENTS.md over 200 lines",
    files: { "pkg/AGENTS.md": lines(201) },
    finding: "pkg/AGENTS.md: 201 lines is over the 200 line budget",
  },
  {
    name: "a rules file over 6,000 B",
    files: { ".claude/rules/a.md": "a".repeat(6001) },
    finding: ".claude/rules/a.md: 6001 B is over the 6000 B budget",
  },
  {
    name: "a doc over 20,000 B",
    files: { "docs/a.md": `## Contents\n${"a".repeat(20001)}` },
    finding: "docs/a.md: 20013 B is over the 20000 B budget",
  },
  {
    name: "a doc of 101 lines with no Contents heading",
    files: { "docs/a.md": doc(101) },
    finding: 'docs/a.md: 101 lines and no "## Contents" heading',
  },
  {
    name: "a doc of 101 lines with a Contents heading",
    files: { "docs/a.md": `## Contents\n${doc(100)}` },
  },
  {
    name: "a dead backticked path",
    files: { "README.md": "See `src/gone.ts`.\n", "src/a.ts": "a\n" },
    finding: "README.md: the cited path src/gone.ts is not tracked",
  },
  {
    name: "a live backticked path with a line suffix",
    files: { "README.md": "See `src/a.ts:12` and `src/a.ts:3-9` and `src/`.\n", "src/a.ts": "a\n" },
  },
  {
    name: "a dead path with a line suffix",
    files: { "README.md": "See `src/gone.ts:12`.\n", "src/a.ts": "a\n" },
    finding: "README.md: the cited path src/gone.ts:12 is not tracked",
  },
  {
    name: "a backticked path of another repository",
    files: { "README.md": "See `../other/gone.ts` and `other/gone.ts`.\n", "src/a.ts": "a\n" },
  },
  {
    name: "a dead path inside a code fence",
    files: { "README.md": "```sh\ncat `src/gone.ts`\n```\n", "src/a.ts": "a\n" },
  },
  {
    name: "a harness one line over the budget",
    files: { "tools/big.txt": lines(BUDGET + 1) },
    finding: `harness: ${BUDGET + 1} lines is over the ${BUDGET} line budget. The harness line budget changes only by the owner's words.`,
  },
  {
    name: "a harness at the budget",
    files: { "tools/big.txt": lines(BUDGET) },
  },
];

for (const { name, files, finding } of cases) {
  test(name, () => {
    const root = mkdtempSync(join(tmpdir(), "check-instructions-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), content);
      }
      execFileSync("git", ["add", "."], { cwd: root });
      const run = spawnSync("node", [SCRIPT], { cwd: root, encoding: "utf8" });
      if (finding) {
        assert.equal(run.status, 1, run.stdout);
        assert.equal(run.stdout.trim(), finding);
      } else {
        assert.equal(run.status, 0, run.stdout);
        assert.equal(run.stdout, "");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
