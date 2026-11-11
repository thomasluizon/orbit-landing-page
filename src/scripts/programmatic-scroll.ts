const SCROLL_SETTLE_MS = 150;

let start: ((behavior: ScrollBehavior) => void) | undefined;
let origin = 0;
let settleTimer: number | undefined;

function restart() {
  if (!start) return;
  origin = window.scrollY;
  start("smooth");
  watchSettle();
}

function settle() {
  if (Math.abs(window.scrollY - origin) < 1) cancel();
  else restart();
}

function watchSettle() {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, SCROLL_SETTLE_MS);
}

function cancel() {
  window.clearTimeout(settleTimer);
  start = undefined;
}

function run(scroll: (behavior: ScrollBehavior) => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cancel();
    scroll("instant");
    return;
  }
  start = scroll;
  restart();
}

window.addEventListener(
  "scroll",
  () => {
    if (start) watchSettle();
  },
  { passive: true },
);
for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  window.addEventListener(event, cancel, { passive: true });
}

/**
 * Scrolls the target to the top of the viewport. The scroll starts again after each stop until a
 * new start moves the page no further, or until the visitor scrolls, presses or types.
 */
export function scrollToElement(target: Element) {
  run((behavior) => target.scrollIntoView({ behavior, block: "start" }));
}

/** Scrolls to the top of the page with the same restarts as `scrollToElement`. */
export function scrollToTop() {
  run((behavior) => window.scrollTo({ top: 0, behavior }));
}

/**
 * ScrollTrigger refresh scrolls to the top and restores the position it read, which stops a
 * smooth scroll in flight. Call this after each refresh to start the interrupted scroll again.
 */
export function resumeProgrammaticScroll() {
  restart();
}
