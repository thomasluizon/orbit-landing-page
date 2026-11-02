import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import noComments from "./eslint-rules/no-comments.cjs";
import noConsole from "./eslint-rules/no-console.mjs";

export default [
  { ignores: ["dist/", ".astro/", "node_modules/"] },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    rules: {
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
    files: ["src/**/*.{ts,astro}"],
    plugins: { production: { rules: { "no-console": noConsole } } },
    rules: { "production/no-console": "error" },
  },
  {
    // WHY: guard scripts use their own checks: https://github.com/thomasluizon/orbit-ui-mobile/blob/main/REBUILD.md
    files: ["tools/**", ".claude/hooks/forbid-stale-text.mjs"],
    rules: { "local/no-comments": "off" },
  },
];
