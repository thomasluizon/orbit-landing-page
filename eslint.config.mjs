import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import noComments from "./eslint-rules/no-comments.cjs";

export default [
  { ignores: ["dist/", ".astro/", "node_modules/"] },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.{ts,mjs,astro}"],
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: { "local/no-comments": "error" },
  },
];
