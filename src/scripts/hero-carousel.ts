import { translations } from "../i18n/translations";
import { getLang } from "./i18n";

const stage = document.getElementById("hero-stage");
const carousel = stage?.querySelector<HTMLElement>("[data-phone-carousel]");
const slides = [...(stage?.querySelectorAll<HTMLElement>("[data-phone-slide]") ?? [])];
const segments = [...(stage?.querySelectorAll<HTMLButtonElement>("[data-carousel-segment]") ?? [])];
const playback = document.getElementById("hero-playback");
const mobile = window.matchMedia("(width < 768px)");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const duration = 6000;
let current = 0;
let visible = false;
let paused = false;
let interacted = false;
let timer: number | undefined;
let remaining = duration;
let started = 0;
let running = false;

try {
  interacted = sessionStorage.getItem("orbit-demo-interacted") === "true";
} catch {
  interacted = false;
}

function canAdvance() {
  return (
    mobile.matches && visible && !document.hidden && !reduced.matches && !paused && !interacted
  );
}

function renderPlayback() {
  if (!stage || !playback) return;
  stage.dataset.ambientRunning = String(visible && !document.hidden && !reduced.matches && !paused);
  stage.dataset.carouselRunning = String(running);
  stage.dataset.autoStopped = String(interacted);
  const key = paused ? "demo.resume" : "demo.pause";
  playback.setAttribute("aria-pressed", String(paused));
  playback.setAttribute("data-i18n-label", key);
  playback.setAttribute("aria-label", translations[getLang()][key]);
  playback.hidden = reduced.matches;
}

function syncTimer() {
  if (running) remaining = Math.max(0, remaining - (performance.now() - started));
  window.clearTimeout(timer);
  running = canAdvance();
  if (running) {
    started = performance.now();
    timer = window.setTimeout(() => select((current + 1) % slides.length), remaining);
  }
  renderPlayback();
}

function select(index: number, scroll = true) {
  window.clearTimeout(timer);
  running = false;
  current = index;
  remaining = duration;
  slides.forEach((slide, i) => {
    slide.inert = i !== current;
    slide.setAttribute("aria-hidden", String(i !== current));
  });
  segments.forEach((segment, i) => segment.setAttribute("aria-current", String(i === current)));
  const fill = segments[index]?.querySelector<HTMLElement>(".carousel-progress-fill");
  if (fill) {
    fill.style.animation = "none";
    void fill.offsetWidth;
    fill.style.animation = "";
  }
  if (scroll && carousel)
    carousel.scrollTo({
      left: index * carousel.clientWidth,
      behavior: reduced.matches ? "instant" : "smooth",
    });
  syncTimer();
}

function stopAutomatic() {
  interacted = true;
  try {
    sessionStorage.setItem("orbit-demo-interacted", "true");
  } catch {
    interacted = true;
  }
  syncTimer();
}

segments.forEach((segment, index) =>
  segment.addEventListener("click", () => {
    stopAutomatic();
    select(index);
  }),
);
for (const event of ["pointerdown", "focusin", "input"])
  stage?.querySelector(".hero-device")?.addEventListener(event, stopAutomatic, { passive: true });
let touchStart: { x: number; y: number } | undefined;
carousel?.addEventListener(
  "touchstart",
  (event) => {
    stopAutomatic();
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  },
  { passive: true },
);
carousel?.addEventListener(
  "touchend",
  (event) => {
    if (!touchStart || !mobile.matches) return;
    const x = event.changedTouches[0].clientX - touchStart.x;
    const y = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(x) > 32 && Math.abs(x) > Math.abs(y))
      select((current + (x < 0 ? 1 : slides.length - 1)) % slides.length);
    touchStart = undefined;
  },
  { passive: true },
);
playback?.addEventListener("click", () => {
  paused = !paused;
  syncTimer();
});
if (stage)
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncTimer();
  }).observe(stage);
document.addEventListener("visibilitychange", syncTimer);
window.addEventListener("pagehide", () => {
  visible = false;
  syncTimer();
});
window.addEventListener("pageshow", () => {
  const rect = stage?.getBoundingClientRect();
  visible = !!rect && rect.bottom > 0 && rect.top < window.innerHeight;
  syncTimer();
});
window.addEventListener("orbit:language-changed", renderPlayback);
reduced.addEventListener("change", syncTimer);
mobile.addEventListener("change", () => select(0));
if (carousel)
  new ResizeObserver(() => {
    carousel.scrollLeft = current * carousel.clientWidth;
  }).observe(carousel);
carousel?.setAttribute("data-enhanced", "true");
select(0, false);
