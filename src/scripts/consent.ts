import type { PostHog } from "@posthog/types";

type ConsentChoice = "accepted" | "declined";

declare global {
  interface WindowEventMap {
    "orbit:analytics-consent-granted": CustomEvent;
    "orbit:analytics-consent-revoked": CustomEvent;
    "orbit:analytics-ready": CustomEvent<PostHog>;
  }
}

const CONSENT_STORAGE_KEY = "orbit_analytics_consent";
const EXIT_DURATION_MS = 160;

const banner = document.getElementById("consent-banner");
const acceptButton = document.getElementById("consent-accept");
const declineButton = document.getElementById("consent-decline");
const preferencesButton = document.getElementById("cookie-preferences");
let analytics: PostHog | undefined;
let hideTimer: number | undefined;
let reopened = false;

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
  window.clearTimeout(hideTimer);
  banner.classList.remove("is-leaving");
  banner.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => banner.classList.add("is-visible"));
  });
}

function hideBanner() {
  if (!banner || banner.hidden) return;
  banner.classList.add("is-leaving");
  banner.classList.remove("is-visible");
  hideTimer = window.setTimeout(() => {
    banner.hidden = true;
    banner.classList.remove("is-leaving");
  }, EXIT_DURATION_MS);
  if (reopened) preferencesButton?.focus();
  reopened = false;
}

function scheduleAfterPageSettles(callback: () => void) {
  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 2000 });
    } else {
      setTimeout(callback, 0);
    }
  };

  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }
}

window.addEventListener("orbit:analytics-ready", (event) => {
  analytics = event.detail;
  if (readConsentChoice() === "declined") analytics.opt_out_capturing();
});

preferencesButton?.addEventListener("click", () => {
  reopened = true;
  showBanner();
  declineButton?.focus();
});

acceptButton?.addEventListener("click", () => {
  storeConsentChoice("accepted");
  window.dispatchEvent(new CustomEvent("orbit:analytics-consent-granted"));
  hideBanner();
});

declineButton?.addEventListener("click", () => {
  storeConsentChoice("declined");
  window.dispatchEvent(new CustomEvent("orbit:analytics-consent-revoked"));
  hideBanner();
});

const choice = readConsentChoice();
if (choice === "accepted") {
  window.dispatchEvent(new CustomEvent("orbit:analytics-consent-granted"));
} else if (choice === null && banner?.dataset?.analyticsEnabled !== "false") {
  scheduleAfterPageSettles(() => {
    if (readConsentChoice() === null) showBanner();
  });
}

document.addEventListener("click", (event) => {
  if (!analytics || readConsentChoice() !== "accepted" || !(event.target instanceof Element))
    return;
  const control = event.target.closest<HTMLElement>(
    "a[data-analytics-event], button[data-analytics-event]",
  );
  const eventName = control?.dataset.analyticsEvent;
  const surface = control?.dataset.analyticsSurface;
  if (!eventName || !surface) return;
  analytics.capture(eventName, { surface }, { transport: "sendBeacon", send_instantly: true });
});
