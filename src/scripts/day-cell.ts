import { demoDay } from "../config/product-examples";
import type { DemoCopy } from "../i18n/demo-copy";
import type { Language } from "../i18n/translations";
import { bilingual, bilingualDate, type Bilingual } from "./clock-format";
import { dayKey, dayOffset } from "./demo-dates";

/** The long weekday and date the app reads out for a day. */
export const weekdayDate: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

/** The app's day outcome, resolved from the logged and scheduled habit counts. */
export type DayOutcome = "full" | "partial" | "none" | "not-scheduled";

/** What a caller knows about one day: its date, today, the selected key and optional extras. */
export interface DayCellInput {
  date: Date;
  today: Date;
  selectedKey: string;
  weekday?: Bilingual;
  data?: Record<string, string | number>;
}

interface DayCellModel {
  key: string;
  day: number;
  label: Bilingual;
  weekday?: Bilingual;
  done?: number;
  scheduled: number;
  today: boolean;
  selected: boolean;
  future: boolean;
  loggable: boolean;
  data?: Record<string, string | number>;
}

function dayCellModel({ date, today, selectedKey, weekday, data }: DayCellInput): DayCellModel {
  const key = dayKey(date);
  const offset = dayOffset(today, date);
  const marks = demoDay(offset);
  return {
    key,
    day: date.getDate(),
    label: bilingualDate(date, weekdayDate),
    weekday,
    done: marks?.done,
    scheduled: marks?.total ?? 0,
    today: offset === 0,
    selected: key === selectedKey,
    future: offset > 0,
    loggable: offset >= -7 && offset <= 0,
    data,
  };
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

/** Reads the demo words the build wrote into `data-demo-copy`. */
export function readDemoCopy(element: HTMLElement): DemoCopy {
  return JSON.parse(element.dataset.demoCopy ?? "{}");
}

/** Picks one demo word in both languages. */
export function bilingualCopy(copy: DemoCopy, key: keyof DemoCopy["en"]): Bilingual {
  return bilingual((language) => copy[language][key]);
}

/** Escapes text for an HTML attribute or text node. */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function copyAttributes(value: Bilingual, prefix = "data-copy") {
  return `${prefix}-en="${escapeHtml(value.en)}" ${prefix}-pt="${escapeHtml(value["pt-BR"])}"`;
}

/** Renders a leaf element whose text follows the language toggle. */
export function copyElement(tag: string, value: Bilingual, language: Language, attributes = "") {
  return `<${tag}${attributes ? ` ${attributes}` : ""} ${copyAttributes(value)}>${escapeHtml(value[language])}</${tag}>`;
}

/** Resolves the app's outcome for a day: nothing scheduled, nothing logged, part done or all logged. */
export function dayOutcome({ done, scheduled }: { done?: number; scheduled?: number }): DayOutcome {
  if (!scheduled) return "not-scheduled";
  if (!done || done <= 0) return "none";
  return done >= scheduled ? "full" : "partial";
}

function dayCellName(cell: DayCellModel, language: Language, copy: DemoCopy) {
  const word = (name: DayWord) => copy[language][`calendar.dayCell.${name}`];
  const label = cell.selected
    ? `${cell.label[language]}, ${word("selected")}`
    : cell.label[language];
  if (cell.future) return `${label}, ${word("future")}`;
  const outcome = dayOutcome(cell);
  const parts = [`${label}, ${word(outcome === "not-scheduled" ? "notScheduled" : outcome)}`];
  if (cell.scheduled && cell.done !== undefined) {
    parts[0] += ` ${cell.done} ${word("of")} ${cell.scheduled}`;
  }
  if (cell.today) parts.push(word("today"));
  if (!cell.loggable) parts.push(word("readOnly"));
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
export function dayCellHtml(input: DayCellInput, language: Language, copy: DemoCopy) {
  const cell = dayCellModel(input);
  const outcome = dayOutcome(cell);
  const names = bilingual((name) => dayCellName(cell, name, copy));
  const data = Object.entries(cell.data ?? {})
    .map(([name, value]) => ` data-${name}="${escapeHtml(String(value))}"`)
    .join("");
  const circle = [
    "day-cell-circle",
    cell.selected ? "is-selected" : cell.loggable ? "is-raised" : "",
    cell.today || cell.selected ? "is-marked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const weekday = cell.weekday
    ? copyElement("span", cell.weekday, language, 'class="day-cell-weekday"')
    : "";
  return `<button type="button" class="day-cell" data-day-key="${cell.key}" data-outcome="${cell.future ? "future" : outcome}"${cell.today ? ' aria-current="date"' : ""} aria-pressed="${cell.selected}" tabindex="${cell.selected ? 0 : -1}" aria-label="${escapeHtml(names[language])}" ${copyAttributes(names, "data-copy-label")}${data}><span class="day-cell-body" aria-hidden="true">${weekday}<span class="${circle}">${disc(cell, outcome)}</span></span></button>`;
}

/** Writes a bilingual `aria-label` and its language toggle attributes. */
export function setLabel(element: HTMLElement, value: Bilingual, language: Language) {
  element.dataset.copyLabelEn = value.en;
  element.dataset.copyLabelPt = value["pt-BR"];
  element.setAttribute("aria-label", value[language]);
}
