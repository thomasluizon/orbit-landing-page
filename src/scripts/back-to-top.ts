export {};

const topButton = document.getElementById("back-to-top");
const hero = document.getElementById("hero");
const footer = document.querySelector(".product-footer");
const banner = document.getElementById("consent-banner");
let pastHero = false;
let footerVisible = false;
function renderBackToTop() {
  if (topButton)
    topButton.hidden = !pastHero || footerVisible || (banner !== null && !banner.hidden);
}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.target === hero)
      pastHero = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    if (entry.target === footer) footerVisible = entry.isIntersecting;
  }
  renderBackToTop();
});
if (hero) observer.observe(hero);
if (footer) observer.observe(footer);
if (banner)
  new MutationObserver(renderBackToTop).observe(banner, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
topButton?.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
  document
    .querySelector<HTMLAnchorElement>(".header-content .brand")
    ?.focus({ preventScroll: true });
});
