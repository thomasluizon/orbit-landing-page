import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const release =
  "https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-production";
const stableUrls = {
  "mac-arm": `${release}/orbit-aarch64-apple-darwin.dmg`,
  "mac-x86": `${release}/orbit-x86_64-apple-darwin.dmg`,
  "windows-x86": `${release}/orbit-x86_64-pc-windows-msvc.exe`,
  "windows-arm": `${release}/orbit-aarch64-pc-windows-msvc.exe`,
};
const userAgents = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1",
};

const transpile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env", "environment"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

function run(path, context) {
  const exports = {};
  vm.runInNewContext(transpile(path), { ...context, exports });
  return exports;
}

function footerList() {
  const children = [];
  const parent = {
    children,
    insertBefore(node, reference) {
      const current = children.indexOf(node);
      if (current !== -1) children.splice(current, 1);
      const index = reference ? children.indexOf(reference) : children.length;
      children.splice(index, 0, node);
    },
  };
  const node = (dataset = {}) => ({
    dataset,
    parentNode: parent,
    get nextSibling() {
      return children[children.indexOf(this) + 1] ?? null;
    },
  });
  children.push(node({ label: "Open Orbit" }), node({ label: "Install on Android" }));
  for (const id of Object.keys(stableUrls)) children.push(node({ desktopDownload: id }));
  children.push(node({ label: "iPhone waitlist" }));
  return {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-desktop-download]");
      return children.filter((child) => child.dataset.desktopDownload);
    },
    order: () => children.map((child) => child.dataset.desktopDownload ?? child.dataset.label),
  };
}

async function visit(navigator) {
  const root = footerList();
  const links = run("src/config/links.ts", { environment: {} });
  vm.runInNewContext(transpile("src/scripts/desktop-downloads.ts"), {
    exports: {},
    navigator,
    document: root,
    require: (path) => {
      assert.equal(path, "../config/links");
      return links;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return root.order();
}

const around = (downloads) => ["Open Orbit", "Install on Android", ...downloads, "iPhone waitlist"];

test("every desktop download points at its exact stable production release asset", () => {
  const { desktopDownloads } = run("src/config/links.ts", { environment: {} });
  assert.deepEqual(
    Object.fromEntries(desktopDownloads.map(({ id, url }) => [id, url])),
    stableUrls,
  );
});

test("a Mac visitor sees the Apple silicon file first and keeps every other file", async () => {
  assert.deepEqual(
    await visit({ userAgent: userAgents.mac, maxTouchPoints: 0 }),
    around(["mac-arm", "mac-x86", "windows-x86", "windows-arm"]),
  );
});

test("a Windows visitor sees the x64 installer first and keeps both Mac files", async () => {
  assert.deepEqual(
    await visit({ userAgent: userAgents.windows, maxTouchPoints: 0 }),
    around(["windows-x86", "windows-arm", "mac-arm", "mac-x86"]),
  );
});

for (const name of ["linux", "android", "iphone"]) {
  test(`an unknown or mobile visitor (${name}) keeps the rendered order`, async () => {
    assert.deepEqual(
      await visit({ userAgent: userAgents[name], maxTouchPoints: name === "linux" ? 0 : 5 }),
      around(["mac-arm", "mac-x86", "windows-x86", "windows-arm"]),
    );
  });
}

test("an iPad that reports a Mac user agent is not treated as a Mac", async () => {
  const order = await visit({ userAgent: userAgents.mac, maxTouchPoints: 5 });
  assert.deepEqual(order, around(["mac-arm", "mac-x86", "windows-x86", "windows-arm"]));
});

for (const [platform, architecture, expected] of [
  ["macOS", "x86", ["mac-x86", "mac-arm", "windows-x86", "windows-arm"]],
  ["Windows", "arm", ["windows-arm", "windows-x86", "mac-arm", "mac-x86"]],
  ["Windows", "", ["windows-x86", "windows-arm", "mac-arm", "mac-x86"]],
]) {
  test(`client hints for ${platform} on ${architecture || "an unreported"} architecture lead with the matching file`, async () => {
    const requested = [];
    const order = await visit({
      userAgent: platform === "macOS" ? userAgents.mac : userAgents.windows,
      maxTouchPoints: 0,
      userAgentData: {
        platform,
        getHighEntropyValues: async (hints) => {
          requested.push(...hints);
          return { architecture };
        },
      },
    });
    assert.deepEqual(requested, ["architecture"]);
    assert.deepEqual(order, around(expected));
  });
}

test("a rejected client hints request keeps the system lead", async () => {
  assert.deepEqual(
    await visit({
      userAgent: userAgents.windows,
      maxTouchPoints: 0,
      userAgentData: {
        platform: "Windows",
        getHighEntropyValues: () => Promise.reject(new Error()),
      },
    }),
    around(["windows-x86", "windows-arm", "mac-arm", "mac-x86"]),
  );
});
