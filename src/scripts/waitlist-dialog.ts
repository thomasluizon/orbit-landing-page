const dialog = document.getElementById("ios") as HTMLDialogElement | null;
let trigger = document.getElementById("ios-trigger");
const closeButton = document.getElementById("ios-close");

function syncDialog() {
  if (!dialog) return;
  if (window.location.hash === "#ios" && !dialog.open) dialog.showModal();
  else if (window.location.hash !== "#ios" && dialog.open) dialog.close();
}

document.querySelectorAll<HTMLElement>("[data-ios-trigger]").forEach((entry) => {
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    trigger = entry;
    if (window.location.hash !== "#ios") window.history.pushState(null, "", "#ios");
    syncDialog();
  });
});
closeButton?.addEventListener("click", () => dialog?.close());
dialog?.addEventListener("close", () => {
  if (window.location.hash === "#ios") {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  trigger?.focus({ preventScroll: true });
});
window.addEventListener("hashchange", syncDialog);
window.addEventListener("popstate", syncDialog);
syncDialog();
