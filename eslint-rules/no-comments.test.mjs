import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import noComments from "./no-comments.cjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const astroLanguage = eslintPluginAstro.configs.recommended.find(
  ({ name }) => name === "astro/base",
).languageOptions;
const typescript = (code) => ({ code, filename: "sample.ts" });
const module = (code) => ({ code, filename: "sample.mjs" });
const commonJs = (code) => ({ code, filename: "sample.cjs" });
const astro = (code) => ({ code, filename: "Sample.astro", languageOptions: astroLanguage });
const rejected = (testCase, output) => ({
  ...testCase,
  output,
  errors: [{ messageId: "noComment" }],
});

const exportedForms = [
  "/** Doc. */\nexport function load() {}\n",
  "/** Doc. */\nexport const limit = 1;\n",
  "/** Doc. */\nexport class Store {}\n",
  "/** Doc. */\nexport interface Options {}\n",
  "/** Doc. */\nexport type Mode = 'on' | 'off';\n",
  "/** Doc. */\nexport enum Level {}\n",
  "/** Doc. */\nexport default function () {}\n",
  "/** Doc. */\nexport default class {}\n",
  "/** Doc. */\nexport default { limit: 1 };\n",
  "/** Doc. */\nexport { load } from './load';\n",
  "/** Doc. */\nexport * from './load';\n",
  "export /** Doc. */ const limit = 1;\n",
  "/** Doc. */\nfunction load() {}\nexport { load };\n",
  "/** Doc. */\nconst limit = 1;\nexport { limit as ceiling };\n",
  "/** Doc. */\nconst limit = 1;\nexport default limit;\n",
  "/** Doc. */\nclass Store {}\nexport default Store;\n",
  "/** Doc. */\ninterface Options {}\nexport type { Options };\n",
].map(typescript);

const commonJsForms = [
  "/** Doc. */\nmodule.exports = {};\n",
  "/** Doc. */\nexports.load = () => {};\n",
  "/** Doc. */\nmodule.exports.load = () => {};\n",
  "/** Doc. */\nfunction load() {}\nmodule.exports = { load };\n",
  "/** Doc. */\nfunction load() {}\nmodule.exports = load;\n",
  "/** Doc. */\nfunction load() {}\nexports.load = load;\n",
  "module.exports = {\n  /** Doc. */\n  meta: {},\n};\n",
].map(commonJs);

const exportedMembers = [
  "export class Store {\n  /** Doc. */\n  size = 0;\n  /** Doc. */\n  read() {}\n}\n",
  "export interface Options {\n  /** Doc. */\n  limit: number;\n  /** Doc. */\n  read(): void;\n}\n",
  "export type Options = {\n  /** Doc. */\n  limit: number;\n};\n",
  "export type Options = Readonly<{\n  /** Doc. */\n  limit: number;\n}>;\n",
  "export enum Level {\n  /** Doc. */\n  Low,\n}\n",
  "export const options = {\n  /** Doc. */\n  limit: 1,\n};\n",
  "export const options = {\n  nested: {\n    /** Doc. */\n    limit: 1,\n  },\n} as const;\n",
  "export default {\n  /** Doc. */\n  limit: 1,\n};\n",
  "class Store {\n  /** Doc. */\n  read() {}\n}\nexport { Store };\n",
  "const options = {\n  /** Doc. */\n  limit: 1,\n};\nexport default options;\n",
].map(typescript);

const astroProps = [
  "---\n/** Doc. */\ninterface Props {\n  /** Doc. */\n  title: string;\n}\n---\n<p>ready</p>\n",
  "---\n/** Doc. */\ntype Props = {\n  /** Doc. */\n  title: string;\n};\n---\n<p>ready</p>\n",
].map(astro);

const upstreamLinks = [
  "/** Mirrors https://github.com/eslint/eslint/issues/1 */\nfunction load() {}\n",
  "function load() {\n  /** See https://example.com/doc */\n  const limit = 1;\n  return limit;\n}\n",
  "// WHY: https://example.com/doc\nconst limit = 1;\n",
].map(typescript);

const typeAnnotations = [
  "/** @type {number} */\nlet count = 0;\n",
  "/** @typedef {{ limit: number }} Options */\n",
  "/** @satisfies {Record<string, number>} */\nconst limits = { low: 1 };\n",
  "/**\n * @template T\n * @param {T} value\n * @returns {T}\n */\nfunction same(value) {\n  return value;\n}\n",
  '/** @import { Options } from "./options" */\n',
  "/** @param {string} name */\nfunction load(name) {}\n",
  "/** @returns {number} */\nfunction count() {\n  return 1;\n}\n",
  "function load() {\n  /** @type {string[]} */\n  const names = [];\n  return names;\n}\n",
].map(module);

