export {};

let loading = false;
let active = true;
let dispose: (() => void) | undefined;

async function startMotion() {
  if (loading) return;
  loading = true;
  try {
    const { mountLandingMotion } = await import("./landing-motion");
    if (active) dispose = mountLandingMotion();
    if (!dispose) loading = false;
  } catch {
    loading = false;
  }
}

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    if (active) void startMotion();
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
