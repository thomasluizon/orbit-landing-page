export {};

const loadPanel = () => import("./downloads-panel");

/** One delegated listener routes every press on a downloads opener to `activate()`, before and after the panel loads. */
document.addEventListener("click", (event) => {
  const opener =
    event.target instanceof Element &&
    event.target.closest<HTMLElement>('#downloads-toggle, a[href="#downloads"]');
  if (!opener) return;
  event.preventDefault();
  void loadPanel().then(({ activate }) => activate(opener));
});
if (location.hash === "#downloads") void loadPanel();
