import { exampleDate, exampleExportFile } from "../config/product-examples";
const refreshers: (() => void)[] = [];

function bindMetrics(block: HTMLElement) {
  const days = Array.from(block.querySelectorAll<HTMLButtonElement>("[data-metric-day]"));
  const chart = block.querySelector<HTMLElement>("[data-metric-chart]");
  const readout = block.querySelector<HTMLElement>(".metric-readout");
  if (!days.length || !chart || !readout) return;
  let selected = days.length - 1;
  const position = () => {
    const day = days[selected];
    const bar = day.querySelector<HTMLElement>(".metric-bar");
    const left = Math.max(
      0,
      Math.min(
        day.offsetLeft + day.offsetWidth / 2 - readout.offsetWidth / 2,
        chart.clientWidth - readout.offsetWidth,
      ),
    );
    readout.style.left = `${left}px`;
    readout.style.top = `${(bar?.offsetTop ?? day.offsetTop) - readout.offsetHeight - 8}px`;
  };
  const render = (index: number, focus = false) => {
    selected = index;
    block.querySelectorAll<HTMLElement>("[data-metric-readout]").forEach((readout) => {
      readout.hidden = Number(readout.dataset.metricReadout) !== selected;
    });
    days.forEach((day, index) => {
      day.setAttribute("aria-checked", String(index === selected));
      day.tabIndex = index === selected ? 0 : -1;
      day
        .querySelector<HTMLElement>(".metric-bar")
        ?.setAttribute("data-selected", String(index === selected));
    });
    if (focus) days[selected].focus();
    position();
  };
  days.forEach((day, index) => {
    day.addEventListener("click", () => render(index));
    day.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (step === undefined && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      render(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? days.length - 1
            : (index + step! + days.length) % days.length,
        true,
      );
    });
  });
  new ResizeObserver(position).observe(chart);
  refreshers.push(position);
  render(selected);
}

document.querySelectorAll<HTMLElement>('[data-example-block="metrics"]').forEach(bindMetrics);
window.addEventListener("orbit:language-changed", () => refreshers.forEach((refresh) => refresh()));

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
    }),
  );
});

document.querySelectorAll<HTMLButtonElement>("[data-privacy-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = document.getElementById(button.dataset.privacyToggle ?? "");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
});
document.querySelector("[data-delete-cancel]")?.addEventListener("click", () => {
  document.querySelector<HTMLButtonElement>('[data-privacy-toggle="delete-example"]')?.click();
});
document.querySelector("[data-delete-example]")?.addEventListener("click", () => {
  document.querySelector<HTMLElement>("[data-delete-result]")?.removeAttribute("hidden");
  const actions = document.querySelector<HTMLElement>(".privacy-actions");
  if (actions) actions.hidden = true;
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
