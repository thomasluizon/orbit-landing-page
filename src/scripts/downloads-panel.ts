export {};

const toggle = document.getElementById("downloads-toggle");
const panel = document.getElementById("downloads-panel");

function targetIn(event: Event, selector: string) {
  return event.target instanceof Element && event.target.closest(selector) !== null;
}

if (toggle && panel) {
  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
  const close = (returnFocus: boolean) => {
    if (!isOpen()) return;
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  };
  document.addEventListener("click", (event) => {
    if (targetIn(event, "#downloads a")) close(panel.contains(document.activeElement));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    event.preventDefault();
    close(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!targetIn(event, '#downloads, a[href="#downloads"]')) close(false);
  });
  panel.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !panel.contains(next) && next !== toggle) close(false);
  });
}
