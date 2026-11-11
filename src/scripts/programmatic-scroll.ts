import type Lenis from "lenis";

type Destination = Element | number;

let destination: Destination | undefined;
let lenis: Lenis | undefined;

function scrollNatively(target: Destination, behavior: ScrollBehavior) {
  if (typeof target === "number") window.scrollTo({ top: target, behavior });
  else target.scrollIntoView({ behavior, block: "start" });
}

function steer() {
  const target = destination;
  if (target === undefined) return;
  if (!lenis) {
    scrollNatively(target, "smooth");
    return;
  }
  lenis.resize();
  lenis.scrollTo(target, {
    onComplete: () => {
      if (destination === target) destination = undefined;
    },
  });
}

function stop() {
  if (destination !== undefined && lenis?.isSmooth) {
    lenis.stop();
    lenis.start();
  }
  destination = undefined;
}

function run(target: Destination) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stop();
    scrollNatively(target, "instant");
    return;
  }
  destination = target;
  steer();
}

for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  window.addEventListener(event, stop, { passive: true });
}

/**
 * Scrolls the target to the top of the viewport, below its scroll margin. The scroll ends when it
 * arrives, or when the visitor scrolls, presses or types.
 */
export function scrollToElement(target: Element) {
  run(target);
}

/** Scrolls to the top of the page, with the same end rules as `scrollToElement`. */
export function scrollToTop() {
  run(0);
}

/**
 * Sends the programmatic scrolls through Lenis while it is mounted, and moves a scroll in flight
 * to Lenis at once. A native smooth scroll stops at the next write to the scroll position, such as
 * a ScrollTrigger refresh. Lenis writes the position on each tick, so its scroll continues.
 * Returns the function that stops the routing.
 */
export function routeProgrammaticScroll(instance: Lenis) {
  lenis = instance;
  steer();
  return () => {
    if (lenis === instance) lenis = undefined;
  };
}

/**
 * Call this after each ScrollTrigger refresh. It measures the target again and steers the scroll
 * in flight to it, because the refresh can move the target.
 */
export function resumeProgrammaticScroll() {
  steer();
}
