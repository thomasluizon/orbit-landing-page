import { clockText, pageLanguage, setCopy, type ClockKind } from "./clock-format";

function applyDemoClock(root: ParentNode, now: Date) {
  const language = pageLanguage();
  root.querySelectorAll<HTMLElement>("[data-clock]").forEach((element) => {
    const kind = element.dataset.clock as ClockKind;
    setCopy(element, clockText(kind, now, Number(element.dataset.clockOffset ?? 0)), language);
  });
}

const now = new Date();
const pending = document.documentElement.dataset;
pending.demoClock = "pending";
applyDemoClock(document, now);

/** Resolves once the chart labels, the week cards and the calendars show the visitor's day. */
export const demoViews = import("./demo-views")
  .then(({ mountDemoViews }) => mountDemoViews(document, now))
  .finally(() => delete pending.demoClock);
