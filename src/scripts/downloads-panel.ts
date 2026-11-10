export {};

const OPENER = 'a[href="#downloads"]';
const toggle = document.getElementById("downloads-toggle");
const panel = document.getElementById("downloads");
const hero = document.getElementById("hero-download");

function leadEntries() {
  const lead = hero?.dataset.downloadLead ?? "";
  const key = ({ dataset }: HTMLElement) => dataset.desktopDownload ?? dataset.downloadTarget ?? "";
  const rank = (entry: HTMLElement) => {
    if (key(entry) === lead) return 0;
    return key(entry).split("-")[0] === lead.split("-")[0] ? 1 : 2;
  };
  const entries = [...(panel?.querySelectorAll<HTMLElement>(".downloads-entry") ?? [])];
  panel?.querySelector(".downloads-list")?.append(...entries.sort((a, b) => rank(a) - rank(b)));
}

function setOpen(open: boolean) {
  if (!toggle || !panel) return;
  if (open) leadEntries();
  toggle.setAttribute("aria-expanded", String(open));
  panel.toggleAttribute("data-open", open);
}

const isOpen = () => panel?.hasAttribute("data-open") === true;

function close(returnFocus: boolean) {
  if (!isOpen()) return;
  setOpen(false);
  if (returnFocus) toggle?.focus();
}

function openFromLink() {
  setOpen(true);
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
  toggle?.scrollIntoView({ behavior, block: "start" });
  toggle?.focus({ preventScroll: true });
}

function targetIn(event: Event, selector: string) {
  return event.target instanceof Element && event.target.closest(selector) !== null;
}

if (toggle && panel) {
  toggle.addEventListener("click", () => setOpen(!isOpen()));
  document.addEventListener("click", (event) => {
    if (targetIn(event, OPENER)) {
      event.preventDefault();
      openFromLink();
      return;
    }
    if (targetIn(event, "#downloads a")) close(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    event.preventDefault();
    close(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!targetIn(event, `#downloads, #downloads-toggle, ${OPENER}`)) close(false);
  });
  panel.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !panel.contains(next) && next !== toggle) close(false);
  });
  if (window.location.hash === "#downloads") setOpen(true);
}
