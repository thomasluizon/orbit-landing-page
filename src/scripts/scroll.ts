export {};

let loading = false;
let active = true;
let generation = 0;
let motionRequested = false;
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
      removeMotionListeners();
    }
  } catch {
    if (current === generation) loading = false;
  }
}

function removeMotionListeners() {
  for (const event of ["scroll", "wheel", "touchstart", "keydown"]) {
    window.removeEventListener(event, startMotion);
  }
}

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    window.addEventListener("scroll", startMotion, { passive: true });
    window.addEventListener("wheel", startMotion, { passive: true });
    window.addEventListener("touchstart", startMotion, { passive: true });
    window.addEventListener("keydown", startMotion);
  });
});
window.addEventListener("pagehide", () => {
  active = false;
  generation++;
  dispose?.();
  dispose = undefined;
  loading = false;
});
window.addEventListener("pageshow", (event) => {
  active = true;
  if (event.persisted && motionRequested) void startMotion();
});
