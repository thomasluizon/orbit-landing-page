import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("production has no autonomous carousel, playback controls or repeating animation", () => {
  const hero = readFileSync("src/components/Hero.astro", "utf8");
  const copy = readFileSync("src/i18n/translations.ts", "utf8");
  const css = readFileSync("src/styles/landing.css", "utf8");
  assert.doesNotMatch(
    hero + copy + css,
    /hero-playback|demo\.(?:pause|resume)|hero-(?:pause|play)-icon|ambientRunning|carouselRunning|carousel-fill|hero-float\s+\d/,
  );
  for (const file of readdirSync("src", { recursive: true }).filter((file) =>
    /\.(?:astro|css|ts)$/.test(file),
  )) {
    assert.doesNotMatch(
      readFileSync(`src/${file}`, "utf8"),
      /setInterval\s*\(|repeat:\s*-1|animation[^;{}]*\binfinite\b/,
      file,
    );
  }
});

for (const [width, height, pinned] of [
  [1440, 900, true],
  [1100, 762, true],
  [412, 915, true],
  [390, 844, true],
  [320, 568, true],
  [844, 390, false],
  [568, 320, false],
  [844, 583, false],
  [844, 584, true],
  [568, 567, false],
]) {
  test(`${width}x${height} drives the hero stage in ${pinned ? "pinned" : "flow"} mode for both motion preferences`, () => {
    for (const reduced of [false, true]) {
      const triggers = [],
        lenisInstances = [];
      const stage = { querySelectorAll: () => [] };
      const exports = {};
      let reverted = false;
      const tickers = new Set();
      const cleanups = [];
      class Lenis {
        constructor(options) {
          assert.equal(options.autoRaf, false);
          lenisInstances.push(this);
        }
        raf(time) {
          this.time = time;
        }
        on() {}
        destroy() {
          this.destroyed = true;
        }
      }
      const gsap = {
        registerPlugin() {},
        ticker: {
          add: (callback) => tickers.add(callback),
          remove: (callback) => tickers.delete(callback),
        },
        matchMedia: () => ({
          add(query, fn) {
            if (typeof query === "object") {
              const conditions = Object.fromEntries(
                Object.entries(query).map(([name, value]) => [
                  name,
                  value
                    .split(",")
                    .some((alternative) =>
                      [
                        ...alternative.matchAll(/\((width|height)\s*(<=|>=|<|>)\s*(\d+)px\)/g),
                      ].every(([, axis, operator, boundary]) =>
                        vm.runInNewContext(
                          `${axis === "width" ? width : height} ${operator} ${boundary}`,
                        ),
                      ),
                    ),
                ]),
              );
              assert.equal(conditions.pinned, pinned);
              assert.equal(conditions.flow, !pinned);
              const css = readFileSync("src/styles/landing.css", "utf8");
              assert.ok(
                css.includes(`@media ${query.flow}`),
                "flow spacing shares the driver's fit boundaries",
              );
              fn({ conditions });
            } else if (query === "all" || !reduced) cleanups.push(fn());
          },
          revert() {
            cleanups.forEach((cleanup) => cleanup?.());
            reverted = true;
          },
        }),
        timeline(options) {
          triggers.push(options.scrollTrigger);
          return { to() {} };
        },
        fromTo() {},
      };
      vm.runInNewContext(
        ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        {
          exports,
          require: (name) =>
            name === "gsap"
              ? { gsap }
              : name === "gsap/ScrollTrigger"
                ? {
                    ScrollTrigger: {
                      refresh() {},
                      update() {},
                      addEventListener() {},
                      removeEventListener() {},
                    },
                  }
                : name === "lenis"
                  ? { default: Lenis }
                  : name === "./programmatic-scroll"
                    ? { resumeProgrammaticScroll() {}, routeProgrammaticScroll: () => () => {} }
                    : {},
          document: {
            getElementById: (id) =>
              id === "hero-stage"
                ? stage
                : id === "site-header"
                  ? {
                      getBoundingClientRect: () => ({ bottom: width <= 640 ? 80 : 96 }),
                    }
                  : null,
            querySelectorAll: () => [],
            querySelector: () => null,
            fonts: { ready: Promise.resolve() },
          },
          window: { addEventListener() {}, removeEventListener() {} },
          ResizeObserver: class {
            disconnect() {}
          },
        },
      );
      const dispose = exports.mountLandingMotion();
      assert.equal(triggers.length, 1);
      assert.equal(triggers[0].pin, pinned);
      if (pinned) {
        assert.equal(triggers[0].start(), `top ${width <= 640 ? 96 : 112}px`);
        assert.equal(triggers[0].end, "+=560");
        assert.equal(triggers[0].pinSpacing, false);
      } else {
        assert.equal(triggers[0].start, "top bottom");
        assert.equal(triggers[0].end, "bottom top");
      }
      assert.equal(triggers[0].scrub, true);
      assert.equal(lenisInstances.length, reduced ? 0 : 1);
      assert.equal(tickers.size, reduced ? 0 : 1);
      for (const tick of tickers) tick(1.25);
      if (!reduced) assert.equal(lenisInstances[0].time, 1250);
      dispose();
      assert.equal(tickers.size, 0);
      if (!reduced) assert.equal(lenisInstances[0].destroyed, true);
      assert.equal(reverted, true);
    }
  });
}

test("feature motion waits for intersection and separate tasks, and respects media cleanup", () => {
  for (const reduced of [false, true]) {
    const tasks = [],
      animations = [],
      cleanups = [],
      observers = [];
    const rows = [0, 1].map(() => ({ querySelectorAll: () => [] }));
    let recording = false;
    const context = {
      add(callback) {
        recording = true;
        callback();
        recording = false;
      },
    };
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(readFileSync("src/scripts/landing-motion.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require(name) {
          if (name === "./task-queue")
            return { afterLoad: (callbacks) => tasks.push(...callbacks) };
          if (name === "gsap")
            return {
              gsap: {
                registerPlugin() {},
                ticker: { add() {}, remove() {} },
                matchMedia: () => ({
                  add(query, callback) {
                    if (query === "all" || !reduced) {
                      const cleanup = callback(context);
                      if (cleanup) cleanups.push(cleanup);
                    }
                  },
                  revert: () => cleanups.forEach((cleanup) => cleanup()),
                }),
                fromTo(_targets, _from, to) {
                  assert.ok(recording, "deferred animations stay in their media context");
                  animations.push(to.scrollTrigger.trigger);
                },
              },
            };
          if (name === "gsap/ScrollTrigger")
            return {
              ScrollTrigger: { refresh() {}, addEventListener() {}, removeEventListener() {} },
            };
          if (name === "lenis")
            return {
              default: class {
                on() {}
                destroy() {}
              },
            };
          if (name === "./programmatic-scroll")
            return { resumeProgrammaticScroll() {}, routeProgrammaticScroll: () => () => {} };
          return {};
        },
        document: {
          getElementById: () => null,
          querySelector: () => null,
          querySelectorAll: (selector) => (selector === "[data-example-row]" ? rows : []),
          fonts: { ready: Promise.resolve() },
        },
        window: { addEventListener() {}, removeEventListener() {} },
        ResizeObserver: class {
          disconnect() {}
        },
        IntersectionObserver: class {
          observed = new Set();
          constructor(callback) {
            this.callback = callback;
            observers.push(this);
          }
          observe(row) {
            this.observed.add(row);
          }
          unobserve(row) {
            this.observed.delete(row);
          }
          disconnect() {
            this.disconnected = true;
          }
        },
      },
    );
    const dispose = exports.mountLandingMotion();
    assert.equal(tasks.length, 0);
    assert.deepEqual(animations, []);
    if (reduced) {
      assert.equal(observers.length, 0);
      dispose();
      continue;
    }
    const observer = observers[0];
    assert.deepEqual([...observer.observed], rows);
    observer.callback(rows.map((target) => ({ target, isIntersecting: false })));
    assert.equal(tasks.length, 0);
    observer.callback(rows.map((target) => ({ target, isIntersecting: true })));
    assert.equal(tasks.length, 2);
    assert.deepEqual(animations, []);
    tasks.shift()();
    assert.deepEqual(animations, [rows[0]]);
    dispose();
    assert.equal(observer.disconnected, true);
    tasks.shift()();
    assert.deepEqual(animations, [rows[0]], "reverted media cannot mount a queued animation");
  }
});
