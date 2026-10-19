import { exampleDate, exampleExportFile } from "../config/product-examples";
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
  row.addEventListener("click", () => {
    const done = row.getAttribute("aria-pressed") !== "true";
    row.setAttribute("aria-pressed", String(done));
    row.querySelector(".status-ring")?.classList.toggle("is-done", done);
  });
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

document.querySelectorAll<HTMLButtonElement>("[data-privacy-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = document.getElementById(button.dataset.privacyToggle ?? "");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    notifyLayoutChange();
  });
});
document.querySelector("[data-delete-cancel]")?.addEventListener("click", () => {
  document.querySelector<HTMLButtonElement>('[data-privacy-toggle="delete-example"]')?.click();
});
document.querySelector("[data-delete-example]")?.addEventListener("click", () => {
  document.querySelector<HTMLElement>("[data-delete-result]")?.removeAttribute("hidden");
  const actions = document.querySelector<HTMLElement>(".privacy-actions");
  if (actions) actions.hidden = true;
  notifyLayoutChange();
});

document.querySelector("[data-download-example]")?.addEventListener("click", () => {
  const data = {
    exportedAtUtc: exampleDate,
    habits: [{ title: "Walk" }, { title: "Drink water" }],
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exampleExportFile;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
