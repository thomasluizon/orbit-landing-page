import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import noComments from "./eslint-rules/no-comments.cjs";

export default [
  { ignores: ["dist/", ".astro/", "node_modules/"] },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    rules: {
      "astro/no-exports-from-components": "off",
      "astro/no-prerender-export-outside-pages": "off",
      // WHY: preserve the configured rule set across the upgrade: https://github.com/ota-meshi/eslint-plugin-astro/blob/main/CHANGELOG.md
      "astro/valid-compile": "error",
    },
  },
  {
    files: ["**/*.{ts,mjs,astro}"],
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: { "local/no-comments": "error" },
  },
  {
    // WHY: guard scripts use their own checks: https://github.com/thomasluizon/orbit-ui-mobile/blob/main/REBUILD.md
    files: ["tools/**", ".claude/hooks/forbid-stale-text.mjs"],
    rules: { "local/no-comments": "off" },
  },
];
