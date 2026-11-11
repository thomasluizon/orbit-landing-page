export {};

const list = document.querySelector<HTMLElement>(".faq-list");
const items = [...document.querySelectorAll<HTMLDetailsElement>(".faq-list details")];
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const tokens = getComputedStyle(document.documentElement);
const running = new Map<HTMLDetailsElement, Animation[]>();

const expanded = (details: HTMLDetailsElement) =>
  details.open && !details.hasAttribute("data-closing");

function sync(details: HTMLDetailsElement) {
  details.querySelector("summary")?.setAttribute("aria-expanded", String(expanded(details)));
}

function settle(details: HTMLDetailsElement, open: boolean) {
  for (const animation of running.get(details) ?? []) animation.cancel();
  running.delete(details);
  details.style.removeProperty("overflow");
  details.removeAttribute("data-closing");
  details.open = open;
  sync(details);
}

function glide(details: HTMLDetailsElement, open: boolean) {
  const summary = details.querySelector("summary");
  const answer = details.querySelector("p");
  if (!summary || !answer) return settle(details, open);
  const from = details.getBoundingClientRect().height;
  for (const animation of running.get(details) ?? []) animation.cancel();
  details.open = true;
  const frame = details.offsetHeight - details.clientHeight;
  const to = open ? details.offsetHeight : summary.offsetHeight + frame;
  details.toggleAttribute("data-closing", !open);
  details.style.overflow = "clip";
  sync(details);
  const timing = {
    duration: Number.parseFloat(
      tokens.getPropertyValue(open ? "--duration-normal" : "--duration-fast"),
    ),
    easing: tokens.getPropertyValue(open ? "--ease-out" : "--ease-standard").trim(),
    fill: "forwards" as const,
  };
  const height = details.animate({ blockSize: [`${from}px`, `${to}px`] }, timing);
  const fade = answer.animate({ opacity: open ? [0, 1] : [1, 0] }, timing);
  running.set(details, [height, fade]);
  height.onfinish = () => settle(details, open);
}

function toggle(details: HTMLDetailsElement, open: boolean) {
  if (reduced.matches) settle(details, open);
  else glide(details, open);
}

for (const details of items) {
  details.removeAttribute("name");
  sync(details);
  details.addEventListener("toggle", () => {
    if (!running.has(details)) sync(details);
  });
}

list?.addEventListener("click", (event) => {
  const details =
    event.target instanceof Element ? event.target.closest("summary")?.parentElement : null;
  if (!(details instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  const open = !expanded(details);
  if (open)
    for (const other of items) if (other !== details && expanded(other)) toggle(other, false);
  toggle(details, open);
});
