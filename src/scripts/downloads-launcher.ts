export {};

/** True while the panel chunk loads, so a second press cannot undo the open the first one queued. */
let loading = false;
const loadPanel = () => {
  loading = true;
  return import("./downloads-panel").finally(() => (loading = false));
};

function showList() {
  const toggle = document.getElementById("downloads-toggle");
  toggle?.setAttribute("aria-expanded", "true");
  document.getElementById("downloads")?.toggleAttribute("data-open", true);
  toggle?.scrollIntoView({ block: "start" });
}

document.addEventListener("click", (event) => {
  const opener =
    event.target instanceof Element &&
    event.target.closest<HTMLElement>('#downloads-toggle, a[href="#downloads"]');
  if (!opener) return;
  event.preventDefault();
  if (loading) return;
  loadPanel().then(({ activate }) => activate(opener), showList);
});
if (location.hash === "#downloads") loadPanel().catch(showList);
