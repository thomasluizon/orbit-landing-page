import { landingCopy, type LandingKey } from "../i18n/translations";
import { getLang } from "./i18n";

const refreshers: (() => void)[] = [];

function fill(key: LandingKey, values: Record<string, string>) {
  return landingCopy[getLang()][key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}

function bindMetrics(block: HTMLElement) {
  const range = block.querySelector<HTMLInputElement>("[data-metric-day]");
  if (!range) return;
  const render = () => {
    block.querySelectorAll<HTMLElement>("[data-metric-readout]").forEach((readout) => {
      readout.hidden = readout.dataset.metricReadout !== range.value;
    });
    block.querySelectorAll<HTMLElement>("[data-metric-bar]").forEach((bar) => {
      bar.setAttribute("data-selected", String(bar.dataset.metricBar === range.value));
    });
  };
  range.addEventListener("input", render);
  render();
}

function bindHabits(block: HTMLElement) {
  const logs = Array.from(block.querySelectorAll<HTMLButtonElement>("[data-example-log]"));
  const count = block.querySelector<HTMLElement>("[data-example-count]");
  const render = () => {
    for (const button of logs) {
      const habit = `product.${button.dataset.habit}` as LandingKey;
      const key =
        button.getAttribute("aria-pressed") === "true" ? "blocks.habits.undo" : "blocks.habits.log";
      button.setAttribute("aria-label", fill(key, { habit: landingCopy[getLang()][habit] }));
    }
    if (count)
      count.textContent = fill("blocks.habits.count", {
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
    const key = `blocks.breakdown.${row.dataset.cadence}` as LandingKey;
    const control = row.querySelector<HTMLButtonElement>(".frequency-control");
    const result = block.querySelector<HTMLElement>(`[data-result-frequency="${index}"]`);
    if (control) control.textContent = landingCopy[getLang()][key];
    if (result) result.textContent = landingCopy[getLang()][key];
  });
  const state = block.dataset.state;
  const status = block.querySelector<HTMLElement>("[data-breakdown-status]");
  if (status)
    status.textContent =
      state === "approved" || state === "rejected"
        ? landingCopy[getLang()][`blocks.breakdown.${state}`]
        : "";
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
