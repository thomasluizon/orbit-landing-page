import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";

const form = document.getElementById("waitlist-form") as HTMLFormElement | null;
const emailInput = document.getElementById("waitlist-email") as HTMLInputElement | null;
const submitButton = document.getElementById("waitlist-submit") as HTMLButtonElement | null;
const submitLabel = document.getElementById("waitlist-submit-label");
const status = document.getElementById("waitlist-status");
const turnstileContainer = document.getElementById("waitlist-turnstile");

const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.useorbit.org";
const TURNSTILE_SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Strings = Record<TranslationKey, string>;

interface Turnstile {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      size: "flexible";
      language: string;
      callback: (token: string) => void;
      "error-callback": () => boolean;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let turnstileToken = "";
let turnstileWidgetId: string | null = null;
let turnstileLoadPromise: Promise<Turnstile> | null = null;
let submitting = false;

function setStatus(message: string, kind: "success" | "error") {
  if (!status) return;
  status.textContent = message;
  status.style.color = kind === "success" ? "var(--color-fg-1)" : "var(--color-status-bad)";
}

function updateSubmitButton(strings: Strings) {
  if (!submitButton) return;
  submitButton.disabled = submitting || !turnstileToken;
  if (submitLabel)
    submitLabel.textContent = submitting ? strings["ios.submitting"] : strings["ios.button"];
}

function resetChallenge(strings: Strings) {
  turnstileToken = "";
  updateSubmitButton(strings);
  if (turnstileWidgetId && window.turnstile) window.turnstile.reset(turnstileWidgetId);
}

function handleChallengeFailure() {
  const strings = translations[getLang()];
  setStatus(strings["ios.challengeFailed"], "error");
  resetChallenge(strings);
  return true;
}

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize"));
    });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    document.head.append(script);
  });

  return turnstileLoadPromise;
}

async function initializeTurnstile() {
  if (turnstileWidgetId || !turnstileContainer || !TURNSTILE_SITE_KEY) {
    if (!TURNSTILE_SITE_KEY) handleChallengeFailure();
    return;
  }

  try {
    const turnstile = await loadTurnstile();
    turnstileWidgetId = turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      size: "flexible",
      language: getLang(),
      callback: (token) => {
        turnstileToken = token;
        updateSubmitButton(translations[getLang()]);
      },
      "error-callback": handleChallengeFailure,
      "expired-callback": handleChallengeFailure,
      "timeout-callback": handleChallengeFailure,
    });
  } catch {
    handleChallengeFailure();
  }
}

if (form && emailInput && submitButton && status && turnstileContainer) {
  const startChallenge = () => void initializeTurnstile();
  emailInput.addEventListener("focus", startChallenge, { once: true });
  emailInput.addEventListener("input", startChallenge, { once: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const language = getLang();
    const strings = translations[language];
    const email = emailInput.value.trim();

    if (!EMAIL_PATTERN.test(email)) {
      setStatus(strings["ios.invalidEmail"], "error");
      emailInput.focus();
      return;
    }

    if (!turnstileToken) {
      handleChallengeFailure();
      return;
    }

    submitting = true;
    updateSubmitButton(strings);
    setStatus("", "success");

    try {
      const response = await fetch(`${API_URL}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language, turnstileToken }),
      });

      if (response.ok) {
        form.reset();
        setStatus(strings["ios.success"], "success");
      } else if (response.status === 400) {
        setStatus(strings["ios.challengeFailed"], "error");
      } else {
        setStatus(strings["ios.error"], "error");
      }
    } catch {
      setStatus(strings["ios.error"], "error");
    } finally {
      submitting = false;
      resetChallenge(strings);
    }
  });
}
