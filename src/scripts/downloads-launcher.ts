export {};

const toggle = document.getElementById("downloads-toggle");

function setOpen(open: boolean) {
  toggle?.setAttribute("aria-expanded", `${open}`);
  if (open) import("./downloads-panel").catch(() => undefined);
}

function openFromLink() {
  setOpen(true);
  toggle?.scrollIntoView({ block: "start" });
  toggle?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const opener =
    event.target instanceof Element &&
    event.target.closest('#downloads-toggle, a[href="#downloads"]');
  if (!opener) return;
  event.preventDefault();
  if (opener === toggle) setOpen(toggle.getAttribute("aria-expanded") !== "true");
  else openFromLink();
});
if (location.hash === "#downloads") openFromLink();
