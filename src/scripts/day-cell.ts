import { translations, type Language } from "../i18n/translations";
import { demoLanguages, type Bilingual } from "./demo-dates";

/** The app's day outcome, resolved from the logged and scheduled habit counts. */
export type DayOutcome = "full" | "partial" | "none" | "not-scheduled";

/** One day as the app's `DayCell` draws it. */
export interface DayCellModel {
  key: string;
  day: number;
  label: Bilingual;
  weekday?: Bilingual;
  done?: number;
  scheduled?: number;
  today: boolean;
  selected: boolean;
  future: boolean;
  raised: boolean;
  readOnly: boolean;
  tabIndex: 0 | -1;
  data?: Record<string, string | number>;
}

type DayWord =
  | "none"
  | "partial"
  | "full"
  | "notScheduled"
  | "future"
  | "of"
  | "today"
  | "selected"
  | "readOnly";

function word(language: Language, name: DayWord) {
  return translations[language][`calendar.dayCell.${name}`];
}

/** Escapes text for an HTML attribute or text node. */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Renders `data-copy-en` and `data-copy-pt` so the language toggle can swap the text. */
export function copyAttributes(value: Bilingual, prefix = "data-copy") {
  return `${prefix}-en="${escapeHtml(value.en)}" ${prefix}-pt="${escapeHtml(value["pt-BR"])}"`;
}

/** Renders a leaf element whose text follows the language toggle. */
export function copyElement(tag: string, value: Bilingual, language: Language, attributes = "") {
  return `<${tag}${attributes ? ` ${attributes}` : ""} ${copyAttributes(value)}>${escapeHtml(value[language])}</${tag}>`;
}

/** Resolves the app's outcome for a day: nothing scheduled, nothing logged, part done or all logged. */
export function dayOutcome({ done, scheduled }: Pick<DayCellModel, "done" | "scheduled">) {
  if (!scheduled) return "not-scheduled";
  if (!done || done <= 0) return "none";
  return done >= scheduled ? "full" : "partial";
}

/** Builds the app's accessible name for a day cell in one language. */
export function dayCellName(cell: DayCellModel, language: Language) {
  const label = cell.selected
    ? `${cell.label[language]}, ${word(language, "selected")}`
    : cell.label[language];
  if (cell.future) return `${label}, ${word(language, "future")}`;
  const outcome = dayOutcome(cell);
  const parts = [
    `${label}, ${word(language, outcome === "not-scheduled" ? "notScheduled" : outcome)}`,
  ];
  if (cell.scheduled && cell.done !== undefined) {
    parts[0] += ` ${cell.done} ${word(language, "of")} ${cell.scheduled}`;
  }
  if (cell.today) parts.push(word(language, "today"));
  if (cell.readOnly) parts.push(word(language, "readOnly"));
  return parts.join(", ");
}

function partialArc(done: number, scheduled: number) {
  const sweep = Math.round(Math.max(0, Math.min(1, done / scheduled)) * 100);
  return `<svg class="day-cell-arc" viewBox="0 0 34 34" aria-hidden="true"><circle class="day-cell-track" cx="17" cy="17" r="16" /><circle class="day-cell-sweep" cx="17" cy="17" r="16" pathLength="100" stroke-dasharray="${sweep} 100" /></svg>`;
}

function disc(cell: DayCellModel, outcome: DayOutcome) {
  const numeral = `<span class="day-cell-numeral">${cell.day}</span>`;
  if (cell.future) return numeral;
  const arc = outcome === "partial" ? partialArc(cell.done ?? 0, cell.scheduled ?? 1) : "";
  return `<span class="day-cell-disc">${arc}${numeral}</span>`;
}

/** Renders one interactive day cell: weekday, date number, the app's day mark, today and selection. */
export function dayCellHtml(cell: DayCellModel, language: Language) {
  const outcome = dayOutcome(cell);
  const names = Object.fromEntries(
    demoLanguages.map((name) => [name, dayCellName(cell, name)]),
  ) as Bilingual;
  const data = Object.entries(cell.data ?? {})
    .map(([name, value]) => ` data-${name}="${escapeHtml(String(value))}"`)
    .join("");
  const circle = [
    "day-cell-circle",
    cell.selected ? "is-selected" : cell.raised ? "is-raised" : "",
    cell.today || cell.selected ? "is-marked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const weekday = cell.weekday
    ? copyElement("span", cell.weekday, language, 'class="day-cell-weekday"')
    : "";
  return `<button type="button" class="day-cell" data-day-key="${cell.key}" data-outcome="${cell.future ? "future" : outcome}"${cell.today ? ' aria-current="date"' : ""} aria-pressed="${cell.selected}" tabindex="${cell.tabIndex}" aria-label="${escapeHtml(names[language])}" ${copyAttributes(names, "data-copy-label")}${data}><span class="day-cell-body" aria-hidden="true">${weekday}<span class="${circle}">${disc(cell, outcome)}</span></span></button>`;
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

/** Writes a bilingual `aria-label` and its language toggle attributes. */
export function setLabel(element: HTMLElement, value: Bilingual, language: Language) {
  element.dataset.copyLabelEn = value.en;
  element.dataset.copyLabelPt = value["pt-BR"];
  element.setAttribute("aria-label", value[language]);
}
