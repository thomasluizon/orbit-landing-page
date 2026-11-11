import { demoDay } from "../config/product-examples";
import type { DemoCopy } from "../i18n/demo-copy";
import type { Language } from "../i18n/translations";
import { addDays, bilingual, formatDate, pageLanguage, type Bilingual } from "./clock-format";
import { copyElement, dayCellHtml, dayOutcome, readDemoCopy } from "./day-cell";
import { capitalize, dayKey, dayOffset, startOfWeek, weekdayLabels } from "./demo-dates";

function weekReadout(offset: number, date: Date, copy: DemoCopy): Bilingual {
  const marks = demoDay(offset);
  const outcome =
    offset > 0 ? "future" : dayOutcome({ done: marks?.done, scheduled: marks?.total });
  const template = outcome === "not-scheduled" ? "none" : outcome;
  return bilingual((language) => {
    const day =
      offset === 0
        ? copy[language]["week.today"]
        : capitalize(formatDate(date, language, { weekday: "long" }));
    return copy[language][`week.${template}`]
      .replace("{day}", day)
      .replace("{done}", String(marks?.done ?? 0))
      .replace("{total}", String(marks?.total ?? 0));
  });
}

/** Renders the seven days of the current week, Monday first, and one readout per day. */
export function weekHtml(today: Date, selectedKey: string, language: Language, copy: DemoCopy) {
  const start = startOfWeek(today);
  const letters = { en: weekdayLabels("en"), "pt-BR": weekdayLabels("pt-BR") };
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const cells = days.map((date, index) =>
    dayCellHtml(
      {
        date,
        today,
        selectedKey,
        weekday: bilingual((name) => letters[name][index]),
      },
      language,
      copy,
    ),
  );
  const readouts = days.map((date) =>
    copyElement(
      "span",
      weekReadout(dayOffset(today, date), date, copy),
      language,
      `data-week-readout="${dayKey(date)}"${dayKey(date) === selectedKey ? "" : " hidden"}`,
    ),
  );
  return { days: cells.join(""), readouts: readouts.join("") };
}

const steps: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** Draws the week card for `today` and lets a visitor pick a day by click or arrow keys. */
export function mountWeek(card: HTMLElement, today: Date) {
  const grid = card.querySelector<HTMLElement>("[data-week-days]");
  const readout = card.querySelector<HTMLElement>("[data-week-readouts]");
  if (!grid || !readout) return;
  const copy = readDemoCopy(card);
  let selected = dayKey(today);
  const render = (focus: boolean) => {
    const view = weekHtml(today, selected, pageLanguage(), copy);
    grid.innerHTML = view.days;
    readout.innerHTML = view.readouts;
    if (focus) grid.querySelector<HTMLElement>(`[data-day-key="${selected}"]`)?.focus();
  };
  const keys = () =>
    [...grid.querySelectorAll<HTMLElement>("[data-day-key]")].map((day) => day.dataset.dayKey!);
  grid.addEventListener("click", (event) => {
    const day = (event.target as Element).closest<HTMLElement>("[data-day-key]");
    if (!day) return;
    selected = day.dataset.dayKey!;
    render(grid.contains(document.activeElement));
  });
  grid.addEventListener("keydown", (event) => {
    const all = keys();
    const index = all.indexOf(selected);
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? all.length - 1
          : steps[event.key] === undefined
            ? undefined
            : Math.max(0, Math.min(all.length - 1, index + steps[event.key]));
    if (target === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    selected = all[target];
    render(true);
  });
  render(false);
  delete card.dataset.clockPending;
}
