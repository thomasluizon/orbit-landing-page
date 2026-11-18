/** One timed blink for each guide Orbit once its scroll arrival has made it visible. The blink never follows the scroll position, so the eyes end open. */
export function blinkGuides() {
  const watch = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.orbitBlink = "";
        watch.unobserve(entry.target);
      }),
    { threshold: 0.6, rootMargin: "0px 0px -25% 0px" },
  );
  document.querySelectorAll("[data-orbit-guide]").forEach((guide) => watch.observe(guide));
}

blinkGuides();
