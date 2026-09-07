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

// https://astro.build/config
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
    plugins: [tailwindcss()],
  },
});
