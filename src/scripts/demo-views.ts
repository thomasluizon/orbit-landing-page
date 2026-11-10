import { mountCalendar } from "./calendar";
import { pageLanguage } from "./clock-format";
import { setLabel } from "./day-cell";
import { clockLabel } from "./demo-dates";
import { mountWeek } from "./week";

/** Labels the chart bars, then draws the week cards and the calendars for `now`. */
export function mountDemoViews(root: ParentNode, now: Date) {
  const language = pageLanguage();
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
