import type { Language } from "../i18n/translations";

/** Both landing languages, in the order every bilingual value uses. */
export const demoLanguages = ["en", "pt-BR"] as const satisfies readonly Language[];

/** One value per landing language. */
export type Bilingual = Record<Language, string>;

/** The demo values that follow the visitor's clock. */
export type ClockKind = "chart" | "today" | "time";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(language: Language, options: Intl.DateTimeFormatOptions) {
  const key = `${language}:${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(language, options);
    formatters.set(key, cached);
  }
  return cached;
}

/** Formats a local date for one language through a cached `Intl.DateTimeFormat`. */
export function formatDate(date: Date, language: Language, options: Intl.DateTimeFormatOptions) {
  return formatter(language, options).format(date);
}

/** Formats a local date in both landing languages. */
export function bilingualDate(date: Date, options: Intl.DateTimeFormatOptions): Bilingual {
  return { en: formatDate(date, "en", options), "pt-BR": formatDate(date, "pt-BR", options) };
}

/** Returns the local midnight date `days` after `date`. */
export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Formats the phone status bar time without a day period, as a phone shows it. */
export function statusTime(date: Date, language: Language) {
  return formatter(language, { hour: "numeric", minute: "2-digit" })
    .formatToParts(date)
    .filter(({ type }) => type !== "dayPeriod")
    .map(({ value }) => value)
    .join("")
    .trim();
}

/** Formats one demo clock value in both languages for the day `offset` days from `now`. */
export function clockText(kind: ClockKind, now: Date, offset = 0): Bilingual {
  if (kind === "time") return { en: statusTime(now, "en"), "pt-BR": statusTime(now, "pt-BR") };
  const date = addDays(now, offset);
  return kind === "today"
    ? bilingualDate(date, { day: "numeric", month: "long" })
    : bilingualDate(date, { weekday: "short", day: "numeric", month: "short" });
}

/** Returns the language the page shows now. */
export function pageLanguage(): Language {
  return document.documentElement.lang === "pt-BR" ? "pt-BR" : "en";
}

/** Writes a bilingual text and its language toggle attributes. */
export function setCopy(element: HTMLElement, value: Bilingual, language: Language) {
  element.dataset.copyEn = value.en;
  element.dataset.copyPt = value["pt-BR"];
  element.textContent = value[language];
}
