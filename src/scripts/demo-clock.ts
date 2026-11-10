import { mountCalendar } from "./calendar";
import { pageLanguage, setCopy, setLabel } from "./day-cell";
import { clockLabel, clockText, type ClockKind } from "./demo-dates";
import { mountWeek } from "./week";

/** Sets every demo date, the phone clock, the week card and the calendar from one reading of `now`. */
export function applyDemoClock(root: ParentNode, now: Date) {
  const language = pageLanguage();
  root.querySelectorAll<HTMLElement>("[data-clock]").forEach((element) => {
    const kind = element.dataset.clock as ClockKind;
    setCopy(element, clockText(kind, now, Number(element.dataset.clockOffset ?? 0)), language);
  });
  root.querySelectorAll<HTMLElement>("[data-clock-label-en]").forEach((element) => {
    const templates = {
      en: element.dataset.clockLabelEn ?? "",
      "pt-BR": element.dataset.clockLabelPt ?? "",
    };
    setLabel(
      element,
      clockLabel(templates, now, Number(element.dataset.clockOffset ?? 0)),
      language,
    );
  });
  root.querySelectorAll<HTMLElement>("[data-week-card]").forEach((card) => mountWeek(card, now));
  root.querySelectorAll<HTMLElement>("[data-calendar]").forEach((card) => mountCalendar(card, now));
}

applyDemoClock(document, new Date());
