import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLandingViewport,
  assertLandingViewportMatrix,
  LANDING_EXAMPLES,
  LANDING_LANGUAGES,
  LANDING_VIEWPORTS,
} from "./landing-viewport.mjs";

function rectangle(name, left, top, right, bottom, interactive = false) {
  return { name, left, top, right, bottom, width: right - left, height: bottom - top, interactive };
}

function measurement(width = 320, height = 568, language = "en", example = "start") {
  return {
    language,
    example,
    width,
    height,
    scrollHeight: height,
    scrollWidth: width,
    headlineHeight: 56,
    headlineLineHeight: 28,
    busy: false,
    composition: [
      rectangle("copy", 0, 48, width, 160),
      rectangle("demo", 0, 176, width, 320),
      rectangle("controls", 0, 336, width, 440),
    ],
    elements: [
      rectangle("language", width - 48, 0, width, 48, true),
      rectangle("example", 16, 240, 96, 288, true),
    ],
  };
}

test("the geometry assertions accept contained content and separated targets", () => {
  assert.doesNotThrow(() => assertLandingViewport(measurement()));
});

for (const [label, mutate, message] of [
  ["vertical scroll", (sample) => sample.scrollHeight++, /scrolls vertically/],
  ["horizontal scroll", (sample) => sample.scrollWidth++, /scrolls horizontally/],
  ["three headline lines", (sample) => (sample.headlineHeight = 84), /at most two lines/],
  ["a pending replay", (sample) => (sample.busy = true), /not finished/],
  ["offscreen content", (sample) => sample.elements[0].right++, /outside the viewport/],
  ["clipped content", (sample) => (sample.elements[1].clipped = true), /clips content/],
  [
    "colliding targets",
    (sample) => sample.elements.push({ ...sample.elements[0], name: "other" }),
    /overlaps/,
  ],
  [
    "side by side regions",
    (sample) => (sample.composition[1] = rectangle("demo", 160, 48, 320, 320)),
    /above.*demo/,
  ],
  ["an off centre region", (sample) => (sample.composition[1].left = 48), /centred column/],
]) {
  test(`the geometry assertions reject ${label}`, () => {
    const sample = measurement();
    mutate(sample);
    assert.throws(() => assertLandingViewport(sample), message);
  });
}

test("the matrix requires every requested size, locale and example", () => {
  const samples = LANDING_VIEWPORTS.flatMap(([width, height]) =>
    LANDING_LANGUAGES.flatMap((language) =>
      LANDING_EXAMPLES.map((example) => {
        const sample = measurement(width, height, language, example);
        sample.composition = [
          rectangle("copy", 0, 48, width, 96),
          rectangle("demo", 0, 100, width, 200),
          rectangle("controls", 0, 204, width, 260),
        ];
        return sample;
      }),
    ),
  );
  assert.equal(samples.length, 126);
  assert.doesNotThrow(() => assertLandingViewportMatrix(samples));
  assert.throws(
    () => assertLandingViewportMatrix(samples.slice(1)),
    /Missing viewport observation/,
  );
  assert.throws(() => assertLandingViewportMatrix([]), /Missing viewport observation/);
});
