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
const jsx = (code) => ({ code, filename: "sample.tsx" });
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
  "/** Doc. */\nexport async function load() {}\n",
  "/** Doc. */\nexport const limit = 1;\n",
  "/** Doc. */\nexport class Store {}\n",
  "/** Doc. */\nexport abstract class Store {}\n",
  "/** Doc. */\nexport interface Options {}\n",
  "/** Doc. */\nexport type Mode = 'on' | 'off';\n",
  "/** Doc. */\nexport enum Level {}\n",
  "/** Doc. */\nexport declare function load(): void;\n",
  "/** Doc. */\nexport default function () {}\n",
  "/** Doc. */\nexport default class {}\n",
  "/** Doc. */\nexport default { limit: 1 };\n",
  "/** Doc. */\nexport { load } from './load';\n",
  "/** Doc. */\nexport * from './load';\n",
  "export /** Doc. */ const limit = 1;\n",
  "/** Doc. */\nfunction load() {}\nexport { load };\n",
  "/** Doc. */\nconst limit = 1;\nexport { limit as ceiling };\n",
  "/** Doc. */\nconst first = 1, limit = 2;\nexport { limit };\n",
  "/** Doc. */\nconst { limit } = settings;\nexport { limit };\n",
  "/** Doc. */\nconst limit = 1;\nexport default limit;\n",
  "/** Doc. */\nfunction load() {}\nexport default { load };\n",
  "/** Doc. */\nclass Store {}\nexport default Store;\n",
  "/** Doc. */\ninterface Options {}\nexport type { Options };\n",
  "/** Doc. */\ntype Mode = 'on';\nexport type { Mode };\n",
  "/** Doc. */\nenum Level { Low }\nexport { Level };\n",
  "/** Doc. */\nfunction load(): void;\nfunction load() {}\nexport { load };\n",
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
  "export class Store {\n  /** Doc. */\n  private static async read() {}\n}\n",
  "export abstract class Store {\n  /** Doc. */\n  abstract read(): void;\n}\n",
  "export default class {\n  /** Doc. */\n  read() {}\n}\n",
  "export interface Options {\n  /** Doc. */\n  limit: number;\n  /** Doc. */\n  read(): void;\n}\n",
  "export interface Options {\n  /** Doc. */\n  [key: string]: number;\n}\n",
  "export type Options = {\n  /** Doc. */\n  limit: number;\n};\n",
  "export type Options = {\n  nested: {\n    /** Doc. */\n    limit: number;\n  };\n};\n",
  "export type Options = Readonly<{\n  /** Doc. */\n  limit: number;\n}>;\n",
  "export enum Level {\n  /** Doc. */\n  Low,\n}\n",
  "export const options = {\n  /** Doc. */\n  limit: 1,\n};\n",
  "export const options = {\n  /** Doc. */\n  read() {},\n};\n",
  "export const options = {\n  nested: {\n    /** Doc. */\n    limit: 1,\n  },\n} as const;\n",
  "export default {\n  /** Doc. */\n  limit: 1,\n};\n",
  "class Store {\n  /** Doc. */\n  read() {}\n}\nexport { Store };\n",
  "class Store {\n  /** Doc. */\n  read() {}\n}\nexport default Store;\n",
  "interface Options {\n  /** Doc. */\n  limit: number;\n}\nexport type { Options };\n",
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
  "function load(value) {\n  return /** @type {string} */ (value);\n}\n",
].flatMap((code) =>
  ["sample.js", "sample.jsx", "sample.mjs", "sample.cjs"].map((filename) => ({ code, filename })),
);

