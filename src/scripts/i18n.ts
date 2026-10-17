import { LANGUAGES, translations, type Language } from "../i18n/translations";

import { offersFor, formatPrice } from "../config/pricing";

const COOKIE_KEY = "orbit_lang";

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

export function getLang(): Language {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  const stored = cookie?.split("=")[1];
  if (stored && isLanguage(stored)) return stored;
  return navigator.language.startsWith("pt") ? "pt-BR" : "en";
}

function setLangCookie(lang: Language) {
  document.cookie = `${COOKIE_KEY}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`;
}

function applyTranslations(lang: Language) {
  document.documentElement.lang = lang === "pt-BR" ? "pt-BR" : "en";
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
  document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    const value = key ? table[key] : undefined;
    if (value !== undefined) element.setAttribute("placeholder", value);
  });
  document.querySelectorAll<HTMLElement>("[data-copy-en]").forEach((element) => {
    element.textContent =
      (lang === "pt-BR" ? element.dataset.copyPt : element.dataset.copyEn) ?? "";
  });
  document.querySelectorAll<HTMLElement>("[data-copy-label-en]").forEach((element) => {
    element.setAttribute(
      "aria-label",
      (lang === "pt-BR" ? element.dataset.copyLabelPt : element.dataset.copyLabelEn) ?? "",
    );
  });
  document.querySelectorAll<HTMLElement>("[data-price]").forEach((element) => {
    const period = element.dataset.price;
    if (period === "monthly" || period === "yearly" || period === "free")
      element.textContent = formatPrice(lang, period);
  });
  applyAttributes(lang);
  applyStructuredData(lang);
  const label = document.getElementById("lang-label");
  if (label) label.textContent = lang === "pt-BR" ? "pt-BR" : "EN";
  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.setAttribute("aria-label", translations[lang]["language.switch"]);
  }
  document.documentElement.lang = lang;
}

function applyAttributes(lang: Language) {
  const table: Record<string, string> = translations[lang];
  for (const [selector, keyAttribute, attribute] of [
    ["[data-i18n-label]", "data-i18n-label", "aria-label"],
    ["[data-i18n-content]", "data-i18n-content", "content"],
  ]) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const key = element.getAttribute(keyAttribute);
      if (key && table[key]) element.setAttribute(attribute, table[key]);
    });
  }
}

function applyStructuredData(lang: Language) {
  const table = translations[lang];
  document
    .querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
    .forEach((script) => {
      const data = JSON.parse(script.textContent || "{}");
      if (data["@graph"]) {
        for (const entry of data["@graph"]) {
          if (entry.offers) {
            entry.offers = offersFor(lang);
            entry.description = table["meta.description"];
          }
        }
      }
      script.textContent = JSON.stringify(data);
    });
}

let currentLang = getLang();
setLangCookie(currentLang);
applyTranslations(currentLang);

document.getElementById("lang-toggle")?.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "pt-BR" : "en";
  setLangCookie(currentLang);
  applyTranslations(currentLang);
});
