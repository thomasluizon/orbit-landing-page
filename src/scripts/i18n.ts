import { LANGUAGES, translations, type Language } from "../i18n/translations";

const COOKIE_KEY = "orbit_lang";

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

function getLang(): Language {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  const stored = cookie?.split("=")[1];
  if (stored && isLanguage(stored)) return stored;
  return navigator.language.startsWith("pt") ? "pt-BR" : "en";
}

function setLangCookie(lang: Language) {
  document.cookie = `${COOKIE_KEY}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`;
}

function applyTranslations(lang: Language) {
  const table: Record<string, string> = translations[lang];
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const value = key ? table[key] : undefined;
    if (value !== undefined) {
      element.textContent = value;
    } else if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing key "${key}" for "${lang}"`);
    }
  });
  const label = document.getElementById("lang-label");
  if (label) label.textContent = lang === "pt-BR" ? "PT" : "EN";
  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.setAttribute(
      "aria-label",
      lang === "pt-BR" ? "Mudar para Inglês" : "Switch to Portuguese",
    );
  }
  document.documentElement.lang = lang;
}

let currentLang = getLang();
setLangCookie(currentLang);
applyTranslations(currentLang);

document.getElementById("lang-toggle")?.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "pt-BR" : "en";
  setLangCookie(currentLang);
  applyTranslations(currentLang);
});
