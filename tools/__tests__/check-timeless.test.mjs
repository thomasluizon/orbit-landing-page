import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const toolPath = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const T = (label, passed) => assert.ok(passed, label);

const checker = toolPath("check-timeless.mjs");
const project = dirname(dirname(checker));
const hookEntry = ".claude/hooks/forbid-stale-text.mjs";
const run = (cwd, args, input) =>
  spawnSync(process.execPath, [join(cwd, "tools", "check-timeless.mjs"), ...args], {
    cwd,
    input,
    encoding: "utf8",
  });
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const date = ["2026", "-08-12"].join("");
const owner = ["Tho", "mas"].join("");
const machine = ["/", "Users/example/work"].join("");

const fixture = (label, path, content) => {
  const root = mkdtempSync(join(tmpdir(), `timeless-${label}-`));
  mkdirSync(join(root, "tools"));
  cpSync(checker, join(root, "tools", "check-timeless.mjs"));
  mkdirSync(join(root, ".claude", "hooks"), { recursive: true });
  cpSync(join(project, hookEntry), join(root, hookEntry));
  writeFileSync(join(root, "tools", "timeless-allowlist.json"), "[]\n");
  git(root, "init", "-q", "--initial-branch=main");
  git(root, "config", "user.email", "gate@orbit.test");
  git(root, "config", "user.name", "Orbit Gate");
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
  git(root, "add", "tools/check-timeless.mjs", "tools/timeless-allowlist.json", path);
  git(root, "commit", "-qm", "base");
  return root;
};

