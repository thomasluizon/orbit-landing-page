export {};

const section = document.getElementById("ios");
const email = document.getElementById("waitlist-email");

function focusWaitlist() {
  if (window.location.hash !== "#ios") return;
  if (section) {
    import("./programmatic-scroll").then(
      ({ scrollToElement }) => scrollToElement(section),
      () => section.scrollIntoView(),
    );
  }
  email?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const trigger = event.target instanceof Element && event.target.closest("[data-ios-trigger]");
  if (!trigger) return;
  event.preventDefault();
  if (window.location.hash !== "#ios") window.history.pushState(null, "", "#ios");
  focusWaitlist();
});
window.addEventListener("hashchange", focusWaitlist);
window.addEventListener("popstate", focusWaitlist);
focusWaitlist();
