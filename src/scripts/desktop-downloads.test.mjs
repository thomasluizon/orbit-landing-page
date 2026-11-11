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

function landingPage() {
  const children = [];
  const list = {
    prepend(...entries) {
      const rest = children.filter((child) => !entries.includes(child));
      children.splice(0, children.length, ...entries, ...rest);
    },
  };
  const node = (dataset = {}, href) => ({
    dataset,
    parentElement: list,
    getAttribute: (name) => (name === "href" ? href : null),
  });
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
    node(
      {
        label: "Install on Android",
        downloadTarget: "android",
        analyticsEvent: "android_install_clicked",
        analyticsSurface: "footer",
      },
      googlePlayUrl,
    ),
    node({ label: "iPhone waitlist", downloadTarget: "iphone", iosTrigger: "" }, "#ios"),
  );
  const labels = ["any", "mac", "mac-unreported", "windows", "android", "iphone"].map((system) => ({
    dataset: { heroDownloadLabel: system },
    hidden: system !== "any",
  }));
  const hero = {
    href: "#downloads",
    dataset: {},
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
      const [, system] = selector.match(/^\[data-desktop-system="([^"]+)"\]$/) ?? [];
      assert.ok(system, selector);
      return children.filter((child) => child.dataset.desktopSystem === system);
    },
    order: () => children.map(({ dataset }) => dataset.desktopDownload ?? dataset.downloadTarget),
    hero: () => ({
      href: hero.href,
      label: labels.filter(({ hidden }) => !hidden).map(({ dataset }) => dataset.heroDownloadLabel),
      event: hero.dataset.analyticsEvent,
      surface: hero.dataset.analyticsSurface,
      iosTrigger: Object.hasOwn(hero.dataset, "iosTrigger"),
    }),
  };
}

async function load(navigator) {
  const root = landingPage();
  vm.runInNewContext(transpile("src/scripts/desktop-downloads.ts"), {
    exports: {},
    navigator,
    document: root,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return root;
}

const hero = async (navigator) => (await load(navigator)).hero();

test("every desktop download points at its exact stable production release asset", () => {
  const { desktopDownloads } = run("src/config/links.ts", { environment: {} });
  assert.deepEqual(
    Object.fromEntries(desktopDownloads.map(({ id, url }) => [id, url])),
    stableUrls,
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
    {
      href: "#ios",
      label: ["iphone"],
      event: undefined,
      surface: undefined,
      iosTrigger: true,
    },
  ],
  [
    "an iPad that reports a Mac user agent",
    { userAgent: userAgents.mac, maxTouchPoints: 5 },
    {
      href: "#ios",
      label: ["iphone"],
      event: undefined,
      surface: undefined,
      iosTrigger: true,
    },
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

const listed = ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"];

for (const [name, navigator, expected] of [
  [
    "a Mac with no architecture hint",
    { userAgent: userAgents.mac, maxTouchPoints: 0 },
    ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"],
  ],
  [
    "an Apple silicon Mac that reports arm",
    { userAgent: userAgents.mac, maxTouchPoints: 0, userAgentData: hints("arm") },
    ["mac-arm", "mac-x86", "windows-x86", "windows-arm", "android", "iphone"],
  ],
  [
    "an Intel Mac that reports x86",
    { userAgent: userAgents.mac, maxTouchPoints: 0, userAgentData: hints("x86") },
    ["mac-x86", "mac-arm", "windows-x86", "windows-arm", "android", "iphone"],
  ],
  [
    "a Windows PC",
    { userAgent: userAgents.windows, maxTouchPoints: 0 },
    ["windows-x86", "windows-arm", "mac-arm", "mac-x86", "android", "iphone"],
  ],
  [
    "a Windows on Arm PC",
    { userAgent: userAgents.windows, maxTouchPoints: 0, userAgentData: hints("arm") },
    ["windows-arm", "windows-x86", "mac-arm", "mac-x86", "android", "iphone"],
  ],
  [
    "an Android phone",
    { userAgent: userAgents.android, maxTouchPoints: 5 },
    ["android", "mac-arm", "mac-x86", "windows-x86", "windows-arm", "iphone"],
  ],
  [
    "an iPhone",
    { userAgent: userAgents.iphone, maxTouchPoints: 5 },
    ["iphone", "mac-arm", "mac-x86", "windows-x86", "windows-arm", "android"],
  ],
  ["an unknown system", { userAgent: userAgents.linux, maxTouchPoints: 0 }, listed],
]) {
  test(`the downloads list leads with the platform of ${name} before the panel opens`, async () => {
    assert.deepEqual(landingPage().order(), listed);
    assert.deepEqual((await load(navigator)).order(), expected);
  });
}

test("the downloads list leads with the visitor's system at startup, before an architecture hint arrives", () => {
  const root = landingPage();
  vm.runInNewContext(transpile("src/scripts/desktop-downloads.ts"), {
    exports: {},
    navigator: { userAgent: userAgents.windows, maxTouchPoints: 0, userAgentData: hints("arm") },
    document: root,
  });
  assert.deepEqual(root.order().slice(0, 2), ["windows-x86", "windows-arm"]);
});
