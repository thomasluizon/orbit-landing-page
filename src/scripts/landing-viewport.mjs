export const LANDING_VIEWPORTS = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [568, 320],
  [667, 375],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1024, 600],
  [1000, 565],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1512, 982],
  [1728, 1117],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

/** Windows too short for the one-screen composition: the document may scroll, targets stay distinct. */
export const LANDING_FALLBACK_VIEWPORTS = [[512, 300]];

export const LANDING_LANGUAGES = ["en", "pt-BR"];
export const LANDING_EXAMPLES = ["start", "restart", "move"];

function bounds(element) {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
}

function visibleElements(view) {
  return [...view.document.querySelectorAll("body *")].filter((element) => {
    const style = view.getComputedStyle(element);
    if (style.visibility !== "visible" || style.display === "none") return false;
    if (element.closest("defs, symbol, .glyph-definitions")) return false;
    if (element.closest(".skip-to-content") && element !== view.document.activeElement)
      return false;
    return [...element.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
  });
}

function elementMeasurement(element, view) {
  const style = view.getComputedStyle(element);
  const clips = (axis, scroll, client) =>
    /^(hidden|clip|auto|scroll)$/.test(axis) && scroll > client + 1;
  return {
    name: element.id || `${element.tagName.toLowerCase()}.${element.classList.value}`,
    ...bounds(element),
    interactive:
      element.matches("a[href], button, input, select, textarea, summary, [tabindex]") &&
      !element.matches(":disabled") &&
      element.tabIndex >= 0,
    clipped:
      clips(style.overflowX, element.scrollWidth, element.clientWidth) ||
      clips(style.overflowY, element.scrollHeight, element.clientHeight),
  };
}

/** Captures rendered geometry after fonts settle; it does not navigate or start a browser. */
export async function measureLandingViewport(view = window) {
  const document = view.document;
  await document.fonts.ready;
  await new Promise((resolve) =>
    view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)),
  );
  const headline = document.querySelector("#hero h1");
  if (!headline) throw new Error("The landing headline is missing");
  const composition = [".hero-copy", ".astra-demo", ".hero-controls"].map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing composition region: ${selector}`);
    return { name: selector, ...bounds(element) };
  });
  return {
    language: document.documentElement.lang,
    example: document.querySelector("[data-demo][aria-pressed='true']")?.dataset.demo,
    width: view.innerWidth,
    height: view.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    headlineHeight: bounds(headline).height,
    headlineLineHeight: Number.parseFloat(view.getComputedStyle(headline).lineHeight),
    busy: document.querySelector(".demo-exchange")?.getAttribute("aria-busy") === "true",
    composition,
    elements: visibleElements(view).map((element) => elementMeasurement(element, view)),
  };
}

function overlap(a, b) {
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
  );
}

const INTEGER_SCROLL_HEIGHT_ROUNDING = 1;

function compositionFailures(regions) {
  const failures = [];
  if (regions.length !== 3) return ["Missing composition regions"];
  for (let index = 1; index < regions.length; index++) {
    const previous = regions[index - 1];
    const current = regions[index];
    if (previous.bottom > current.top + 1)
      failures.push(`${previous.name} must appear above ${current.name}`);
    const centre = (region) => (region.left + region.right) / 2;
    if (Math.abs(centre(previous) - centre(current)) > 1)
      failures.push(`${current.name} must share the centred column`);
  }
  return failures;
}

/** Checks one measured viewport, including hidden overflow, target collisions and reading order. */
export function assertLandingViewport(sample, { allowScroll = false } = {}) {
  const failures = compositionFailures(sample.composition);
  const bottomLimit = allowScroll
    ? sample.scrollHeight + INTEGER_SCROLL_HEIGHT_ROUNDING
    : sample.height;
  if (!allowScroll && sample.scrollHeight > sample.height)
    failures.push("The document scrolls vertically");
  if (sample.scrollWidth > sample.width) failures.push("The document scrolls horizontally");
  if (sample.busy) failures.push("The example has not finished playing");
  if (
    !(sample.headlineLineHeight > 0 && sample.headlineHeight > 0) ||
    sample.headlineHeight > sample.headlineLineHeight * 2 + 1
  )
    failures.push("The headline must occupy at most two lines");
  const targets = [];
  for (const element of sample.elements) {
    if (
      element.left < 0 ||
      element.top < 0 ||
      element.right > sample.width ||
      element.bottom > bottomLimit
    )
      failures.push(`${element.name} extends outside the viewport`);
    if (element.clipped) failures.push(`${element.name} clips content`);
    if (!element.interactive) continue;
    for (const target of targets) {
      if (overlap(element, target)) failures.push(`${element.name} overlaps ${target.name}`);
    }
    targets.push(element);
  }
  if (failures.length)
    throw new Error(
      `${sample.language} ${sample.width}x${sample.height} ${sample.example}:\n${failures.join("\n")}`,
    );
}

/** Requires both languages and all three examples at every specified viewport. */
export function assertLandingViewportMatrix(samples) {
  const key = ({ language, width, height, example }) => `${language}/${width}/${height}/${example}`;
  const measured = new Set();
  const fallback = new Set(
    LANDING_FALLBACK_VIEWPORTS.map(([width, height]) => `${width}x${height}`),
  );
  for (const sample of samples) {
    assertLandingViewport(sample, {
      allowScroll: fallback.has(`${sample.width}x${sample.height}`),
    });
    measured.add(key(sample));
  }
  for (const [width, height] of [...LANDING_VIEWPORTS, ...LANDING_FALLBACK_VIEWPORTS]) {
    for (const language of LANDING_LANGUAGES) {
      for (const example of LANDING_EXAMPLES) {
        const expected = key({ language, width, height, example });
        if (!measured.has(expected)) throw new Error(`Missing viewport observation: ${expected}`);
      }
    }
  }
}
