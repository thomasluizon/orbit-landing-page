export {};

const section = document.getElementById("ios");
const email = document.getElementById("waitlist-email");

function focusWaitlist() {
  if (window.location.hash !== "#ios") return;
  section?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });
  email?.focus({ preventScroll: true });
}

document.querySelectorAll<HTMLElement>("[data-ios-trigger]").forEach((entry) => {
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.location.hash !== "#ios") window.history.pushState(null, "", "#ios");
    focusWaitlist();
  });
});
window.addEventListener("hashchange", focusWaitlist);
window.addEventListener("popstate", focusWaitlist);
focusWaitlist();
