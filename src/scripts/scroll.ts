const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let loading = false;
let active = true;
let dispose: (() => void) | undefined;

async function startMotion() {
  if (loading || motionPreference.matches) return;
  loading = true;
  try {
    const { mountLandingMotion } = await import("./landing-motion");
    if (active && !motionPreference.matches) dispose = mountLandingMotion();
    if (!dispose) loading = false;
  } catch {
    loading = false;
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
  dispose?.();
  dispose = undefined;
  loading = false;
});
window.addEventListener("pageshow", (event) => {
  active = true;
  if (event.persisted) void startMotion();
});