test("timeless checker modes and exceptions", () => {
  const path = ["/", "Users/alex/project"].join("");
  const windowsPath = ["C:", "\\", "Users", "\\", "alex"].join("");
  const cases = [
    ["machine-path", "sample.md", `Use ${path}.\n`],
    ["machine-path-windows", "sample.md", `Use ${windowsPath}.\n`],
    ["owner-name", "sample.md", `Ask ${owner}.\n`],
    ["dated-anecdote", "sample.md", `On ${date}, the run failed.\n`],
    [
      "comment-length",
      "sample.js",
      Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n") + "\n",
    ],
  ];
  for (const [rule, name, planted] of cases) {
    const root = fixture(rule, name, "clean\n");
    const base = git(root, "rev-parse", "HEAD").stdout.trim();
    const file = join(root, name);
    const payload = {
      tool_name: "Write",
      tool_input: { file_path: file, content: planted },
      cwd: root,
    };
    T(
      `${rule}: hook rejects a new finding`,
      run(root, ["--hook"], JSON.stringify(payload)).status === 2,
    );
    writeFileSync(file, planted);
    git(root, "add", name);
    T(`${rule}: all rejects a planted finding`, run(root, ["--all"]).status === 1);
    T(`${rule}: staged rejects a planted finding`, run(root, ["--staged"]).status === 1);
    git(root, "commit", "-qm", "plant");
    T(`${rule}: base rejects a planted finding`, run(root, ["--base", base]).status === 1);
    writeFileSync(file, "clean\n");
    git(root, "add", name);
    T(`${rule}: all passes after removal`, run(root, ["--all"]).status === 0);
    T(`${rule}: staged passes after removal`, run(root, ["--staged"]).status === 0);
    git(root, "commit", "-qm", "remove");
    T(`${rule}: base passes after removal`, run(root, ["--base", base]).status === 0);
    T(
      `${rule}: hook passes after removal`,
      run(
        root,
        ["--hook"],
        JSON.stringify({ ...payload, tool_input: { file_path: file, content: "clean\n" } }),
      ).status === 0,
    );
    rmSync(root, { recursive: true, force: true });
  }

  const safe = fixture(
    "literals",
    "sample.js",
    `const message = "${date}";\nconst pattern = /${date}/;\n// one\n// two\n// three\n// four\n// five\n// six\n`,
  );
  const growing = fixture(
    "growing-comment",
    "sample.js",
    Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n") + "\n",
  );
  const seventh = "// reason 6\n";
  writeFileSync(
    join(growing, "sample.js"),
    Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n") + "\n" + seventh,
  );
  git(growing, "add", "sample.js");
  T(
    "adding only the seventh comment line fails staged mode",
    run(growing, ["--staged"]).status === 1,
  );
  rmSync(growing, { recursive: true, force: true });
  writeFileSync(join(safe, "sample.json"), JSON.stringify({ date }));
  git(safe, "add", "sample.json");
  T("string, regex, JSON, and six comment lines pass", run(safe, ["--all"]).status === 0);
  const jsx = fixture("jsx-text", "sample.tsx", "export const Sample = () => <span>clean</span>\n");
  symlinkSync(join(checker, "..", "..", "node_modules"), join(jsx, "node_modules"), "dir");
  const writeJsx = (content) =>
    run(
      jsx,
      ["--hook"],
      JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: join(jsx, "sample.tsx"), content },
        cwd: jsx,
      }),
    );
  const rendered = `export const Sample = () => <span>// ${date}</span>\n`;
  T("JSX text with a date passes Write hook", writeJsx(rendered).status === 0);
  writeFileSync(join(jsx, "sample.tsx"), rendered);
  git(jsx, "add", "sample.tsx");
  T(
    "JSX text with a date passes all and staged",
    run(jsx, ["--all"]).status === 0 && run(jsx, ["--staged"]).status === 0,
  );
  const jsxComment = `export const Sample = () => <span>{/* ${date} */}</span>\n`;
  T("a real JSX comment fails Write hook", writeJsx(jsxComment).status === 2);
  const jsxExpression = `export const Sample = () => <span>{value && (\n// ${date}\nvalue)}</span>\n`;
  T("a comment inside a JSX expression fails Write hook", writeJsx(jsxExpression).status === 2);
  const jsxAttribute = `export const Sample = () => <span title="// ${date}">clean</span>\n`;
  T("JSX attribute strings pass Write hook", writeJsx(jsxAttribute).status === 0);
  const nestedTernary = `export const Sample = () => <div>{ok ? <span>x</span> : /* ${date} */ null}</div>\n`;
  T(
    "a comment after nested JSX in a ternary fails Write hook",
    writeJsx(nestedTernary).status === 2,
  );
  const nestedMap = `export const Sample = () => <div>{items.map(item => <span>{item}</span> /* ${date} */)}</div>\n`;
  T(
    "a comment after nested JSX in a map callback fails Write hook",
    writeJsx(nestedMap).status === 2,
  );
  const nestedAttribute = `export const Sample = () => <div title={ok ? <span>x</span> : /* ${date} */ null}>clean</div>\n`;
  T(
    "a comment after nested JSX in an attribute expression fails Write hook",
    writeJsx(nestedAttribute).status === 2,
  );
  const parserLiterals = `export const Sample = () => <span>{"${date}"}{/${date}/.test(value)}</span>\n`;
  T(
    "the TypeScript parser ignores dates in strings and regex literals",
    writeJsx(parserLiterals).status === 0,
  );
  const sixLines = Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n");
  T("six TypeScript comment lines pass", writeJsx(`${sixLines}\n${rendered}`).status === 0);
  T(
    "seven TypeScript comment lines fail",
    writeJsx(`${sixLines}\n// reason 6\n${rendered}`).status === 2,
  );
  writeFileSync(join(jsx, "sample.tsx"), jsxComment);
  git(jsx, "add", "sample.tsx");
  T(
    "a real JSX comment fails all and staged",
    run(jsx, ["--all"]).status === 1 && run(jsx, ["--staged"]).status === 1,
  );
  rmSync(jsx, { recursive: true, force: true });
  const noParser = fixture(
    "jsx-without-parser",
    "sample.tsx",
    "export const Sample = () => <span>clean</span>\n",
  );
  const missingParser = run(noParser, ["--all"]);
  T(
    "TSX without TypeScript fails closed",
    missingParser.status === 2 && /TypeScript/.test(missingParser.stderr),
  );
  rmSync(noParser, { recursive: true, force: true });

  const scoped = fixture(
    "directory-scope",
    "design/canvas/example.md",
    `Ask ${owner} on ${date}.\n`,
  );
  const scopedAllowlist = ["owner-name", "dated-anecdote"].map((rule) => ({
    path: "design/canvas/",
    rule,
    match: null,
    scope: "directory",
    exclude: ["design/canvas/tools/"],
    reason: "granted export",
  }));
  writeFileSync(join(scoped, "tools", "timeless-allowlist.json"), JSON.stringify(scopedAllowlist));
  T("directory entries exempt their rules in --all", run(scoped, ["--all"]).status === 0);
  mkdirSync(join(scoped, "design", "canvas", "tools"), { recursive: true });
  writeFileSync(join(scoped, "design", "canvas", "tools", "example.md"), `Ask ${owner}.\n`);
  git(scoped, "add", "design/canvas/tools/example.md");
  T(
    "directory entries do not exempt an excluded subdirectory",
    run(scoped, ["--all"]).status === 1,
  );
  git(scoped, "rm", "-q", "design/canvas/tools/example.md");
  writeFileSync(join(scoped, "design/canvas/example.md"), `Ask ${owner} on ${date} at ${path}.\n`);
  T("directory entries never exempt machine paths", run(scoped, ["--all"]).status === 1);
  writeFileSync(join(scoped, "design/canvas/example.md"), "clean\n");
  T("unused directory entries fail --all", run(scoped, ["--all"]).status === 1);
  rmSync(scoped, { recursive: true, force: true });
  writeFileSync(
    join(safe, "tools", "timeless-allowlist.json"),
    JSON.stringify([{ path: "sample.js", rule: "owner-name", match: owner, reason: "unused" }]),
  );
  T("an unused allowlist entry fails", run(safe, ["--all"]).status === 1);
  const scratch = join(tmpdir(), "timeless-scratchpad.txt");
  T(
    "a scratchpad path passes the hook",
    run(
      safe,
      ["--hook"],
      JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: scratch, content: path },
        cwd: safe,
      }),
    ).status === 0,
  );
  rmSync(safe, { recursive: true, force: true });
});

