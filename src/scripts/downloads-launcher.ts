export {};

let loading = false;
function expandToggle() {
  const toggle = document.getElementById("downloads-toggle");
  toggle?.setAttribute("aria-expanded", "true");
  return toggle;
}
const loadPanel = () => {
  loading = true;
  expandToggle();
  return import("./downloads-panel").finally(() => (loading = false));
};

function showList() {
  const toggle = expandToggle();
  document.getElementById("downloads")?.toggleAttribute("data-open", true);
  toggle?.scrollIntoView({ block: "start" });
}

document.addEventListener("click", (event) => {
  const opener =
    event.target instanceof Element &&
    event.target.closest<HTMLElement>('#downloads-toggle, a[href="#downloads"]');
  if (!opener) return;
  event.preventDefault();
  if (loading && opener.id === "downloads-toggle") return;
  loadPanel().then(({ activate }) => activate(opener), showList);
});
if (location.hash === "#downloads") loadPanel().catch(showList);
