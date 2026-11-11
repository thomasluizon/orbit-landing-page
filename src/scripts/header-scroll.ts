export {};

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('.header-links a[href^="#"]')
      : null;
  const hash = link?.getAttribute("href") ?? "";
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  event.preventDefault();
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  import("./programmatic-scroll").then(
    ({ scrollToElement }) => scrollToElement(target),
    () => target.scrollIntoView(),
  );
});