test("Astro TypeScript comments are checked without treating markup as code", () => {
  const cases = [
    ["frontmatter", `---\n// ${date}\nconst title = "ready"\n---\n<p>{title}</p>\n`, 2],
    ["script", `<p>ready</p>\n<script>\n// ${date}\nconst title = "ready"\n</script>\n`, 3],
    [
      "script-end-tag",
      `<p>ready</p>\n<script>\n// ${date}\nconst title = "ready"\n</script\t\n foo>\n`,
      3,
    ],
    [
      "script-lookalike-string",
      `<p>ready</p>\n<script>\nconst marker = "</script!>"\n// ${date}\n</script>\n`,
      4,
    ],
  ];
  for (const [label, planted, line] of cases) {
    const root = fixture(`astro-${label}`, "sample.astro", "<p>clean</p>\n");
    symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
    const written = hook(root, "sample.astro", planted);
    T(
      `${label} date fails hook at the source line`,
      written.status === 2 && written.stderr.includes(`sample.astro:${line}: dated-anecdote`),
    );
    writeFileSync(join(root, "sample.astro"), planted);
    git(root, "add", "sample.astro");
    const all = run(root, ["--all"]);
    T(
      `${label} date fails all at the source line`,
      all.status === 1 && all.stderr.includes(`sample.astro:${line}: dated-anecdote`),
    );
    rmSync(root, { recursive: true, force: true });
  }
  const root = fixture("astro-markup", "sample.astro", `<p>${date}</p>\n`);
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  T("Astro markup date passes all", run(root, ["--all"]).status === 0);
  T(
    "Astro markup date passes hook",
    hook(root, "sample.astro", `<p>changed ${date}</p>\n`).status === 0,
  );
  const six = Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n");
  for (const content of [`---\n${six}\n---\n<p>ready</p>\n`, `<script>\n${six}\n</script>\n`]) {
    writeFileSync(join(root, "sample.astro"), content);
    T("six Astro comment lines pass all", run(root, ["--all"]).status === 0);
    const seven = content.replace(six, `${six}\n// reason 6`);
    writeFileSync(join(root, "sample.astro"), seven);
    const result = run(root, ["--all"]);
    T(
      "seven Astro comment lines fail all",
      result.status === 1 && result.stderr.includes("comment-length"),
    );
  }
  writeFileSync(join(root, "sample.astro"), `<!-- ${date} -->\n`);
  T("Astro markup comments still fail all", run(root, ["--all"]).status === 1);
  writeFileSync(
    join(root, "sample.astro"),
    `<script>\nconst date = "${date}"\nconst pattern = /${date}/\n</script>\n`,
  );
  T("Astro script literals pass all", run(root, ["--all"]).status === 0);
  rmSync(root, { recursive: true, force: true });
});

test("XML build files have their comments checked", () => {
  for (const name of ["sample.csproj", "Directory.Build.props", "nuget.config"]) {
    const root = fixture(`xml-${name}`, name, "<Project />\n");
    writeFileSync(join(root, name), `<Project>\n  <!-- ${date} -->\n</Project>\n`);
    git(root, "add", name);
    const all = run(root, ["--all"]);
    T(
      `${name} dated comment fails all`,
      all.status === 1 && all.stderr.includes(`${name}:2: dated-anecdote`),
    );
    rmSync(root, { recursive: true, force: true });
  }
});

