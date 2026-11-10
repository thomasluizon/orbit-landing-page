import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const css = readFileSync("src/styles/landing.css", "utf8");
const fixture = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/config/product-examples.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: fixture },
);

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))]
    .map(([, body]) => body)
    .join(";");
}
function pixels(selector, property, fallback = 0) {
  const values = [
    ...declarations(selector).matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([\\d.]+)px`, "g")),
  ];
  return values.length ? Number(values.at(-1)[1]) : fallback;
}

const geometry = {
  absolute: /position:\s*absolute/.test(declarations(".metric-readout")),
  rowGap: pixels(".metric-chart", "gap"),
  barsPadding: pixels(".metric-bars", "padding-block-start"),
  track: pixels(
    ".example-app .metric-bar-track",
    "block-size",
    pixels(".metric-bar-track", "block-size"),
  ),
  trackPadding: pixels(".metric-bar-track", "padding-block"),
  barInset: pixels(".metric-bar-track", "padding-inline"),
};

function layout(width, readoutHeight) {
  const barsTop = geometry.absolute ? 0 : readoutHeight + geometry.rowGap;
  const trackTop = barsTop + geometry.barsPadding;
  const inner = geometry.track - 2 * geometry.trackPadding;
  const column = width / fixture.exampleWeek.length;
  return fixture.exampleWeek.map((value, index) => {
    const height = Math.max(4, (value / 100) * inner);
    const bottom = trackTop + geometry.trackPadding + inner;
    return {
      offsetLeft: index * column,
      offsetWidth: column,
      offsetTop: barsTop,
      bar: {
        offsetTop: bottom - height,
        box: {
          left: index * column + geometry.barInset,
          right: (index + 1) * column - geometry.barInset,
          top: bottom - height,
          bottom,
        },
      },
    };
  });
}

function harness() {
  const readout = { style: {}, offsetWidth: 136, offsetHeight: 64 };
  const chart = { clientWidth: 0 };
  const listeners = [];
  let resize;
  let columns = [];
  const days = fixture.exampleWeek.map((_, index) => ({
    get offsetLeft() {
      return columns[index].offsetLeft;
    },
    get offsetWidth() {
      return columns[index].offsetWidth;
    },
    get offsetTop() {
      return columns[index].offsetTop;
    },
    tabIndex: -1,
    setAttribute() {},
    addEventListener(name, callback) {
      listeners[index] = { ...listeners[index], [name]: callback };
    },
    focus() {},
    querySelector: () => ({
      get offsetTop() {
        return columns[index].bar.offsetTop;
      },
      setAttribute() {},
    }),
  }));
  const block = {
    querySelector: (selector) =>
      ({ "[data-metric-chart]": chart, ".metric-readout": readout })[selector],
    querySelectorAll: (selector) => (selector === "[data-metric-day]" ? days : []),
  };
  const setWidth = (width) => {
    chart.clientWidth = width;
    columns = layout(width, readout.offsetHeight);
  };
  setWidth(384);
  vm.runInNewContext(
    ts.transpileModule(readFileSync("src/scripts/product-metrics.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      document: {
        querySelectorAll: (selector) =>
          selector === '[data-example-block="metrics"]' ? [block] : [],
      },
      window: { requestAnimationFrame: (callback) => callback(), addEventListener() {} },
      ResizeObserver: class {
        constructor(callback) {
          resize = callback;
        }
        observe() {}
      },
    },
  );
  return {
    readout,
    select(index) {
      listeners[index].click();
    },
    resize(width) {
      setWidth(width);
      resize();
    },
    readoutBox() {
      const left = Number.parseFloat(readout.style.left ?? "0") || 0;
      const top = geometry.absolute ? Number.parseFloat(readout.style.top ?? "0") || 0 : 0;
      return { left, right: left + readout.offsetWidth, top, bottom: top + readout.offsetHeight };
    },
    bars: () => columns.map(({ bar }) => bar.box),
  };
}

const intersects = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("the 7-day readout never intersects a bar or leaves the chart, for every day including 0%", () => {
  assert.ok(
    fixture.exampleWeek.includes(0),
    "the fixture keeps a 0% day, the case that overlapped",
  );
  const h = harness();
  for (const width of [240, 256, 288, 320, 352, 384, 400]) {
    h.resize(width);
    for (const [index, value] of fixture.exampleWeek.entries()) {
      h.select(index);
      const box = h.readoutBox();
      for (const [barIndex, bar] of h.bars().entries()) {
        assert.ok(
          !intersects(box, bar),
          `width ${width}, day ${index} (${value}%): readout ${JSON.stringify(box)} covers bar ${barIndex} ${JSON.stringify(bar)}`,
        );
      }
      assert.ok(
        box.left >= 0 && box.right <= width,
        `width ${width}, day ${index}: readout leaves the chart`,
      );
    }
  }
});

test("the 7-day readout owns the row between the title and the bars", () => {
  assert.equal(geometry.absolute, false, "an absolute readout shares the bar row");
  const source = readFileSync("src/components/AstraBlock.astro", "utf8");
  const chart = source.slice(source.indexOf("data-metric-chart"));
  assert.ok(
    chart.indexOf('class="metric-readout-row"') < chart.indexOf('class="metric-bars"'),
    "the readout row comes before the bars",
  );
  assert.doesNotMatch(readFileSync("src/scripts/product-metrics.ts", "utf8"), /style\.top/);
});
