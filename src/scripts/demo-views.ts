import { mountCalendar } from "./calendar";
import { pageLanguage } from "./clock-format";
import { setLabel } from "./day-cell";
import { demoNow } from "./demo-clock";
import { clockLabel } from "./demo-dates";

const language = pageLanguage();
document.querySelectorAll<HTMLElement>("[data-clock-label-en]").forEach((element) => {
  const templates = {
    en: element.dataset.clockLabelEn ?? "",
    "pt-BR": element.dataset.clockLabelPt ?? "",
  };
  const offset = Number(element.dataset.clockOffset ?? 0);
  setLabel(element, clockLabel(templates, demoNow, offset), language);
});
document
  .querySelectorAll<HTMLElement>("[data-calendar]")
  .forEach((card) => mountCalendar(card, demoNow));