test("an escaped backslash closes a YAML string before a trailing comment", () => {
  const root = fixture("yaml-escape", "sample.yml", "value: clean\n");
  writeFileSync(join(root, "sample.yml"), `value: "foo\\\\" # ${date}\n`);
  git(root, "add", "sample.yml");
  const all = run(root, ["--all"]);
  T(
    "the comment after an escaped backslash fails",
    all.status === 1 && all.stderr.includes("sample.yml:1: dated-anecdote"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("--staged checks a staged file whose working copy is gone", () => {
  const root = fixture("staged-removed", "sample.md", "clean\n");
  writeFileSync(join(root, "sample.md"), `Ask ${owner}.\n`);
  git(root, "add", "sample.md");
  rmSync(join(root, "sample.md"));
  const staged = run(root, ["--staged"]);
  T(
    "the staged blob is checked",
    staged.status === 1 && staged.stderr.includes("sample.md:1: owner-name"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a dated comment inside an empty call fails --all", () => {
  const root = fixture("empty-call-comment", "sample.ts", "consume()\n");
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "sample.ts"), `consume(/* ${date} */)\n`);
  const result = run(root, ["--all"]);
  T(
    "the comment in empty call trivia is checked",
    result.status === 1 && result.stderr.includes("sample.ts:1: dated-anecdote"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a Write hook rejects a date exposed by wrapping code in a comment", () => {
  const line = `const value = new Date("${date}")`;
  const root = fixture("wrap-existing-code", "sample.js", `${line}\n`);
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  const result = run(
    root,
    ["--hook"],
    JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(root, "sample.js"), content: `/*\n${line}\n*/\n` },
      cwd: root,
    }),
  );
  T(
    "the newly commented date fails the hook",
    result.status === 2 && result.stderr.includes("sample.js:2: dated-anecdote"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("moving an existing dated comment passes diff checks", () => {
  const comment = `// ${date}`;
  const root = fixture("move-existing-comment", "sample.js", `${comment}\nconst value = 1\n`);
  const moved = `const value = 1\n${comment}\n`;
  T("the hook accepts the moved finding", hook(root, "sample.js", moved).status === 0);
  writeFileSync(join(root, "sample.js"), moved);
  git(root, "add", "sample.js");
  T("staged mode accepts the moved finding", run(root, ["--staged"]).status === 0);
  rmSync(root, { recursive: true, force: true });
});

test("directory allowlists accept comment length but reject machine paths", () => {
  const root = fixture("directory-rules", "design/example.js", "clean\n");
  const comment = Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n");
  writeFileSync(join(root, "design/example.js"), `${comment}\n`);
  const entry = (rule) => ({
    path: "design/",
    rule,
    match: null,
    scope: "directory",
    reason: "reviewed fixture exception",
  });
  writeFileSync(
    join(root, "tools/timeless-allowlist.json"),
    JSON.stringify([entry("comment-length")]),
  );
  T("comment length is accepted in the directory", run(root, ["--all"]).status === 0);
  writeFileSync(
    join(root, "tools/timeless-allowlist.json"),
    JSON.stringify([entry("machine-path")]),
  );
  const rejected = run(root, ["--all"]);
  T(
    "machine path directory entries are refused",
    rejected.status === 2 &&
      rejected.stderr.includes("requires valid exact or directory-scoped entries"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a dated comment inside an empty call fails all", () => {
  const root = fixture("empty-call-comment", "sample.js", "run()\n");
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "sample.js"), `run(/* ${date} */)\n`);
  const result = run(root, ["--all"]);
  T(
    "empty call comment is checked",
    result.status === 1 && result.stderr.includes("dated-anecdote"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("Write hook rejects an existing date line wrapped in a comment", () => {
  const line = `const value = new Date("${date}")`;
  const root = fixture("comment-wrapped-date", "sample.js", `${line}\n`);
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  const result = run(
    root,
    ["--hook"],
    JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(root, "sample.js"), content: `/*\n${line}\n*/\n` },
    }),
  );
  T(
    "wrapping the date line adds a finding",
    result.status === 2 && result.stderr.includes("dated-anecdote"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("directory allowlist accepts comment length but refuses machine paths", () => {
  const comments = Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n");
  const root = fixture("directory-comment-length", "design/sample.js", `${comments}\n`);
  symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir");
  const entry = {
    path: "design/",
    rule: "comment-length",
    match: null,
    scope: "directory",
    reason: "reviewed export",
  };
  writeFileSync(join(root, "tools", "timeless-allowlist.json"), JSON.stringify([entry]));
  T("directory comment length exemption is accepted", run(root, ["--all"]).status === 0);
  writeFileSync(
    join(root, "tools", "timeless-allowlist.json"),
    JSON.stringify([{ ...entry, rule: "machine-path" }]),
  );
  const refused = run(root, ["--all"]);
  T(
    "directory machine path exemption is refused",
    refused.status === 2 && refused.stderr.includes("valid exact or directory-scoped entries"),
  );
  rmSync(root, { recursive: true, force: true });
});

const make = (name, content = "clean\n") => fixture("port", name, content);
const gitOutput = (root, ...args) => {
  const result = git(root, ...args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const hook = (root, name, content, command = "tools/check-timeless.mjs") => {
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: isAbsolute(name) ? name : join(root, name), content },
  });
  return command === "tools/check-timeless.mjs"
    ? run(root, ["--hook"], input)
    : spawnSync(process.execPath, [join(root, command)], { cwd: root, input, encoding: "utf8" });
};

test("the entry point rejects a planted edit and ignores scratchpad files", () => {
  const root = make("sample.md");
  try {
    writeFileSync(join(root, "sample.md"), `Ask ${owner}.\n`);
    const edit = {
      file_path: join(root, "sample.md"),
      old_string: "clean",
      new_string: `Ask ${owner}.`,
    };
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: edit,
      tool_response: {},
    });
    assert.equal(
      spawnSync(process.execPath, [join(root, hookEntry)], { cwd: root, input, encoding: "utf8" })
        .status,
      2,
    );
    const scratch = join(tmpdir(), "orbit-timeless-scratchpad.txt");
    assert.equal(hook(root, scratch, machine, hookEntry).status, 0);
    assert.equal(hook(root, "sample.md", "clean\n", hookEntry).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const canvasEntries = ["owner-name", "dated-anecdote"].map((rule) => ({
  path: "design/canvas/",
  rule,
  match: null,
  scope: "directory",
  reason: "granted export",
}));
const unusedDate = "unused allowlist: design/canvas/ dated-anecdote null";
const ownerFinding = (name) => `${name}:1: owner-name: ${owner}`;
const canvasFixture = () => {
  const root = make("design/canvas/kept.md", `Ask ${owner}.\n`);
  writeFileSync(join(root, "design/canvas/only.md"), `On ${date}, the canvas changed.\n`);
  writeFileSync(join(root, "tools/timeless-allowlist.json"), JSON.stringify(canvasEntries));
  gitOutput(root, "add", "design/canvas/only.md", "tools/timeless-allowlist.json");
  gitOutput(root, "commit", "-qm", "allow");
  return { root, base: gitOutput(root, "rev-parse", "HEAD") };
};
const writeAllowlist = (root, entries) => {
  writeFileSync(join(root, "tools/timeless-allowlist.json"), JSON.stringify(entries));
  gitOutput(root, "add", "tools/timeless-allowlist.json");
};
const touchChecker = (root) => {
  const file = join(root, "tools/check-timeless.mjs");
  writeFileSync(file, `${readFileSync(file, "utf8")}// note\n`);
  gitOutput(root, "add", "tools/check-timeless.mjs");
};

test("deleting the only file an allowlist entry covers fails staged and base", () => {
  const { root, base } = canvasFixture();
  try {
    assert.equal(run(root, ["--all"]).status, 0);
    gitOutput(root, "rm", "-q", "design/canvas/only.md");
    const staged = run(root, ["--staged"]);
    assert.equal(staged.status, 1);
    assert.ok(staged.stderr.includes(unusedDate), staged.stderr);
    gitOutput(root, "commit", "-qm", "delete");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(guard.stderr.includes(unusedDate), guard.stderr);
    assert.ok(!guard.stderr.includes("owner-name"), guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pull request outside every entry scope skips the unused check", () => {
  const { root } = canvasFixture();
  try {
    gitOutput(root, "rm", "-q", "design/canvas/only.md");
    gitOutput(root, "commit", "-qm", "delete");
    writeFileSync(join(root, "other.md"), "clean\n");
    gitOutput(root, "add", "other.md");
    gitOutput(root, "commit", "-qm", "unrelated");
    assert.equal(run(root, ["--base", "HEAD~1"]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removing the entry a deletion leaves unused passes base", () => {
  const { root, base } = canvasFixture();
  try {
    gitOutput(root, "rm", "-q", "design/canvas/only.md");
    writeAllowlist(root, canvasEntries.slice(0, 1));
    gitOutput(root, "commit", "-qm", "delete and drop entry");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 0, guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pull request that adds an unused entry fails base", () => {
  const { root, base } = canvasFixture();
  try {
    writeAllowlist(root, [
      ...canvasEntries,
      { path: "notes.md", rule: "dated-anecdote", match: date, reason: "unused" },
    ]);
    gitOutput(root, "commit", "-qm", "add entry");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(
      guard.stderr.includes(`unused allowlist: notes.md dated-anecdote ${date}`),
      guard.stderr,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("moving the only covered file out of the scope fails base on the unused entry and the moved finding", () => {
  const { root, base } = canvasFixture();
  try {
    mkdirSync(join(root, "docs"));
    gitOutput(root, "mv", "design/canvas/only.md", "docs/only.md");
    gitOutput(root, "commit", "-qm", "move");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(guard.stderr.includes(unusedDate), guard.stderr);
    assert.ok(guard.stderr.includes("docs/only.md:1: dated-anecdote"), guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a checker change that leaves an entry unused fails base", () => {
  const { root, base } = canvasFixture();
  try {
    const fixtureChecker = join(root, "tools/check-timeless.mjs");
    const full = readFileSync(fixtureChecker, "utf8");
    const withoutDateRule = full.replace('["dated-anecdote", date], ', "");
    assert.notEqual(withoutDateRule, full);
    writeFileSync(fixtureChecker, withoutDateRule);
    gitOutput(root, "commit", "-qam", "narrow");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(guard.stderr.includes(unusedDate), guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("staged and base read the allowlist at the state they scan, not in the working tree", () => {
  const { root, base } = canvasFixture();
  try {
    gitOutput(root, "rm", "-q", "design/canvas/only.md");
    writeFileSync(
      join(root, "tools/timeless-allowlist.json"),
      JSON.stringify(canvasEntries.slice(0, 1)),
    );
    const staged = run(root, ["--staged"]);
    assert.equal(staged.status, 1);
    assert.ok(staged.stderr.includes(unusedDate), staged.stderr);
    gitOutput(root, "commit", "-qm", "delete");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(guard.stderr.includes(unusedDate), guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an allowlist entry only in the working tree does not block a staged commit", () => {
  const { root } = canvasFixture();
  try {
    writeFileSync(
      join(root, "tools/timeless-allowlist.json"),
      JSON.stringify([
        ...canvasEntries,
        { path: "notes.md", rule: "dated-anecdote", match: date, reason: "draft" },
      ]),
    );
    writeFileSync(join(root, "notes.md"), `On ${date}.\n`);
    touchChecker(root);
    const staged = run(root, ["--staged"]);
    assert.equal(staged.status, 0, staged.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removing an allowlist entry that is still in use fails staged and base", () => {
  const { root, base } = canvasFixture();
  try {
    writeAllowlist(root, canvasEntries.slice(1));
    const staged = run(root, ["--staged"]);
    gitOutput(root, "commit", "-qm", "drop used entry");
    const guard = run(root, ["--base", base]);
    for (const result of [staged, guard]) {
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(ownerFinding("design/canvas/kept.md")), result.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a checker change that matches an unchanged file fails base", () => {
  const { root } = canvasFixture();
  try {
    writeFileSync(join(root, "notes.md"), "Released 2025/01/02.\n");
    gitOutput(root, "add", "notes.md");
    gitOutput(root, "commit", "-qm", "notes");
    const base = gitOutput(root, "rev-parse", "HEAD");
    const fixtureChecker = join(root, "tools/check-timeless.mjs");
    const hyphenOnly = readFileSync(fixtureChecker, "utf8");
    const slashToo = hyphenOnly.replace(
      "\\d{2}-(?:0[1-9]|1[0-2])-(",
      "\\d{2}[-/](?:0[1-9]|1[0-2])[-/](",
    );
    assert.notEqual(slashToo, hyphenOnly);
    writeFileSync(fixtureChecker, slashToo);
    gitOutput(root, "commit", "-qam", "widen");
    const guard = run(root, ["--base", base]);
    assert.equal(guard.status, 1);
    assert.ok(guard.stderr.includes("notes.md:1: dated-anecdote: 2025/01/02"), guard.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a gitlink does not shift the later files in staged, all and base", () => {
  const root = make("a.md");
  try {
    const base = gitOutput(root, "rev-parse", "HEAD");
    gitOutput(root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},b-sub`);
    mkdirSync(join(root, "b-sub"));
    writeFileSync(join(root, "z.md"), `Ask ${owner}.\n`);
    gitOutput(root, "add", "z.md");
    touchChecker(root);
    const results = [run(root, ["--staged"]), run(root, ["--all"])];
    gitOutput(root, "commit", "-qm", "gitlink");
    results.push(run(root, ["--base", base]));
    for (const result of results) {
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr.trim(), ownerFinding("z.md"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a path with a newline or a carriage return keeps its own content in staged, all and base", () => {
  const root = make("design/canvas/x.md", `On ${date}.\n`);
  try {
    writeFileSync(
      join(root, "tools/timeless-allowlist.json"),
      JSON.stringify(canvasEntries.slice(1)),
    );
    writeFileSync(join(root, "a\nb.md"), "clean\n");
    writeFileSync(join(root, "c\r"), `Ask ${owner}.\n`);
    gitOutput(root, "add", "-A");
    gitOutput(root, "commit", "-qm", "names");
    const base = gitOutput(root, "rev-parse", "HEAD");
    touchChecker(root);
    const results = [run(root, ["--staged"]), run(root, ["--all"])];
    gitOutput(root, "commit", "-qm", "checker");
    results.push(run(root, ["--base", base]));
    for (const result of results) {
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr.trim(), ownerFinding("c\r"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tracked symlink is scanned as its link text, never followed, in staged, all and base", () => {
  const root = make("design/canvas/kept.md", `Ask ${owner}.\n`);
  try {
    writeAllowlist(root, canvasEntries.slice(0, 1));
    gitOutput(root, "commit", "-qm", "allow");
    const base = gitOutput(root, "rev-parse", "HEAD");
    mkdirSync(join(root, "docs"));
    symlinkSync("../design/canvas/kept.md", join(root, "docs/link.md"));
    symlinkSync("design/canvas", join(root, "canvaslink"));
    symlinkSync(machine, join(root, "machine-link"));
    gitOutput(root, "add", "-A");
    const results = [run(root, ["--staged"])];
    touchChecker(root);
    results.push(run(root, ["--staged"]), run(root, ["--all"]));
    gitOutput(root, "commit", "-qm", "links");
    results.push(run(root, ["--base", base]));
    const linkFinding = `machine-link:1: machine-path: ${["/", "Users/"].join("")}`;
    for (const result of results) {
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr.trim(), linkFinding);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a long comment that gets shorter but stays over the limit fails staged and base", () => {
  const block = (count, tag) =>
    Array.from({ length: count }, (_, index) => `// ${tag} ${index}`).join("\n") + "\n";
  const root = make("src/a.js", `${block(12, "first")}const a = 1\n${block(12, "second")}`);
  try {
    writeAllowlist(root, [
      { path: "src/a.js", rule: "comment-length", match: "12 lines", reason: "reviewed" },
    ]);
    gitOutput(root, "commit", "-qm", "allow");
    const base = gitOutput(root, "rev-parse", "HEAD");
    writeFileSync(
      join(root, "src/a.js"),
      `${block(9, "first")}const a = 1\n${block(12, "second")}`,
    );
    gitOutput(root, "add", "src/a.js");
    const results = [run(root, ["--staged"])];
    gitOutput(root, "commit", "-qm", "shorten");
    results.push(run(root, ["--base", base]));
    for (const result of results) {
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes("src/a.js:1: comment-length: 9 lines"), result.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const landedEdit = (root, name, written, session = root, filePath = join(root, name)) => {
  writeFileSync(join(root, name), written);
  const tool_input = { file_path: filePath, old_string: "unrelated", new_string: "unrelated" };
  return run(
    session,
    ["--hook"],
    JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input,
      tool_response: {},
    }),
  );
};

test("a landed Edit is checked on the bytes in the file, not on its old_string and new_string", () => {
  const root = make("sample.md");
  try {
    const planted = landedEdit(root, "sample.md", `Ask ${owner}.\n`);
    assert.equal(planted.status, 2);
    assert.equal(planted.stderr.trim(), ownerFinding("sample.md"));
    writeFileSync(join(root, "sample.md"), "clean\n");
    const tool_input = {
      file_path: join(root, "sample.md"),
      old_string: "clean",
      new_string: `Ask ${owner}.`,
    };
    const claimed = run(
      root,
      ["--hook"],
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input,
        tool_response: {},
      }),
    );
    assert.equal(claimed.status, 0, claimed.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an Edit before it lands is not checked", () => {
  const root = make("sample.md");
  try {
    const tool_input = {
      file_path: join(root, "sample.md"),
      old_string: "clean",
      new_string: `Ask ${owner}.`,
    };
    const result = run(
      root,
      ["--hook"],
      JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input }),
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a landed Edit is judged against HEAD, as the staged check judges the file", () => {
  const root = make("sample.mjs", `// ${date}\nconst other = 1\n`);
  try {
    assert.equal(landedEdit(root, "sample.mjs", `const other = 2\n// ${date}\n`).status, 0);
    writeFileSync(join(root, "sample.md"), `Ask ${owner}.\n`);
    gitOutput(root, "add", "sample.md");
    const staged = landedEdit(root, "sample.md", `Ask ${owner}.\nmore\n`);
    assert.equal(staged.status, 2);
    assert.equal(staged.stderr.trim(), ownerFinding("sample.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a landed Edit in a CRLF checkout of an LF blob does not report a finding the blob already has", () => {
  const marker = ["ses", "sion"].join("");
  const root = make("Sample.cs", `/* ${marker}\n   abcdef1234 */\nvar x = 1;\n`);
  try {
    const result = landedEdit(
      root,
      "Sample.cs",
      `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 2;\r\n`,
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a landed Edit on a CRLF blob does not report a finding the blob already has", () => {
  const marker = ["ses", "sion"].join("");
  const root = make("Sample.cs");
  try {
    gitOutput(root, "config", "core.autocrlf", "false");
    writeFileSync(join(root, "Sample.cs"), `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 1;\r\n`);
    gitOutput(root, "add", "Sample.cs");
    gitOutput(root, "commit", "-qm", "crlf");
    assert.ok(gitOutput(root, "cat-file", "-p", "HEAD:Sample.cs").includes(`${marker}\r\n`));
    const result = landedEdit(
      root,
      "Sample.cs",
      `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 2;\r\n`,
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a hook judges a file of another repository against that repository's HEAD and allowlist, not through its checker", () => {
  const sessionRoot = make("sample.md"),
    otherRoot = make("kept.md", `Ask ${owner}.\n`);
  try {
    writeFileSync(join(otherRoot, "tools/check-timeless.mjs"), "process.exit(0)\n");
    writeFileSync(join(otherRoot, ".gitignore"), "local/\n");
    assert.equal(landedEdit(otherRoot, "kept.md", `Ask ${owner}.\nmore\n`, sessionRoot).status, 0);
    const planted = landedEdit(otherRoot, "sample.md", `Ask ${owner}.\n`, sessionRoot);
    assert.equal(planted.status, 2);
    assert.equal(planted.stderr.trim(), ownerFinding("sample.md"));
    const written = hook(sessionRoot, join(otherRoot, "new.md"), `Ask ${owner}.\n`);
    assert.equal(written.status, 2);
    assert.equal(written.stderr.trim(), ownerFinding("new.md"));
    mkdirSync(join(otherRoot, "local"));
    assert.equal(landedEdit(otherRoot, "local/notes.md", `Ask ${owner}.\n`, sessionRoot).status, 0);
    writeAllowlist(otherRoot, [
      { path: "sample.md", rule: "owner-name", match: owner, reason: "reviewed" },
    ]);
    assert.equal(landedEdit(otherRoot, "sample.md", `Ask ${owner}.\n`, sessionRoot).status, 0);
  } finally {
    rmSync(sessionRoot, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test("a mis-cased path is judged at the case the file system stores", (t) => {
  const root = make("README.md", `Ask ${owner}.\n`);
  try {
    const misCased = root.replace(/[^/\\]+$/, (name) => name.toUpperCase());
    if (!existsSync(join(misCased, "readme.md"))) {
      t.skip("the file system is case-sensitive");
      return;
    }
    const written = hook(root, join(misCased, "sample.md"), `Ask ${owner}.\n`);
    assert.equal(written.status, 2);
    assert.equal(written.stderr.trim(), ownerFinding("sample.md"));
    const landed = landedEdit(
      root,
      "sample.md",
      `Ask ${owner}.\n`,
      root,
      join(misCased, "sample.md"),
    );
    assert.equal(landed.status, 2);
    assert.equal(landed.stderr.trim(), ownerFinding("sample.md"));
    const kept = landedEdit(
      root,
      "README.md",
      `Ask ${owner}.\nmore\n`,
      root,
      join(root, "readme.md"),
    );
    assert.equal(kept.status, 0, kept.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a path git ignores, a path in no repository, or a path in a repository without the checker is not checked", () => {
  const root = make("sample.md");
  const outside = mkdtempSync(join(tmpdir(), "orbit-timeless-outside-"));
  try {
    writeFileSync(join(root, ".gitignore"), "local/\n");
    mkdirSync(join(root, "local"));
    assert.equal(hook(root, "local/new.md", `Ask ${owner}.\n`).status, 0);
    assert.equal(landedEdit(root, "local/notes.md", `Ask ${owner}.\n`).status, 0);
    writeFileSync(join(outside, "target.md"), "clean\n");
    symlinkSync(join(outside, "target.md"), join(root, "outside.md"));
    assert.equal(landedEdit(root, "outside.md", `Ask ${owner}.\n`).status, 0);
    gitOutput(outside, "init", "-q");
    assert.equal(landedEdit(root, "outside.md", `Ask ${owner}.\n`).status, 0);
    assert.equal(hook(root, join(outside, "new.md"), `Ask ${owner}.\n`).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("the settings check Write before it lands and Edit after it lands", () => {
  const settings = JSON.parse(readFileSync(join(project, ".claude/settings.json"), "utf8"));
  const matchers = (event) =>
    (settings.hooks[event] ?? [])
      .filter(({ hooks }) => hooks.some(({ command }) => command.includes("forbid-stale-text.mjs")))
      .map(({ matcher }) => matcher);
  assert.deepEqual(matchers("PreToolUse"), ["Write"]);
  assert.deepEqual(matchers("PostToolUse"), ["Edit|MultiEdit"]);
});
