import { clockText, pageLanguage, setCopy, type ClockKind } from "./clock-format";

/** The visitor's local date and time, read once for every demo on the page. */
export const demoNow = new Date();

const language = pageLanguage();
document.querySelectorAll<HTMLElement>("[data-clock]").forEach((element) => {
  const kind = element.dataset.clock as ClockKind;
  setCopy(element, clockText(kind, demoNow, Number(element.dataset.clockOffset ?? 0)), language);
});
