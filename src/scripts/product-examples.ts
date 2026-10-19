import { toggleHabitCompletion } from "./habit-completion";
const notifyLayoutChange = () => window.dispatchEvent(new CustomEvent("orbit:layout-changed"));

document.querySelectorAll<HTMLElement>("[data-week-chart]").forEach((chart) => {
  const card = chart.closest(".product-card");
  chart.querySelectorAll<HTMLButtonElement>("[data-week-day]").forEach((day) => {
    day.addEventListener("click", () => {
      chart
        .querySelectorAll("[data-week-day]")
        .forEach((bar) => bar.setAttribute("aria-pressed", String(bar === day)));
      card?.querySelectorAll<HTMLElement>("[data-week-readout]").forEach((readout) => {
        readout.hidden = readout.dataset.weekReadout !== day.dataset.weekDay;
      });
    });
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-habit-toggle]").forEach((row) => {
  row.addEventListener("click", () => toggleHabitCompletion(row));
});

document.querySelectorAll<HTMLElement>(".orbit-calendar").forEach((calendar) => {
  const days = [...calendar.querySelectorAll<HTMLButtonElement>("[data-calendar-day]")];
  days.forEach((day) =>
    day.addEventListener("click", () => {
      days.forEach((item) => item.setAttribute("aria-pressed", String(item === day)));
      const readout = calendar.querySelector<HTMLElement>("[data-calendar-readout]");
      if (readout) {
        readout.dataset.copyEn = day.dataset.copyLabelEn;
        readout.dataset.copyPt = day.dataset.copyLabelPt;
        readout.textContent =
          document.documentElement.lang === "pt-BR"
            ? (day.dataset.copyLabelPt ?? "")
            : (day.dataset.copyLabelEn ?? "");
      }
      const events = calendar.querySelector<HTMLElement>("[data-calendar-events]");
      if (events) events.hidden = day.dataset.calendarDay !== "17";
      notifyLayoutChange();
    }),
  );
});
