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
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onWaitlistTurnstileLoad";
const SCRIPT_LOAD_TIMEOUT_MS = 15000;
const SCRIPT_MAX_ATTEMPTS = 3;
const SCRIPT_RETRY_BASE_MS = 2000;
const WIDGET_RETRY_INTERVAL_MS = 8000;
const WIDGET_MAX_FAILURES = 3;

// https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
const ERROR_RETRYABLE: Record<string, boolean> = {
  "110100": false,
  "110110": false,
  "110200": false,
  "110600": true,
  "110620": true,
  "200100": false,
  "200500": true,
  "400020": false,
  "400021": false,
  "400070": false,
};
const RETRYABLE_ERROR_PREFIXES = ["300", "600"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Strings = Record<TranslationKey, string>;
type StatusKind = "success" | "challenge-error" | "submission-error";

interface Turnstile {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      size: "flexible" | "compact";
      retry: "auto";
      "retry-interval": number;
      "refresh-expired": "auto";
      "refresh-timeout": "auto";
      language: string;
      callback: (token: string) => void;
      "error-callback": (code: string) => boolean;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
    onWaitlistTurnstileLoad?: () => void;
  }
}

let turnstileToken = "";
let turnstileWidgetId: string | null = null;
let turnstileLoadPromise: Promise<Turnstile> | null = null;
let turnstileInitializationPromise: Promise<void> | null = null;
let submitting = false;
let statusKind: StatusKind = "success";
let scriptAttempts = 0;
let nextScriptAttemptAt = 0;
let renderAttempts = 0;
let nextRenderAttemptAt = 0;
let widgetFailures = 0;
let widgetStopped = false;
let widgetGeneration = 0;
let widgetConfiguration: ReturnType<typeof getWidgetConfiguration> | null = null;

function setStatus(message: string, kind: StatusKind) {
  if (!status) return;
  statusKind = kind;
  if (status.textContent !== message) status.textContent = message;
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
  if (!widgetStopped && turnstileWidgetId && window.turnstile)
    window.turnstile.reset(turnstileWidgetId);
}

function handleChallengeFailure() {
  const strings = translations[getLang()];
  setStatus(strings["ios.challengeFailed"], "challenge-error");
  turnstileToken = "";
  updateSubmitButton(strings);
  return true;
}

function isEmailValidationFailure(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  if (!("type" in payload) || payload.type !== "ValidationFailure" || !("errors" in payload))
    return false;
  const errors = payload.errors;
  return (
    typeof errors === "object" &&
    errors !== null &&
    "Email" in errors &&
    Array.isArray(errors.Email) &&
    errors.Email.length > 0
  );
}

function isChallengeFailure(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    payload.error === "Invalid verification token"
  );
}

function loadTurnstile(allowRetry: boolean): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoadPromise) return turnstileLoadPromise;
  if (
    scriptAttempts > 0 &&
    (!allowRetry || scriptAttempts >= SCRIPT_MAX_ATTEMPTS || Date.now() < nextScriptAttemptAt)
  ) {
    return Promise.reject(new Error("Turnstile script retry unavailable"));
  }
  scriptAttempts++;

  const loadPromise = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener("load", onScriptLoad);
      script.removeEventListener("error", onError);
      if (window.onWaitlistTurnstileLoad === onLoad) delete window.onWaitlistTurnstileLoad;
    };
    const fail = () => {
      cleanup();
      script.remove();
      nextScriptAttemptAt = Date.now() + SCRIPT_RETRY_BASE_MS * 2 ** (scriptAttempts - 1);
      reject(new Error("Turnstile failed to initialize"));
    };
    const onLoad = () => {
      if (!window.turnstile) return;
      cleanup();
      resolve(window.turnstile);
    };
    const onScriptLoad = () => onLoad();
    const onError = () => fail();
    const timeout = setTimeout(fail, SCRIPT_LOAD_TIMEOUT_MS);
    window.onWaitlistTurnstileLoad = onLoad;
    script.addEventListener("load", onScriptLoad);
    script.addEventListener("error", onError);
    document.head.append(script);
  });
  turnstileLoadPromise = loadPromise;
  void loadPromise.catch(() => {
    if (turnstileLoadPromise === loadPromise) turnstileLoadPromise = null;
  });
  return loadPromise;
}

function getWidgetConfiguration() {
  const width =
    turnstileContainer?.getBoundingClientRect().width || form?.getBoundingClientRect().width || 0;
  return {
    size: width < 300 ? ("compact" as const) : ("flexible" as const),
    language: getLang() === "pt-BR" ? "pt-br" : "en",
  };
}

function stopWidget() {
  widgetStopped = true;
  turnstileToken = "";
  updateSubmitButton(translations[getLang()]);
  queueMicrotask(() => {
    if (turnstileWidgetId && window.turnstile) {
      const id = turnstileWidgetId;
      turnstileWidgetId = null;
      window.turnstile.remove(id);
    }
  });
}

