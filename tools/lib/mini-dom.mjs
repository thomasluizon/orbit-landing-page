import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { parse, parseFragment } from "parse5";

const camel = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const kebab = (name) => `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

function matchesSimple(element, selector) {
  const [, name, value] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/) ?? [];
  if (name !== undefined) {
    return (
      element.hasAttribute(name) && (value === undefined || element.getAttribute(name) === value)
    );
  }
  if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
  return element.tagName === selector;
}

/** Wraps a parse5 tree in the small DOM surface the landing scripts use. */
export function elementFor(node, cache = new WeakMap()) {
  if (cache.has(node)) return cache.get(node);
  const wrap = (child) => elementFor(child, cache);
  const listeners = new Map();
  const element = {
    node,
    tagName: node.tagName,
    get parentElement() {
      return node.parentNode?.tagName ? wrap(node.parentNode) : null;
    },
    get children() {
      return (node.childNodes ?? []).filter((child) => child.tagName).map(wrap);
    },
    getAttribute(name) {
      return node.attrs?.find((attribute) => attribute.name === name)?.value ?? null;
    },
    hasAttribute(name) {
      return Boolean(node.attrs?.some((attribute) => attribute.name === name));
    },
    setAttribute(name, value) {
      const attribute = node.attrs.find((item) => item.name === name);
      if (attribute) attribute.value = String(value);
      else node.attrs.push({ name, value: String(value) });
    },
    removeAttribute(name) {
      node.attrs = node.attrs.filter((attribute) => attribute.name !== name);
    },
    get hidden() {
      return this.hasAttribute("hidden");
    },
    get classList() {
      const classes = () => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
      return { contains: (name) => classes().includes(name) };
    },
    dataset: new Proxy(
      {},
      {
        get: (_, name) => element.getAttribute(kebab(String(name))) ?? undefined,
        set: (_, name, value) => {
          element.setAttribute(kebab(String(name)), value);
          return true;
        },
        has: (_, name) => element.hasAttribute(kebab(String(name))),
        deleteProperty: (_, name) => {
          element.removeAttribute(kebab(String(name)));
          return true;
        },
        ownKeys: () =>
          node.attrs.filter(({ name }) => name.startsWith("data-")).map(({ name }) => camel(name)),
        getOwnPropertyDescriptor: (_, name) => ({
          enumerable: true,
          configurable: true,
          value: element.getAttribute(kebab(String(name))),
        }),
      },
    ),
    get textContent() {
      const text = (item) =>
        item.nodeName === "#text" ? item.value : (item.childNodes ?? []).map(text).join("");
      return text(node);
    },
    set textContent(value) {
      node.childNodes = [{ nodeName: "#text", value: String(value), parentNode: node }];
    },
    set innerHTML(html) {
      const fragment = parseFragment(html);
      for (const child of fragment.childNodes) child.parentNode = node;
      node.childNodes = fragment.childNodes;
    },
    matches(selector) {
      return selector.split(",").some((part) => matchesSimple(element, part.trim()));
    },
    querySelectorAll(selector) {
      const found = [];
      const visit = (item) => {
        for (const child of item.childNodes ?? []) {
          if (!child.tagName) continue;
          if (wrap(child).matches(selector)) found.push(wrap(child));
          visit(child);
        }
      };
      visit(node);
      return found;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    closest(selector) {
      return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
    },
    addEventListener(name, callback) {
      listeners.set(name, [...(listeners.get(name) ?? []), callback]);
    },
    dispatch(name, event = {}) {
      const payload = { target: element, preventDefault() {}, ...event };
      for (let item = element; item; item = item.parentElement) {
        for (const callback of item.listeners.get(name) ?? []) callback(payload);
      }
      return payload;
    },
    listeners,
    focus() {
      cache.owner.activeElement = element;
    },
  };
  cache.set(node, element);
  return element;
}

/** Parses an HTML document into the small DOM surface, with `documentElement` and `activeElement`. */
export function documentFrom(html) {
  const tree = parse(html);
  const cache = new WeakMap();
  cache.owner = { activeElement: null };
  const document = elementFor(tree, cache);
  const root = tree.childNodes.find((child) => child.tagName === "html");
  document.documentElement = elementFor(root, cache);
  Object.defineProperty(document.documentElement, "lang", {
    get: () => document.documentElement.getAttribute("lang"),
    set: (value) => document.documentElement.setAttribute("lang", value),
  });
  Object.defineProperty(document, "activeElement", { get: () => cache.owner.activeElement });
  return document;
}

/** Loads a TypeScript source module and its relative imports into one shared VM context. */
export function moduleLoader(globals) {
  const context = vm.createContext(globals);
  const cache = new Map();
  const load = (path) => {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (specifier) =>
      specifier.startsWith(".") ? load(`${join(dirname(path), specifier)}.ts`) : {};
    vm.runInContext(`(function(exports, require) {\n${code}\n})`, context)(exports, require);
    return exports;
  };
  return load;
}
