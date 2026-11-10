import type { Language } from "../i18n/translations";
import { addDays, clockText, formatDate, type Bilingual } from "./clock-format";

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

/** Narrow weekday labels from Monday to Sunday, as the app's month grid header shows them. */
export function weekdayLabels(language: Language) {
  return Array.from({ length: 7 }, (_, index) =>
    formatDate(new Date(2025, 0, 6 + index), language, { weekday: "narrow" }),
  );
}

/** Fills a `{date}` label template with the chart date of the day `offset` days from `now`. */
export function clockLabel(templates: Bilingual, now: Date, offset: number): Bilingual {
  const date = clockText("chart", now, offset);
  return {
    en: templates.en.replace("{date}", date.en),
    "pt-BR": templates["pt-BR"].replace("{date}", date["pt-BR"]),
  };
}
