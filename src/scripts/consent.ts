import type { PostHog } from "@posthog/types";

type ConsentChoice = "accepted" | "declined";

declare global {
  interface WindowEventMap {
    "orbit:analytics-ready": CustomEvent<PostHog>;
  }
}

const CONSENT_STORAGE_KEY = "orbit_analytics_consent";
const EXIT_DURATION_MS = 160;

const banner = document.getElementById("consent-banner");
const acceptButton = document.getElementById("consent-accept");
const declineButton = document.getElementById("consent-decline");
let analytics: PostHog | undefined;

function readConsentChoice(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

function storeConsentChoice(choice: ConsentChoice) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {}
}

function showBanner() {
  if (!banner) return;
  banner.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => banner.classList.add("is-visible"));
  });
}

function hideBanner() {
  if (!banner || banner.hidden) return;
  banner.classList.add("is-leaving");
  banner.classList.remove("is-visible");
  window.setTimeout(() => {
    banner.hidden = true;
    banner.classList.remove("is-leaving");
  }, EXIT_DURATION_MS);
}

function enableCookiePersistence(client: PostHog) {
  client.set_config({
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: true,
  });
}

window.addEventListener("orbit:analytics-ready", (event) => {
  analytics = event.detail;
  const choice = readConsentChoice();
  if (choice === "accepted") {
    enableCookiePersistence(analytics);
  } else if (choice === null) {
    showBanner();
  }
});

acceptButton?.addEventListener("click", () => {
  if (!analytics) return;
  enableCookiePersistence(analytics);
  storeConsentChoice("accepted");
  hideBanner();
});

declineButton?.addEventListener("click", () => {
  storeConsentChoice("declined");
  hideBanner();
});

document.addEventListener("click", (event) => {
  if (!analytics || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[data-analytics-event]");
  const eventName = link?.dataset.analyticsEvent;
  const surface = link?.dataset.analyticsSurface;
  if (!eventName || !surface) return;
  analytics.capture(eventName, { surface }, { transport: "sendBeacon", send_instantly: true });
});
