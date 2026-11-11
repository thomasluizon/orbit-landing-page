const SCROLL_SETTLE_MS = 150;

let resume: (() => void) | undefined;
let settleTimer: number | undefined;

function watchSettle() {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    resume = undefined;
  }, SCROLL_SETTLE_MS);
}

function cancel() {
  window.clearTimeout(settleTimer);
  resume = undefined;
}

function run(start: (behavior: ScrollBehavior) => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cancel();
    start("instant");
    return;
  }
  start("smooth");
  resume = () => start("smooth");
  watchSettle();
}

window.addEventListener(
  "scroll",
  () => {
    if (resume) watchSettle();
  },
  { passive: true },
);
for (const event of ["wheel", "touchstart", "keydown"]) {
  window.addEventListener(event, cancel, { passive: true });
}

/** Scrolls the target to the top of the viewport and survives a ScrollTrigger refresh. */
export function scrollToElement(target: Element) {
  run((behavior) => target.scrollIntoView({ behavior, block: "start" }));
}

/** Scrolls to the top of the page and survives a ScrollTrigger refresh. */
export function scrollToTop() {
  run((behavior) => window.scrollTo({ top: 0, behavior }));
}

/**
 * ScrollTrigger refresh scrolls to the top and restores the position it read, which stops a
 * smooth scroll in flight. Call this after each refresh to start the interrupted scroll again.
 */
export function resumeProgrammaticScroll() {
  if (!resume) return;
  resume();
  watchSettle();
}
