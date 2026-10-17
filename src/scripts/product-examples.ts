import { getLang } from "./i18n";

const refreshers: (() => void)[] = [];

function localized(element: HTMLElement, key: string) {
  return element.dataset[`${key}${getLang() === "pt-BR" ? "Pt" : "En"}`] ?? "";
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}

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

function bindHabits(block: HTMLElement) {
  const logs = Array.from(block.querySelectorAll<HTMLButtonElement>("[data-example-log]"));
  const count = block.querySelector<HTMLElement>("[data-example-count]");
  const render = () => {
    for (const button of logs) {
      const key = button.getAttribute("aria-pressed") === "true" ? "undo" : "log";
      button.setAttribute("aria-label", localized(button, key));
    }
    if (count)
      count.textContent = fill(localized(count, "template"), {
        done: String(
          logs.filter((button) => button.getAttribute("aria-pressed") === "true").length,
        ),
        total: String(logs.length),
      });
  };
  for (const button of logs)
    button.addEventListener("click", () => {
      button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
      render();
    });
  refreshers.push(render);
  render();
}

function renderBreakdown(block: HTMLElement) {
  block.querySelectorAll<HTMLElement>("[data-frequency]").forEach((row, index) => {
    const text = localized(row, row.dataset.cadence ?? "daily");
    const control = row.querySelector<HTMLButtonElement>(".frequency-control");
    const result = block.querySelector<HTMLElement>(`[data-result-frequency="${index}"]`);
    if (control) control.textContent = text;
    if (result) result.textContent = text;
  });
  const state = block.dataset.state;
  const status = block.querySelector<HTMLElement>("[data-breakdown-status]");
  if (status)
    status.textContent =
      state === "approved" || state === "rejected" ? localized(block, state) : "";
}

function setBreakdownState(block: HTMLElement, state: "proposed" | "approved" | "rejected") {
  block.dataset.state = state;
  const proposal = block.querySelector<HTMLElement>("[data-breakdown-proposal]");
  const result = block.querySelector<HTMLElement>("[data-breakdown-result]");
  if (proposal) proposal.hidden = state !== "proposed";
  if (result) result.hidden = state !== "approved";
  renderBreakdown(block);
  block
    .querySelector<HTMLButtonElement>(
      state === "proposed" ? ".frequency-control" : ".breakdown-reset",
    )
    ?.focus();
}

function bindBreakdown(block: HTMLElement) {
  const rows = block.querySelectorAll<HTMLElement>("[data-frequency]");
  rows.forEach((row) =>
    row.querySelector<HTMLButtonElement>(".frequency-control")?.addEventListener("click", () => {
      row.dataset.cadence = row.dataset.cadence === "daily" ? "weekly" : "daily";
      renderBreakdown(block);
    }),
  );
  for (const state of ["approved", "rejected"] as const) {
    const selector = state === "approved" ? ".breakdown-approve" : ".breakdown-reject";
    block
      .querySelector<HTMLButtonElement>(selector)
      ?.addEventListener("click", () => setBreakdownState(block, state));
  }
  block
    .querySelector<HTMLButtonElement>(".breakdown-edit")
    ?.addEventListener("click", () =>
      rows[0]?.querySelector<HTMLButtonElement>(".frequency-control")?.focus(),
    );
  block.querySelector<HTMLButtonElement>(".breakdown-reset")?.addEventListener("click", () => {
    rows.forEach((row) => {
      row.dataset.cadence = row.dataset.initialCadence;
    });
    setBreakdownState(block, "proposed");
  });
  refreshers.push(() => renderBreakdown(block));
  renderBreakdown(block);
}

document.querySelectorAll<HTMLElement>('[data-example-block="metrics"]').forEach(bindMetrics);
document.querySelectorAll<HTMLElement>('[data-example-block="habits"]').forEach(bindHabits);
document.querySelectorAll<HTMLElement>('[data-example-block="breakdown"]').forEach(bindBreakdown);
window.addEventListener("orbit:language-changed", () => refreshers.forEach((refresh) => refresh()));
