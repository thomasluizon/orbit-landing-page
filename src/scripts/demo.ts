import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";
import { planFromWords } from "./demo-plan";

type Example = "start" | "restart" | "move";
const demo = document.getElementById("astra-demo");
const preview = document.getElementById("demo-preview");
const today = document.getElementById("demo-today");
const result = document.getElementById("demo-result");
const continuation = document.getElementById("demo-continue");
const continueLink = document.getElementById("demo-continue-link") as HTMLAnchorElement | null;
const editForm = document.getElementById("demo-edit-form") as HTMLFormElement | null;
const editName = document.getElementById("demo-edit-name") as HTMLInputElement | null;
const editSchedule = document.getElementById("demo-edit-schedule") as HTMLSelectElement | null;
const input = document.getElementById("demo-input") as HTMLInputElement | null;
const composer = document.getElementById("demo-composer");
const send = composer?.querySelector<HTMLButtonElement>(".demo-send");
let current: Example | "custom" = "start";
let title = "";
let schedule: TranslationKey = "demo.start.repeat";
let approved = false;

function syncSend() {
  const hasText = Boolean(input?.value.trim());
  composer?.toggleAttribute("data-has-text", hasText);
  if (send) send.disabled = !hasText;
}

function setText(id: string, text: string, key?: TranslationKey) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  if (key) element.setAttribute("data-i18n", key);
  else element.removeAttribute("data-i18n");
}

function setCopy(id: string, key: TranslationKey) {
  setText(id, translations[getLang()][key], key);
}

function habitTitle() {
  return title || translations[getLang()][`demo.${current === "custom" ? "start" : current}.habit`];
}

function renderPlan() {
  setText("demo-habit", habitTitle());
  setCopy("demo-repeat", schedule);
  setCopy("demo-second-repeat", schedule);
}

function revealProposal() {
  if (!preview || preview.hidden || (editForm && !editForm.hidden)) return;
  const thread = preview.closest<HTMLElement>(".demo-thread");
  if (thread) thread.scrollTop = 0;
}

function resetProposal() {
  approved = false;
  if (preview) preview.hidden = false;
  if (today) today.hidden = true;
  if (result) result.hidden = true;
  if (continuation) continuation.hidden = true;
  if (editForm) editForm.hidden = true;
  document.getElementById("demo-second")?.toggleAttribute("hidden", current !== "move");
  demo
    ?.querySelectorAll<HTMLElement>("[data-demo]")
    .forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.demo === current)));
  renderPlan();
  revealProposal();
}

function play(example: Example) {
  current = example;
  title = "";
  schedule = `demo.${example}.repeat`;
  setCopy("demo-request", `demo.${example}.request`);
  setCopy("demo-reply", `demo.${example}.reply`);
  resetProposal();
}

function syncHabitReaches(list: HTMLElement | null) {
  const rows = [...(list?.querySelectorAll<HTMLElement>(".habit-row") ?? [])];
  const visible = rows.filter((row) => !row.hidden);
  rows.forEach((row) => {
    row.toggleAttribute("data-first-visible", row === visible[0]);
    row.toggleAttribute("data-last-visible", row === visible.at(-1));
  });
}

function updateToday() {
  setText("demo-today-habit", habitTitle());
  setCopy("demo-today-repeat", schedule);
  setCopy("demo-today-second-repeat", schedule);
  document.getElementById("demo-today-second")?.toggleAttribute("hidden", current !== "move");
  document.querySelectorAll<HTMLElement>("[data-demo-approved]").forEach((row) => {
    row.hidden = false;
    const name = row.querySelector<HTMLElement>("[data-approved-name]");
    const repeat = row.querySelector<HTMLElement>("[data-approved-repeat]");
    if (name) name.textContent = habitTitle();
    if (repeat) repeat.textContent = translations[getLang()][schedule];
    const originals = row
      .closest(".phone-today-habits")
      ?.querySelectorAll<HTMLElement>(
        "[data-habit-toggle]:not([data-demo-approved]):not([data-demo-approved-second])",
      );
    originals?.forEach((habit, index) => {
      habit.hidden = index === 0 || current === "move";
    });
  });
  document.querySelectorAll<HTMLElement>("[data-demo-approved-second]").forEach((row) => {
    row.hidden = current !== "move";
    const repeat = row.querySelector("[data-approved-second-repeat]");
    if (repeat) repeat.textContent = translations[getLang()][schedule];
  });
  syncHabitReaches(today);
  document.querySelectorAll<HTMLElement>(".phone-today-habits").forEach(syncHabitReaches);
}

function finish(accept: boolean) {
  approved = accept;
  setCopy("demo-result", accept ? `demo.${current}.approved` : "demo.rejected");
  if (result) result.hidden = false;
  if (preview) preview.hidden = true;
  if (today) today.hidden = !accept;
  if (continuation) continuation.hidden = !accept;
  if (accept) {
    updateToday();
    if (continueLink?.dataset.appUrl) {
      const destination = new URL("/habits/new", continueLink.dataset.appUrl);
      destination.searchParams.set("title", habitTitle());
      continueLink.href = destination.href;
    }
  }
  demo
    ?.querySelector<HTMLButtonElement>(`[data-demo="${current === "custom" ? "start" : current}"]`)
    ?.focus({ preventScroll: true });
}

function openEditor() {
  if (!editForm || !editName || !editSchedule) return;
  editForm.hidden = !editForm.hidden;
  editName.value = habitTitle();
  editSchedule.value =
    schedule === "demo.afternoon"
      ? "afternoon"
      : schedule.endsWith("alternateRepeat") ||
          schedule === "demo.move.repeat" ||
          schedule === "demo.restart.repeat"
        ? "evening"
        : "morning";
  if (!editForm.hidden) editName.focus({ preventScroll: true });
}

editForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editName?.value.trim() || !editSchedule) return;
  title = editName.value.trim().slice(0, 80);
  schedule =
    editSchedule.value === "evening"
      ? "demo.start.alternateRepeat"
      : editSchedule.value === "afternoon"
        ? "demo.afternoon"
        : "demo.start.repeat";
  renderPlan();
  editForm.hidden = true;
  setCopy("demo-announcement", "demo.edited");
  document.getElementById("demo-edit")?.focus({ preventScroll: true });
});
document.getElementById("demo-composer")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const words = input?.value.trim();
  if (!words) return;
  current = "custom";
  ({ title, schedule } = planFromWords(words));
  setText("demo-request", words);
  setCopy("demo-reply", "demo.custom.reply");
  resetProposal();
  if (input) input.value = "";
  syncSend();
});
input?.addEventListener("input", syncSend);
syncSend();
demo
  ?.querySelectorAll<HTMLButtonElement>("[data-demo]")
  .forEach((chip) => chip.addEventListener("click", () => play(chip.dataset.demo as Example)));
document.getElementById("demo-approve")?.addEventListener("click", () => finish(true));
document.getElementById("demo-reject")?.addEventListener("click", () => finish(false));
document.getElementById("demo-edit")?.addEventListener("click", openEditor);
window.addEventListener("orbit:language-changed", () => {
  renderPlan();
  if (approved) updateToday();
});

if (preview) {
  const proposalSize = new ResizeObserver(revealProposal);
  proposalSize.observe(preview);
  const thread = preview.closest(".demo-thread");
  if (thread) proposalSize.observe(thread);
  const exchange = demo?.querySelector(".demo-exchange");
  if (exchange) proposalSize.observe(exchange);
}
