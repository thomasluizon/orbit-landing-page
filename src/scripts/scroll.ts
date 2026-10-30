export {};

let loading = false;
let active = true;
let generation = 0;
let motionRequested = false;
let floatLoading = false;
let disposeFloat: (() => void) | undefined;
let dispose: (() => void) | undefined;

async function startMotion() {
  if (!active || loading) return;
  motionRequested = true;
  loading = true;
  const current = generation;
  try {
    const { mountLandingMotion } = await import("./landing-motion");
    if (active && current === generation) {
      dispose = mountLandingMotion();
      if (!dispose) loading = false;
    }
  } catch {
    if (current === generation) loading = false;
  }
}

async function startHeroFloat() {
  if (!active || floatLoading) return;
  const stage = document.getElementById("hero-stage");
  if (!stage) return;
  floatLoading = true;
  const current = generation;
  try {
    const { mountHeroFloat } = await import("./hero-float");
    if (active && current === generation) disposeFloat = mountHeroFloat(stage);
  } catch {
    if (current === generation) floatLoading = false;
  }
}

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    void startHeroFloat();
    window.addEventListener("scroll", startMotion, { passive: true });
    window.addEventListener("wheel", startMotion, { passive: true });
    window.addEventListener("touchstart", startMotion, { passive: true });
    window.addEventListener("keydown", startMotion);
  });
});
window.addEventListener("pagehide", () => {
  active = false;
  generation++;
  disposeFloat?.();
  disposeFloat = undefined;
  floatLoading = false;
  dispose?.();
  dispose = undefined;
  loading = false;
});
window.addEventListener("pageshow", (event) => {
  active = true;
  if (event.persisted) {
    void startHeroFloat();
    if (motionRequested) void startMotion();
  }
});
