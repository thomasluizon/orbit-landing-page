import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";

const form = document.getElementById("waitlist-form") as HTMLFormElement | null;
const emailInput = document.getElementById("waitlist-email") as HTMLInputElement | null;
const submitButton = document.getElementById("waitlist-submit") as HTMLButtonElement | null;
const submitLabel = document.getElementById("waitlist-submit-label");
const status = document.getElementById("waitlist-status");

const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.useorbit.org";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Strings = Record<TranslationKey, string>;

function setStatus(message: string, kind: "success" | "error") {
  if (!status) return;
  status.textContent = message;
  status.style.color = kind === "success" ? "var(--color-fg-1)" : "var(--color-status-bad)";
}

function setBusy(busy: boolean, strings: Strings) {
  if (!submitButton) return;
  submitButton.disabled = busy;
  if (submitLabel)
    submitLabel.textContent = busy ? strings["ios.submitting"] : strings["ios.button"];
}

if (form && emailInput && submitButton && status) {
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

    setBusy(true, strings);
    setStatus("", "success");

    try {
      const response = await fetch(`${API_URL}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language }),
      });

      if (response.ok) {
        form.reset();
        setStatus(strings["ios.success"], "success");
      } else {
        setStatus(strings["ios.error"], "error");
      }
    } catch {
      setStatus(strings["ios.error"], "error");
    } finally {
      setBusy(false, strings);
    }
  });
}