const directives = [
  "/** @jsx h */\nconst limit = 1;\n",
  "/** @jsxImportSource preact */\nconst limit = 1;\n",
  "/** @vitest-environment jsdom */\nconst limit = 1;\n",
  "/** @license MIT */\nconst limit = 1;\n",
  "/** @preserve */\nconst limit = 1;\n",
  "/** @ts-ignore */\nconst limit = 1;\n",
  "/* eslint-disable no-undef */\nload();\n/* eslint-enable no-undef */\n",
  "// eslint-disable-next-line no-undef\nload();\n",
  "load(); // eslint-disable-line no-undef\n",
  "/* global load */\nload();\n",
  "/* globals load */\nload();\n",
  "/* exported load */\nfunction load() {}\n",
  "// @ts-expect-error\nconst limit: string = 1;\n",
  "// ts-check\nconst limit = 1;\n",
  "// prettier-ignore\nconst limit = 1;\n",
  "/* c8 ignore next */\nconst limit = 1;\n",
  "/* v8 ignore next */\nconst limit = 1;\n",
  "/* istanbul ignore next */\nconst limit = 1;\n",
  'const load = () => import(/* webpackChunkName: "load" */ "./load");\n',
  'const load = () => import(/* @vite-ignore */ "./load");\n',
  "const store = /* @__PURE__ */ create();\n",
  "const store = /* #__PURE__ */ create();\n",
  '/// <reference types="astro/client" />\n',
].map(typescript);

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run(
  "local/no-comments",
  noComments,
  {
    valid: [
      ...exportedForms,
      ...commonJsForms,
      ...exportedMembers,
      ...astroProps,
      ...upstreamLinks,
      ...typeAnnotations,
      ...directives,
    ],
    invalid: [
      rejected(typescript("/** Doc. */\nfunction load() {}\n"), "function load() {}\n"),
      rejected(typescript("/** Doc. */\nconst limit = 1;\n"), "const limit = 1;\n"),
      rejected(typescript("/** Doc. */\nclass Store {}\n"), "class Store {}\n"),
      rejected(typescript("/** Doc. */\ntype Mode = 'on';\n"), "type Mode = 'on';\n"),
      rejected(typescript("/** Doc. */\ninterface Options {}\n"), "interface Options {}\n"),
      rejected(
        typescript(
          "export function load() {\n  /** Doc. */\n  const limit = 1;\n  return limit;\n}\n",
        ),
        "export function load() {\n  const limit = 1;\n  return limit;\n}\n",
      ),
      rejected(
        typescript("class Store {\n  /** Doc. */\n  read() {}\n}\n"),
        "class Store {\n  read() {}\n}\n",
      ),
      rejected(
        typescript("const options = {\n  /** Doc. */\n  limit: 1,\n};\n"),
        "const options = {\n  limit: 1,\n};\n",
      ),
      rejected(
        typescript("export default defineConfig({\n  /** Doc. */\n  limit: 1,\n});\n"),
        "export default defineConfig({\n  limit: 1,\n});\n",
      ),
      rejected(
        typescript("export class Store {\n  read() {\n    /** Doc. */\n    return 1;\n  }\n}\n"),
        "export class Store {\n  read() {\n    return 1;\n  }\n}\n",
      ),
      rejected(
        typescript("/** Doc. */\nimport { load } from './load';\nexport { load };\n"),
        "import { load } from './load';\nexport { load };\n",
      ),
      rejected(typescript("export const limit = 1;\n/** Doc. */\n"), "export const limit = 1;\n"),
      rejected(typescript("/** @type {number} */\nlet count = 0;\n"), "let count = 0;\n"),
      rejected(
        module("/** @param name The name. */\nfunction load(name) {}\n"),
        "function load(name) {}\n",
      ),
      rejected(
        commonJs("/** Doc. */\nfunction load() {}\nmodule.exports = {};\n"),
        "function load() {}\nmodule.exports = {};\n",
      ),
      rejected(
        astro("---\n/** Doc. */\ninterface Options {\n  title: string;\n}\n---\n<p>ready</p>\n"),
        "---\ninterface Options {\n  title: string;\n}\n---\n<p>ready</p>\n",
      ),
      rejected(typescript("// Note.\nexport const limit = 1;\n"), "export const limit = 1;\n"),
      rejected(typescript("/* Note. */\nexport const limit = 1;\n"), "export const limit = 1;\n"),
    ],
  },
);
