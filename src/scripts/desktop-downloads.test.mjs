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

const googlePlayUrl = "https://play.google.com/store/apps/details?id=org.useorbit.app";

function landingPage(heroDataset = {}) {
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
  const node = (dataset = {}, href) => ({
    dataset,
    parentNode: parent,
    getAttribute: (name) => (name === "href" ? href : null),
    get nextSibling() {
      return children[children.indexOf(this) + 1] ?? null;
    },
  });
  children.push(
    node({ label: "Open Orbit" }, "https://app.useorbit.org"),
    node(
      {
        label: "Install on Android",
        downloadTarget: "android",
        analyticsEvent: "android_install_clicked",
        analyticsSurface: "footer",
      },
      googlePlayUrl,
    ),
  );
  const { desktopDownloads } = run("src/config/links.ts", { environment: {} });
  for (const { id, system, architecture, url } of desktopDownloads)
    children.push(
      node(
        {
          desktopDownload: id,
          desktopSystem: system,
          desktopArchitecture: architecture,
          analyticsEvent: "desktop_download_clicked",
          analyticsSurface: `footer_${system}_${architecture}`,
        },
        url,
      ),
    );
  children.push(
    node({ label: "iPhone waitlist", downloadTarget: "iphone", iosTrigger: "" }, "#ios"),
  );
  const labels = ["any", "mac", "mac-unreported", "windows", "android", "iphone"].map((system) => ({
    dataset: { heroDownloadLabel: system },
    hidden: system !== "any",
  }));
  const hero = {
    href: "#downloads",
    dataset: heroDataset,
    querySelectorAll(selector) {
      assert.equal(selector, "[data-hero-download-label]");
      return labels;
    },
  };
  return {
    querySelector(selector) {
      if (selector === "#hero-download") return hero;
      const [, name, value] = selector.match(/^\[data-([a-z-]+)="([^"]+)"\]$/) ?? [];
      const key = name?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      assert.ok(key === "desktopDownload" || key === "downloadTarget", selector);
      return children.find((child) => child.dataset[key] === value) ?? null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, "[data-desktop-download]");
      return children.filter((child) => child.dataset.desktopDownload);
    },
    order: () => children.map((child) => child.dataset.desktopDownload ?? child.dataset.label),
    hero: () => ({
      href: hero.href,
      label: labels.filter(({ hidden }) => !hidden).map(({ dataset }) => dataset.heroDownloadLabel),
      event: hero.dataset.analyticsEvent,
      surface: hero.dataset.analyticsSurface,
      iosTrigger: Object.hasOwn(hero.dataset, "iosTrigger"),
    }),
  };
}

async function load(navigator, heroDataset) {
  const root = landingPage(heroDataset);
  vm.runInNewContext(transpile("src/scripts/desktop-downloads.ts"), {
    exports: {},
    navigator,
    document: root,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return root;
}

const visit = async (navigator) => (await load(navigator)).order();
const hero = async (navigator, heroDataset) => (await load(navigator, heroDataset)).hero();

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

test("a touchscreen Windows laptop keeps the Windows lead", async () => {
  assert.deepEqual(
    await visit({ userAgent: userAgents.windows, maxTouchPoints: 10 }),
    around(["windows-x86", "windows-arm", "mac-arm", "mac-x86"]),
  );
});

for (const [system, architecture, expected] of [
  ["mac", "x86", ["mac-x86", "mac-arm", "windows-x86", "windows-arm"]],
  ["windows", "arm", ["windows-arm", "windows-x86", "mac-arm", "mac-x86"]],
  ["windows", "", ["windows-x86", "windows-arm", "mac-arm", "mac-x86"]],
]) {
  test(`client hints for a ${system} visitor on ${architecture || "an unreported"} architecture lead with the matching file`, async () => {
    const requested = [];
    const order = await visit({
      userAgent: userAgents[system],
      maxTouchPoints: 0,
      userAgentData: {
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
        getHighEntropyValues: () => Promise.reject(new Error()),
      },
    }),
    around(["windows-x86", "windows-arm", "mac-arm", "mac-x86"]),
  );
});

const heroSurfaces = {
  "mac-arm": "hero_mac_arm",
  "mac-x86": "hero_mac_x86",
  "windows-x86": "hero_windows_x86",
  "windows-arm": "hero_windows_arm",
};
const desktopHero = (id, label = id.split("-")[0]) => ({
  href: stableUrls[id],
  label: [label],
  event: "desktop_download_clicked",
  surface: heroSurfaces[id],
  iosTrigger: false,
});
const hints = (architecture) => ({
  getHighEntropyValues: async () => ({ architecture }),
});

for (const [name, navigator, expected] of [
  [
    "a Mac with no architecture hint",
    { userAgent: userAgents.mac, maxTouchPoints: 0 },
    desktopHero("mac-arm", "mac-unreported"),
  ],
  [
    "a Mac whose hint is empty",
    { userAgent: userAgents.mac, maxTouchPoints: 0, userAgentData: hints("") },
    desktopHero("mac-arm", "mac-unreported"),
  ],
  [
    "a Mac whose hint is rejected",
    {
      userAgent: userAgents.mac,
      maxTouchPoints: 0,
      userAgentData: { getHighEntropyValues: () => Promise.reject(new Error()) },
    },
    desktopHero("mac-arm", "mac-unreported"),
  ],
  [
    "an Apple silicon Mac that reports arm",
    { userAgent: userAgents.mac, maxTouchPoints: 0, userAgentData: hints("arm") },
    desktopHero("mac-arm"),
  ],
  [
    "an Intel Mac that reports x86",
    { userAgent: userAgents.mac, maxTouchPoints: 0, userAgentData: hints("x86") },
    desktopHero("mac-x86"),
  ],
  [
    "a Windows PC",
    { userAgent: userAgents.windows, maxTouchPoints: 0 },
    desktopHero("windows-x86"),
  ],
  [
    "a Windows on Arm PC",
    { userAgent: userAgents.windows, maxTouchPoints: 0, userAgentData: hints("arm") },
    desktopHero("windows-arm"),
  ],
  [
    "an Android phone",
    { userAgent: userAgents.android, maxTouchPoints: 5 },
    {
      href: googlePlayUrl,
      label: ["android"],
      event: "android_install_clicked",
      surface: "hero_android",
      iosTrigger: false,
    },
  ],
  [
    "an iPhone",
    { userAgent: userAgents.iphone, maxTouchPoints: 5 },
    { href: "#ios", label: ["iphone"], event: undefined, surface: undefined, iosTrigger: true },
  ],
  [
    "an iPad that reports a Mac user agent",
    { userAgent: userAgents.mac, maxTouchPoints: 5 },
    { href: "#ios", label: ["iphone"], event: undefined, surface: undefined, iosTrigger: true },
  ],
  [
    "an unknown system",
    { userAgent: userAgents.linux, maxTouchPoints: 0 },
    {
      href: "#downloads",
      label: ["any"],
      event: undefined,
      surface: undefined,
      iosTrigger: false,
    },
  ],
]) {
  test(`the hero download sends ${name} to its own file`, async () => {
    assert.deepEqual(await hero(navigator), expected);
  });
}

test("a hero that already carries the waitlist trigger loses it when it points at a file", async () => {
  const stale = { iosTrigger: "" };
  assert.deepEqual(
    await hero({ userAgent: userAgents.windows, maxTouchPoints: 0 }, stale),
    desktopHero("windows-x86"),
  );
  assert.deepEqual(stale.iosTrigger, undefined);
});
