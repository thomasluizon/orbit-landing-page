export {};

const section = document.getElementById("ios");
const email = document.getElementById("waitlist-email");

const loadScroll = () => import("./programmatic-scroll");

function focusWaitlist() {
  if (window.location.hash !== "#ios") return;
  if (section) {
    loadScroll().then(
      ({ scrollToElement }) => scrollToElement(section),
      () => section.scrollIntoView(),
    );
  }
  email?.focus({ preventScroll: true });
}

function findTrigger(event: Event) {
  return event.target instanceof Element && event.target.closest("[data-ios-trigger]");
}

for (const name of ["pointerdown", "focusin", "touchstart"]) {
  document.addEventListener(
    name,
    (event) => {
      if (findTrigger(event)) void loadScroll();
    },
    { passive: true },
  );
}
document.addEventListener("click", (event) => {
  if (!findTrigger(event)) return;
  event.preventDefault();
  if (window.location.hash !== "#ios") window.history.pushState(null, "", "#ios");
  focusWaitlist();
});
window.addEventListener("hashchange", focusWaitlist);
window.addEventListener("popstate", focusWaitlist);
focusWaitlist();
