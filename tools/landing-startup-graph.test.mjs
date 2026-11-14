import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const assets = "dist/_astro";
const chunks = readdirSync(assets).filter((name) => name.endsWith(".js"));
const chunkNamed = (name) => chunks.find((file) => file.startsWith(`${name}.`));
const staticImports = (file) =>
  [
    ...readFileSync(`${assets}/${file}`, "utf8").matchAll(
      /(?:import|export)\s*(?:[^"'`(;]*?from\s*)?["'`]\.\/([^"'`]+)["'`]/g,
    ),
  ].map((match) => match[1]);
const dynamicImports = (file) =>
  [
    ...readFileSync(`${assets}/${file}`, "utf8").matchAll(
      /import\(\s*["'`]\.\/([^"'`]+)["'`]\s*\)/g,
    ),
  ].map((match) => match[1]);

const scroll = chunkNamed("programmatic-scroll");
const motion = chunkNamed("landing-motion");

test("the programmatic scroll chunk is built", () => {
  assert.ok(scroll);
  assert.ok(motion);
});

test("only the deferred landing motion imports the programmatic scroll statically", () => {
  const importers = chunks.filter((file) => staticImports(file).includes(scroll));
  assert.deepEqual(importers, [motion]);
});

test("the waitlist, back to top, header link and page scripts load the programmatic scroll on demand", () => {
  for (const name of [
    "back-to-top",
    "waitlist-section",
    "header-scroll",
    "index.astro_astro_type_script_index_0_lang",
  ]) {
    const file = chunkNamed(name);
    assert.ok(file, `${name} is built`);
    assert.ok(!staticImports(file).includes(scroll), `${name} must not import it statically`);
    assert.ok(dynamicImports(file).includes(scroll), `${name} must import it dynamically`);
  }
});

const staticGraph = (file, graph = new Set()) => {
  if (graph.has(file)) return graph;
  graph.add(file);
  for (const imported of staticImports(file)) staticGraph(imported, graph);
  return graph;
};
const preloadList = (file) => {
  const list = readFileSync(`${assets}/${file}`, "utf8").match(/m\.f=\[([^\]]*)\]/)?.[1];
  return list ? JSON.parse(`[${list}]`).map((path) => path.replace(/^_astro\//, "")) : [];
};

test("each preload list holds every chunk that a dynamic import would load later, and no other", () => {
  for (const host of chunks) {
    const loaded = staticGraph(host);
    const expected = new Set(
      dynamicImports(host).flatMap((target) =>
        [...staticGraph(target)].filter((file) => file !== target && !loaded.has(file)),
      ),
    );
    assert.deepEqual(new Set(preloadList(host)), expected, host);
  }
  const page = chunkNamed("index.astro_astro_type_script_index_0_lang");
  assert.deepEqual(
    new Set(preloadList(page)),
    new Set([chunkNamed("day-cell"), chunkNamed("motion-token")]),
  );
});

test("the page script loads the downloads panel chunk only on demand", () => {
  const panel = chunkNamed("downloads-panel");
  assert.ok(panel, "the dismissal code ships as its own lazy chunk");
  assert.deepEqual(
    chunks.filter((file) => staticImports(file).includes(panel)),
    [],
  );
  assert.deepEqual(
    chunks.filter((file) => dynamicImports(file).includes(panel)),
    [chunkNamed("index.astro_astro_type_script_index_0_lang")],
  );
  assert.doesNotMatch(readFileSync(`${assets}/${panel}`, "utf8"), /\bexport\b/);
});

test("the page script loads the FAQ disclosure chunk only from its section observer", () => {
  const faq = chunkNamed("faq");
  const page = chunkNamed("index.astro_astro_type_script_index_0_lang");
  assert.ok(faq, "the FAQ disclosure ships as its own lazy chunk");
  assert.deepEqual(
    chunks.filter((file) => staticImports(file).includes(faq)),
    [],
  );
  assert.deepEqual(
    chunks.filter((file) => dynamicImports(file).includes(faq)),
    [page],
  );
  const source = readFileSync(`${assets}/${page}`, "utf8");
  const requests = [...source.matchAll(/import\(\s*["'`]\.\/faq\.[^"'`]+["'`]\s*\)/g)];
  const observer = source.indexOf("new IntersectionObserver(");
  assert.equal(requests.length, 1);
  assert.ok(observer >= 0, "the page script observes its sections");
  assert.ok(
    requests[0].index > observer,
    "the FAQ disclosure must load when the FAQ comes near, not in the after-load list",
  );
});