const directives = [
  "/** @jsx h */\nconst limit = 1;\n",
  "/** @jsxImportSource preact */\nconst limit = 1;\n",
  "/** @vitest-environment jsdom */\nconst limit = 1;\n",
  "/** @license MIT */\nconst limit = 1;\n",
  "/**\n * @vitest-environment jsdom\n */\nconst limit = 1;\n",
  "/**\n * @license MIT\n */\nimport { a } from './a';\nexport const b = a;\n",
  "/** @preserve */\nconst limit = 1;\n",
  "/** @ts-ignore */\nconst limit = 1;\n",
  "/* eslint-disable no-undef */\nload();\n/* eslint-enable no-undef */\n",
  "// eslint-disable-next-line no-undef\nload();\n",
  "load(); // eslint-disable-line no-undef\n",
  "/* global load */\nload();\n",
  "/* globals load */\nload();\n",
  "/* exported load */\nfunction load() {}\n",
  "// @ts-expect-error\nconst limit: string = 1;\n",
  "// @ts-check\nconst limit = 1;\n",
  "// prettier-ignore\nconst limit = 1;\n",
  "/* c8 ignore next */\nconst limit = 1;\n",
  "/* v8 ignore next */\nconst limit = 1;\n",
  "/* istanbul ignore next */\nconst limit = 1;\n",
  'const load = () => import(/* webpackChunkName: "load" */ "./load");\n',
  'const load = () => import(/* @vite-ignore */ "./load");\n',
  "const store = /* @__PURE__ */ create();\n",
  "const store = /* #__PURE__ */ create();\n",
  '/// <reference types="astro/client" />\n',
  "/*\n * @license MIT\n */\nimport { a } from './a';\nexport const b = a;\n",
  "/*\n * @preserve\n */\nconst limit = 1;\n",
  "// @license MIT\nconst limit = 1;\n",
  "/*\n  eslint-disable no-undef\n*/\nload();\n",
  "/* eslint-disable-next-line no-undef */\nload();\n",
  "/* global load -- browser global */\nload();\n",
  "// @ts-nocheck\nconst limit = 1;\n",
  "/* @ts-ignore */\nconst limit: string = 1;\n",
  "/*\n * @ts-expect-error */\nconst limit: string = 1;\n",
  "/* @jsx h */\nconst limit = 1;\n",
  "/**\n * @jsxImportSource preact\n */\nconst limit = 1;\n",
  "/* prettier-ignore */\nconst limit = 1;\n",
  "/** v8 ignore next */\nconst limit = 1;\n",
  "// istanbul ignore next\nconst limit = 1;\n",
  "/**\n * v8 ignore start\n */\nconst limit = 1;\n/* v8 ignore stop */\n",
  'const load = () =>\n  import(\n    // webpackChunkName: "load"\n    "./load"\n  );\n',
  "const store = // @__PURE__\n  create();\n",
  "// @vitest-environment jsdom\nconst limit = 1;\n",
  "/*\n * @vitest-environment jsdom\n */\nconst limit = 1;\n",
  '/* eslint no-undef: "off" */\nload();\n',
  "/*\n * @license MIT\n */\nconst limit = 1;\n",
  "/**\r\n * @vitest-environment jsdom\r\n */\r\nconst limit = 1;\r\n",
  "function load() {\n\t/**\n\t * @license MIT\n\t */\n\treturn 1;\n}\n",
  "/**\n ** @preserve\n */\nconst limit = 1;\n",
  "/* @license MIT */\nconst limit = 1;\n",
  "/* @preserve */\nconst limit = 1;\n",
  '/// <reference types="node" />\n',
  "/**\n * Runs in a DOM.\n * @vitest-environment jsdom\n */\nconst limit = 1;\n",
  "// Runs in a DOM. @vitest-environment jsdom\nconst limit = 1;\n",
  '/** \u0040vitest-environment-options { "pretendToBeVisual": true } */\nconst limit = 1;\n',
  "// \u0040jest-environment jsdom\nconst limit = 1;\n",
  "/** \u0040jest-environment jsdom */\nconst limit = 1;\n",
  '/** \u0040jest-environment-options { "pretendToBeVisual": true } */\nconst limit = 1;\n',
  "// node:coverage ignore next\nconst limit = 1;\n",
  "/* node:coverage ignore else */\nconst limit = 1;\n",
  "/** node:coverage ignore file */\nconst limit = 1;\n",
  "/* node:coverage ignore start */\nconst limit = 1;\n/* node:coverage ignore stop */\n",
  "// node:coverage ignore start\nconst limit = 1;\n// node:coverage ignore stop\n",
  "/**\n * The fallback never runs in a test.\n * v8 ignore start\n */\nconst limit = 1;\n/* v8 ignore stop */\n",
  "// The fallback never runs in a test. c8 ignore start\nconst limit = 1;\n// c8 ignore stop\n",
  "// \u0040module-tag slow\nconst limit = 1;\n",
  "/** \u0040module-tag slow */\nconst limit = 1;\n",
  "/**\n * Slow suite.\n * \u0040module-tag slow\n */\nconst limit = 1;\n",
  "const store = /** @__PURE__ */ create();\n",
  "const store = /* Built once. @__PURE__ */ create();\n",
  "const value = /* @__INLINE__ */ compute();\n",
  "const value = /* #__NOINLINE__ */ compute();\n",
  'const key = /* @__KEY__ */ "name";\n',
  'const value = target[/* @__MANGLE_PROP__ */ "name"];\n',
  "/* @__NO_SIDE_EFFECTS__ */\nfunction load() {}\n",
  "/* #__NO_SIDE_EFFECTS__ */\nfunction load() {}\n",
  "// @__NO_SIDE_EFFECTS__\nfunction load() {}\n",
  "/** @__NO_SIDE_EFFECTS__ */\nfunction load() {}\n",
  "/*\n * @__NO_SIDE_EFFECTS__\n */\nfunction load() {}\n",
  "/**\n * The type is wrong upstream.\n * @ts-ignore */\nconst limit: string = 1;\n",
  "/* The type is wrong upstream.\n @ts-expect-error */\nconst limit: string = 1;\n",
].map(typescript);

