// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";

import tailwindcss from "@tailwindcss/vite";

const metaTagPattern = /<meta\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const htmlAttributePattern = /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** @param {string} pageHtml */
export function hasNoindexRobotsMeta(pageHtml) {
  return [...pageHtml.matchAll(metaTagPattern)].some(([metaTag]) => {
    const attributes = new Map(
      [...metaTag.matchAll(htmlAttributePattern)].map((match) => [
        match[1].toLowerCase(),
        match[2] ?? match[3] ?? match[4] ?? "",
      ]),
    );

    return (
      attributes.get("name")?.toLowerCase() === "robots" &&
      /(?:^|[,\s])noindex(?:$|[,\s])/i.test(attributes.get("content") ?? "")
    );
  });
}

/** @type {import("vite").Rolldown.OutputBundle} */
let clientBundle = {};

/** @param {string} fileName @param {Set<string>} graph */
function staticGraph(fileName, graph = new Set()) {
  const chunk = clientBundle[fileName];
  if (graph.has(fileName) || chunk?.type !== "chunk") return graph;
  graph.add(fileName);
  for (const imported of chunk.imports) staticGraph(imported, graph);
  return graph;
}

/** @param {string} fileName */
function waitsForStyles(fileName) {
  return [...staticGraph(fileName)].some((file) => {
    const chunk = clientBundle[file];
    return chunk.type === "chunk" && (chunk.viteMetadata?.importedCss.size ?? 0) > 0;
  });
}

/**
 * Keeps only the preloads that start a request: the importer's static graph is already loaded,
 * and `import()` requests its own chunk in the same task unless it first waits for a stylesheet.
 * @type {import("vite").ResolveModulePreloadDependenciesFn}
 */
function preloadDependencies(fileName, dependencies, { hostId }) {
  const loaded = staticGraph(hostId);
  return dependencies.filter(
    (dependency) =>
      !loaded.has(dependency) && (dependency !== fileName || waitsForStyles(fileName)),
  );
}

/**
 * Astro replaces `build.modulePreload` in its build config, so the option is set from a plugin.
 * @type {import("vite").Plugin}
 */
const preloadPlugin = {
  name: "orbit:preload-dependencies",
  config: () => ({ build: { modulePreload: { resolveDependencies: preloadDependencies } } }),
  generateBundle: {
    order: "pre",
    handler(_options, bundle) {
      clientBundle = bundle;
    },
  },
};

export default defineConfig({
  site: "https://useorbit.org",
  integrations: [
    sitemap({
      filter(page) {
        const pathname = new URL(page).pathname;
        const outputPath = pathname.endsWith("/") ? `${pathname}index.html` : `${pathname}.html`;
        const pageHtml = readFileSync(new URL(`./dist${outputPath}`, import.meta.url), "utf8");

        return !hasNoindexRobotsMeta(pageHtml);
      },
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Geist",
      cssVariable: "--font-geist",
      weights: [400, 500, 600],
      styles: ["normal"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Space Grotesk",
      cssVariable: "--font-space-grotesk",
      weights: [500, 600],
      styles: ["normal"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Geist Mono",
      cssVariable: "--font-geist-mono",
      weights: [400, 500],
      styles: ["normal"],
      fallbacks: ["ui-monospace", "monospace"],
    },
  ],
  vite: {
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss(), preloadPlugin],
  },
});