function handleWidgetError(code: string) {
  if (widgetStopped) return true;
  console.error("[Turnstile] error-callback", code);
  handleChallengeFailure();
  const retryable =
    ERROR_RETRYABLE[code] === true ||
    RETRYABLE_ERROR_PREFIXES.some((prefix) => code.startsWith(prefix));
  if (!retryable || ++widgetFailures >= WIDGET_MAX_FAILURES) stopWidget();
  return true;
}

function widgetCallbacks(generation: number) {
  const isCurrent = () => generation === widgetGeneration && !widgetStopped;
  return {
    callback: (token: string) => {
      if (!isCurrent()) return;
      turnstileToken = token;
      widgetFailures = 0;
      if (statusKind === "challenge-error") setStatus("", "success");
      updateSubmitButton(translations[getLang()]);
    },
    "error-callback": (code: string) => (isCurrent() ? handleWidgetError(code) : true),
    "expired-callback": () => {
      if (!isCurrent()) return;
      console.error("[Turnstile] expired-callback");
      turnstileToken = "";
      updateSubmitButton(translations[getLang()]);
    },
    "timeout-callback": () => {
      if (!isCurrent()) return;
      console.error("[Turnstile] timeout-callback");
      handleChallengeFailure();
    },
  };
}

function initializeTurnstile(allowRetry = false): Promise<void> {
  if (widgetStopped || turnstileWidgetId || turnstileInitializationPromise) {
    return turnstileInitializationPromise ?? Promise.resolve();
  }
  if (!turnstileContainer || !TURNSTILE_SITE_KEY) return Promise.resolve();
  if (
    renderAttempts > 0 &&
    (!allowRetry || renderAttempts >= SCRIPT_MAX_ATTEMPTS || Date.now() < nextRenderAttemptAt)
  ) {
    return Promise.resolve();
  }

  turnstileInitializationPromise = (async () => {
    try {
      const turnstile = await loadTurnstile(allowRetry);
      widgetConfiguration = getWidgetConfiguration();
      renderAttempts++;
      turnstileWidgetId = turnstile.render(turnstileContainer, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        ...widgetConfiguration,
        retry: "auto",
        "retry-interval": WIDGET_RETRY_INTERVAL_MS,
        "refresh-expired": "auto",
        "refresh-timeout": "auto",
        ...widgetCallbacks(++widgetGeneration),
      });
      renderAttempts = 0;
    } catch {
      nextRenderAttemptAt =
        Date.now() + SCRIPT_RETRY_BASE_MS * 2 ** Math.max(0, renderAttempts - 1);
      handleChallengeFailure();
    }
  })().finally(() => {
    turnstileInitializationPromise = null;
  });
  return turnstileInitializationPromise;
}

function refreshWidgetConfiguration() {
  if (widgetStopped || !turnstileWidgetId || !window.turnstile) return;
  const configuration = getWidgetConfiguration();
  if (
    configuration.language === widgetConfiguration?.language &&
    configuration.size === widgetConfiguration.size
  )
    return;
  widgetGeneration++;
  turnstileToken = "";
  updateSubmitButton(translations[getLang()]);
  const id = turnstileWidgetId;
  turnstileWidgetId = null;
  window.turnstile.remove(id);
  void initializeTurnstile();
}

if (form && emailInput && submitButton && status) {
  const startChallenge = () => void initializeTurnstile();
  emailInput.addEventListener("focus", startChallenge);
  emailInput.addEventListener("input", () => {
    updateSubmitButton(translations[getLang()]);
    void initializeTurnstile(true);
  });
  updateSubmitButton(translations[getLang()]);
  if (!TURNSTILE_SITE_KEY) handleChallengeFailure();
  window.addEventListener("orbit:language-changed", refreshWidgetConfiguration);
  window.addEventListener("resize", refreshWidgetConfiguration);
  window.addEventListener("orientationchange", refreshWidgetConfiguration);
  if (turnstileContainer && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(refreshWidgetConfiguration).observe(turnstileContainer);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const language = getLang();
    const strings = translations[language];
    const email = emailInput.value.trim();

    if (!EMAIL_PATTERN.test(email)) {
      setStatus(strings["ios.invalidEmail"], "submission-error");
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
        body: JSON.stringify({
          email,
          language,
          turnstileToken,
        }),
      });

      if (response.ok) {
        form.reset();
        setStatus(strings["ios.success"], "success");
      } else if (response.status === 400) {
        const payload: unknown = await response.json();
        const key = isEmailValidationFailure(payload)
          ? "ios.invalidEmail"
          : isChallengeFailure(payload)
            ? "ios.challengeFailed"
            : "ios.error";
        setStatus(
          strings[key],
          key === "ios.challengeFailed" ? "challenge-error" : "submission-error",
        );
      } else {
        setStatus(strings["ios.error"], "submission-error");
      }
    } catch {
      setStatus(strings["ios.error"], "submission-error");
    } finally {
      submitting = false;
      resetChallenge(strings);
    }
  });
}
