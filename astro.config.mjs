// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://useorbit.org",
  integrations: [
    sitemap({
      filter(page) {
        const pathname = new URL(page).pathname;
        const outputPath = pathname.endsWith("/") ? `${pathname}index.html` : `${pathname}.html`;
        const pageHtml = readFileSync(new URL(`./dist${outputPath}`, import.meta.url), "utf8");

        return !/<meta name="robots" content="[^"]*\bnoindex\b[^"]*">/i.test(pageHtml);
      },
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Rubik",
      cssVariable: "--font-rubik",
      weights: [400, 500, 600],
      styles: ["normal"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: [700],
      styles: ["normal"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Roboto",
      cssVariable: "--font-roboto",
      weights: [400, 500],
      styles: ["normal"],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
