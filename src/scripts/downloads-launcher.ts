export {};

let loading = false;
const loadPanel = () => {
  loading = true;
  document.getElementById("downloads-toggle")?.setAttribute("aria-expanded", "true");
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
  if (loading && opener.id === "downloads-toggle") return;
  loadPanel().then(({ activate }) => activate(opener), showList);
});
if (location.hash === "#downloads") loadPanel().catch(showList);