const shebang = module("#!/usr/bin/env node\nconst limit = 1;\n");

const ignoredByTool = [
  ["// global state for the menu.\nconst menu = {};\n", "const menu = {};\n"],
  ["// exported for the tests.\nconst menu = {};\n", "const menu = {};\n"],
  ["// webpack bundles this file.\nconst menu = {};\n", "const menu = {};\n"],
  ["/**\n * global state for the menu.\n */\nconst menu = {};\n", "const menu = {};\n"],
  ["/**\n * exported for the tests.\n */\nconst menu = {};\n", "const menu = {};\n"],
  ["/**\n * webpack bundles this file.\n */\nconst menu = {};\n", "const menu = {};\n"],
  ["// global load\nload();\n", "load();\n"],
  ["/** global load */\nload();\n", "load();\n"],
  ["// eslint-disable no-undef\nload();\n", "load();\n"],
  ["/** eslint-disable no-undef */\nload();\n", "load();\n"],
  ["/**\n * eslint-disable\n */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/*\n * eslint-disable\n */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["// ts-check\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/** @ts-check */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/**\n * @ts-ignore\n */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["// @jsx h\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/// narration\nconst limit = 1;\n", "const limit = 1;\n"],
  ["// prettier-ignore because the table aligns\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/** prettier-ignore */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/* v8 is the engine. */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["// istanbul covers this file.\nconst limit = 1;\n", "const limit = 1;\n"],
  [
    'const load = () => import(/** webpackChunkName: "load" */ "./load");\n',
    'const load = () => import( "./load");\n',
  ],
  [
    "const load = (path) => import(/** @vite-ignore */ path);\n",
    "const load = (path) => import( path);\n",
  ],
  ["/* Loads once. @__NO_SIDE_EFFECTS__ */\nfunction load() {}\n", "function load() {}\n"],
  ["/** @__NO_SIDE_EFFECTS__ once */\nfunction load() {}\n", "function load() {}\n"],
  ['// eslint no-undef: "off"\nload();\n', "load();\n"],
  ['/** eslint no-undef: "off" */\nload();\n', "load();\n"],
  ["// eslint-env node\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/** global state for the menu. */\nconst menu = {};\n", "const menu = {};\n"],
  ["/*\n * eslint-disable no-undef\n */\nload();\n", "load();\n"],
  ["/* webpack bundles this file. */\nconst menu = {};\n", "const menu = {};\n"],
  ["/** Reads the @license text. */\nfunction load() {}\n", "function load() {}\n"],
  ["/**\n * Store 1.0\n * @license MIT\n */\nconst limit = 1;\n", "const limit = 1;\n"],
  [
    "/**\n * The type is wrong upstream.\n * @ts-ignore\n */\nconst limit = 1;\n",
    "const limit = 1;\n",
  ],
  ["/** The type is wrong upstream. @ts-ignore */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/** Runs with @vitest-environment. */\nconst limit = 1;\n", "const limit = 1;\n"],
  ["// Slow suite. \u0040module-tag slow\nconst limit = 1;\n", "const limit = 1;\n"],
  ["/*\n * c8 ignore\n * start\n */\nconst limit = 1;\n", "const limit = 1;\n"],
].map(([code, output]) => rejected(typescript(code), output));

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
      shebang,
      jsx("export const Reader = () => <div>{/* https://example.com/reader */}</div>;\n"),
    ],
    invalid: [
      ...ignoredByTool,
      rejected(typescript("/** Doc. */\nfunction load() {}\n"), "function load() {}\n"),
      rejected(typescript("/** Doc. */\nconst limit = 1;\n"), "const limit = 1;\n"),
      rejected(typescript("/** Doc. */\nclass Store {}\n"), "class Store {}\n"),
      rejected(typescript("/** Doc. */\ntype Mode = 'on';\n"), "type Mode = 'on';\n"),
      rejected(typescript("/** Doc. */\ninterface Options {}\n"), "interface Options {}\n"),
      rejected(typescript("/** Doc. */\nenum Level { Low }\n"), "enum Level { Low }\n"),
      rejected(typescript("/** Doc. */\nload();\n"), "load();\n"),
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
        typescript("interface Options {\n  /** Doc. */\n  limit: number;\n}\n"),
        "interface Options {\n  limit: number;\n}\n",
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
        typescript("export const schema = object({\n  /** Doc. */\n  limit: number(),\n});\n"),
        "export const schema = object({\n  limit: number(),\n});\n",
      ),
      rejected(
        typescript("export function load(options: {\n  /** Doc. */\n  limit: number;\n}) {}\n"),
        "export function load(options: {\n  limit: number;\n}) {}\n",
      ),
      rejected(
        typescript(
          "interface Base {\n  /** Doc. */\n  limit: number;\n}\nexport interface Options extends Base {}\n",
        ),
        "interface Base {\n  limit: number;\n}\nexport interface Options extends Base {}\n",
      ),
      rejected(
        typescript(
          "interface Props {\n  /** Doc. */\n  limit: number;\n}\nexport function load(props: Props) {}\n",
        ),
        "interface Props {\n  limit: number;\n}\nexport function load(props: Props) {}\n",
      ),
      rejected(
        typescript("export const useStore = create(() => ({\n  /** Doc. */\n  read() {},\n}));\n"),
        "export const useStore = create(() => ({\n  read() {},\n}));\n",
      ),
      rejected(
        typescript("export class Store {\n  read() {\n    /** Doc. */\n    return 1;\n  }\n}\n"),
        "export class Store {\n  read() {\n    return 1;\n  }\n}\n",
      ),
      rejected(
        typescript(
          "export function load() {\n  class Store {\n    /** Doc. */\n    size = 0;\n  }\n  return Store;\n}\n",
        ),
        "export function load() {\n  class Store {\n    size = 0;\n  }\n  return Store;\n}\n",
      ),
      rejected(
        typescript("export class Store {\n  static {\n    /** Doc. */\n    start();\n  }\n}\n"),
        "export class Store {\n  static {\n    start();\n  }\n}\n",
      ),
      rejected(
        typescript(
          "const limit = 1;\nexport { limit };\nfunction load() {\n  /** Doc. */\n  const limit = 2;\n  return limit;\n}\n",
        ),
        "const limit = 1;\nexport { limit };\nfunction load() {\n  const limit = 2;\n  return limit;\n}\n",
      ),
      rejected(
        typescript("export const limits = [\n  /** Doc. */\n  1,\n];\n"),
        "export const limits = [\n  1,\n];\n",
      ),
      rejected(
        typescript("/** Doc. */\nimport { load } from './load';\nexport { load };\n"),
        "import { load } from './load';\nexport { load };\n",
      ),
      rejected(typescript("export const limit = 1;\n/** Doc. */\n"), "export const limit = 1;\n"),
      rejected(
        typescript("export const options = { /** Doc. */ };\n"),
        "export const options = { };\n",
      ),
      rejected(typescript("const limit = 1; /** Doc. */\n"), "const limit = 1;\n"),
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
        jsx(
          "export const Reader = () => (\n  <div>\n    {/** Doc. */}\n    <span />\n  </div>\n);\n",
        ),
        "export const Reader = () => (\n  <div>\n    <span />\n  </div>\n);\n",
      ),
      rejected(
        jsx("export const Reader = () => <div><span />{ /** Doc. */ }<span /></div>;\n"),
        "export const Reader = () => <div><span />{ }<span /></div>;\n",
      ),
      rejected(
        jsx(
          "export const Reader = () => <div>{/* Note. */ /* https://example.com/reader */}</div>;\n",
        ),
        "export const Reader = () => <div>{ /* https://example.com/reader */}</div>;\n",
      ),
      rejected(
        jsx("export const Reader = () => <span title={/** Doc. */} />;\n"),
        "export const Reader = () => <span title={} />;\n",
      ),
      rejected(
        astro("---\n/** Doc. */\ninterface Options {\n  title: string;\n}\n---\n<p>ready</p>\n"),
        "---\ninterface Options {\n  title: string;\n}\n---\n<p>ready</p>\n",
      ),
      rejected(typescript("/**\n * Doc.\n */\nfunction load() {}\n"), "function load() {}\n"),
      rejected(typescript("// Note.\nexport const limit = 1;\n"), "export const limit = 1;\n"),
      rejected(typescript("/* Note. */\nexport const limit = 1;\n"), "export const limit = 1;\n"),
      rejected(
        typescript("/*\n * Loads the menu.\n */\nfunction load() {}\n"),
        "function load() {}\n",
      ),
    ],
  },
);
