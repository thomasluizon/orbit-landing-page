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
const MAX_PENDING_EVENTS = 20;
const MAX_EVENT_AGE_MS = 30_000;

type PendingEvent = { eventName: string; surface: string; queuedAt: number };
const pendingEvents: PendingEvent[] = [];
let expiryTimer: number | undefined;

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

function discardPendingEvents() {
  pendingEvents.length = 0;
  window.clearTimeout(expiryTimer);
  expiryTimer = undefined;
}

function expirePendingEvents() {
  window.clearTimeout(expiryTimer);
  const cutoff = performance.now() - MAX_EVENT_AGE_MS;
  while (pendingEvents[0] && pendingEvents[0].queuedAt <= cutoff) pendingEvents.shift();
  const oldest = pendingEvents[0];
  expiryTimer = oldest
    ? window.setTimeout(expirePendingEvents, oldest.queuedAt + MAX_EVENT_AGE_MS - performance.now())
    : undefined;
}

function captureEvent(eventName: string, surface: string) {
  analytics?.capture(eventName, { surface }, { transport: "sendBeacon", send_instantly: true });
}

window.addEventListener("orbit:analytics-ready", (event) => {
  analytics = event.detail;
  const choice = readConsentChoice();
  if (choice === "declined") analytics.opt_out_capturing();
  if (choice === "accepted") {
    expirePendingEvents();
    for (const { eventName, surface } of pendingEvents) captureEvent(eventName, surface);
  }
  discardPendingEvents();
});

window.addEventListener("orbit:analytics-consent-revoked", discardPendingEvents);
window.addEventListener("pagehide", discardPendingEvents);

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
  if (readConsentChoice() !== "accepted" || !(event.target instanceof Element)) return;
  const control = event.target.closest<HTMLElement>(
    "a[data-analytics-event], button[data-analytics-event]",
  );
  const eventName = control?.dataset.analyticsEvent;
  const surface = control?.dataset.analyticsSurface;
  if (!eventName || !surface) return;
  if (analytics) {
    captureEvent(eventName, surface);
  } else {
    pendingEvents.push({ eventName, surface, queuedAt: performance.now() });
    if (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.shift();
    expirePendingEvents();
  }
});
