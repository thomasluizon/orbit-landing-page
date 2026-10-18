const stage = document.getElementById("hero-stage");
const carousel = stage?.querySelector<HTMLElement>("[data-phone-carousel]");
const slides = [...(stage?.querySelectorAll<HTMLElement>("[data-phone-slide]") ?? [])];
const segments = [...(stage?.querySelectorAll<HTMLButtonElement>("[data-carousel-segment]") ?? [])];
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let current = -1;

function select(index: number, animate = true) {
  if (index === current || !slides[index]) return;
  current = index;
  slides.forEach((slide, i) => {
    slide.inert = i !== current;
    slide.setAttribute("aria-hidden", String(i !== current));
  });
  segments.forEach((segment, i) => segment.setAttribute("aria-current", String(i === current)));
  carousel?.scrollTo({
    left: index * carousel.clientWidth,
    behavior: animate && !reduced.matches ? "smooth" : "instant",
  });
}

export function updateHeroCarousel(progress: number) {
  const focused = document.activeElement;
  if (carousel?.contains(focused) && focused?.matches(":focus-visible, input, textarea")) return;
  select(Math.min(slides.length - 1, Math.floor(Math.max(0, progress) * slides.length)));
}

segments.forEach((segment, index) => segment.addEventListener("click", () => select(index)));
let touchStart: { x: number; y: number } | undefined;
carousel?.addEventListener(
  "touchstart",
  (event) => {
    touchStart = undefined;
    for (
      let target = event.target instanceof Element ? event.target : null;
      target && target !== carousel;
      target = target.parentElement
    ) {
      if (
        target.scrollWidth > target.clientWidth &&
        ["auto", "scroll"].includes(getComputedStyle(target).overflowX)
      )
        return;
    }
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  },
  { passive: true },
);
carousel?.addEventListener(
  "touchend",
  (event) => {
    if (!touchStart) return;
    const x = event.changedTouches[0].clientX - touchStart.x;
    const y = event.changedTouches[0].clientY - touchStart.y;
    touchStart = undefined;
    if (Math.abs(x) > 32 && Math.abs(x) > Math.abs(y))
      select((current + (x < 0 ? 1 : slides.length - 1)) % slides.length);
  },
  { passive: true },
);
carousel?.addEventListener("touchcancel", () => {
  touchStart = undefined;
});
reduced.addEventListener("change", () => {
  if (carousel) carousel.scrollTo({ left: current * carousel.clientWidth, behavior: "instant" });
});
if (carousel)
  new ResizeObserver(() => {
    carousel.scrollLeft = current * carousel.clientWidth;
  }).observe(carousel);
carousel?.setAttribute("data-enhanced", "true");
select(0, false);
