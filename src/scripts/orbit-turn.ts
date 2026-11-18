const settle = (event: AnimationEvent) => {
  const orbit = event.currentTarget as SVGElement;
  if (event.animationName === "orbit-spin" && orbit.dataset.orbitTurn === "run")
    orbit.dataset.orbitTurn = "done";
};

/** One ring turn of the Orbit mascot inside `element`. A new turn restarts a running one, so turns never queue. */
export function turnOrbit(element: Element | null) {
  const orbit = element?.querySelector<SVGElement>("[data-orbit-mascot]");
  if (!orbit) return;
  orbit.onanimationend = settle;
  orbit.dataset.orbitTurn = "reset";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      orbit.dataset.orbitTurn = "run";
    }),
  );
}

/** One timed blink for each guide Orbit when it comes into view. The blink never follows the scroll position, so the eyes end open. */
export function blinkGuides() {
  const watch = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.orbitBlink = "";
        watch.unobserve(entry.target);
      }),
    { threshold: 0.6 },
  );
  document.querySelectorAll("[data-orbit-guide]").forEach((guide) => watch.observe(guide));
}
