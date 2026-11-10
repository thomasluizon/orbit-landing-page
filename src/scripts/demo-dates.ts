import type { Language } from "../i18n/translations";

/** Both landing languages, in the order every bilingual value uses. */
export const demoLanguages = ["en", "pt-BR"] as const satisfies readonly Language[];

/** One value per landing language. */
export type Bilingual = Record<Language, string>;

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

/** Uppercases the first character only, as the app does for weekday and month titles. */
export function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Returns the local `YYYY-MM-DD` key of a date. */
export function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parses a local `YYYY-MM-DD` key into a local midnight date. */
export function parseDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Returns the local midnight date `days` after `date`. */
export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Returns the first day of the month `months` after the month of `date`. */
export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Counts whole local days from `from` to `to`, independent of daylight saving changes. */
export function dayOffset(from: Date, to: Date) {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / 86_400_000);
}

/** Returns the Monday that starts the week of `date`, as the app does by default. */
export function startOfWeek(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
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

/** Narrow weekday labels from Monday to Sunday, as the app's month grid header shows them. */
export function weekdayLabels(language: Language) {
  return Array.from({ length: 7 }, (_, index) =>
    formatDate(new Date(2025, 0, 6 + index), language, { weekday: "narrow" }),
  );
}

/** The demo values that follow the visitor's clock. */
export type ClockKind = "chart" | "today" | "time";

/** Formats one demo clock value in both languages for the day `offset` days from `now`. */
export function clockText(kind: ClockKind, now: Date, offset = 0): Bilingual {
  if (kind === "time") return { en: statusTime(now, "en"), "pt-BR": statusTime(now, "pt-BR") };
  const date = addDays(now, offset);
  return kind === "today"
    ? bilingualDate(date, { day: "numeric", month: "long" })
    : bilingualDate(date, { weekday: "short", day: "numeric", month: "short" });
}

/** Fills a `{date}` label template with the chart date of the day `offset` days from `now`. */
export function clockLabel(templates: Bilingual, now: Date, offset: number): Bilingual {
  const date = clockText("chart", now, offset);
  return {
    en: templates.en.replace("{date}", date.en),
    "pt-BR": templates["pt-BR"].replace("{date}", date["pt-BR"]),
  };
}
