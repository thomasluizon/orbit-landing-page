import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";
import { planFromWords } from "./demo-plan";
import { bindHabitCompletion } from "./habit-completion";

type Example = "start" | "restart" | "move";
type AcceptedPlan = {
  example: Example | "custom";
  title: string;
  schedule: TranslationKey;
  showSecond: boolean;
};
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
let acceptedPlan: AcceptedPlan | null = null;

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

function habitTitle(example = current, literalTitle = title) {
  return (
    literalTitle ||
    translations[getLang()][`demo.${example === "custom" ? "start" : example}.habit`]
  );
}

function hasSecondHabit() {
  const language = getLang();
  return (
    current === "move" &&
    habitTitle().trim().toLocaleLowerCase(language) !==
      translations[language]["demo.move.secondHabit"].toLocaleLowerCase(language)
  );
}

function renderPlan() {
  document.getElementById("demo-second")?.toggleAttribute("hidden", !hasSecondHabit());
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

function updateToday(plan: AcceptedPlan) {
  const acceptedTitle = habitTitle(plan.example, plan.title);
  const normalizedTitle = acceptedTitle.trim().toLocaleLowerCase(getLang());
  const identity = (
    plan.title ||
    translations.en[`demo.${plan.example === "custom" ? "start" : plan.example}.habit`]
  )
    .trim()
    .toLowerCase();
  setText("demo-today-habit", acceptedTitle);
  setCopy("demo-today-repeat", plan.schedule);
  setCopy("demo-today-second-repeat", plan.schedule);
  const chatRow = document.getElementById("demo-today-habit")?.closest<HTMLElement>(".habit-row");
  if (chatRow) bindHabitCompletion(chatRow, identity);
  const secondRow = document.getElementById("demo-today-second");
  secondRow?.toggleAttribute("hidden", !plan.showSecond);
  if (secondRow)
    bindHabitCompletion(secondRow, translations.en["demo.move.secondHabit"].toLowerCase());
  document.querySelectorAll<HTMLElement>("[data-demo-approved]").forEach((row) => {
    row.hidden = false;
    bindHabitCompletion(row, identity);
    const name = row.querySelector<HTMLElement>("[data-approved-name]");
    const repeat = row.querySelector<HTMLElement>("[data-approved-repeat]");
    if (name) name.textContent = acceptedTitle;
    if (repeat) repeat.textContent = translations[getLang()][plan.schedule];
    const originals = row
      .closest(".phone-today-habits")
      ?.querySelectorAll<HTMLElement>(
        "[data-habit-toggle]:not([data-demo-approved]):not([data-demo-approved-second])",
      );
    const matchesTitle = (habit: HTMLElement) =>
      habit.querySelector(".habit-name")?.textContent?.trim().toLocaleLowerCase(getLang()) ===
      normalizedTitle;
    const replacesExisting = [...(originals ?? [])].some(matchesTitle);
    originals?.forEach((habit, index) => {
      habit.hidden =
        plan.example === "move" || matchesTitle(habit) || (!replacesExisting && index === 0);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-demo-approved-second]").forEach((row) => {
    row.hidden = !plan.showSecond;
    bindHabitCompletion(row, translations.en["demo.move.secondHabit"].toLowerCase());
    const repeat = row.querySelector("[data-approved-second-repeat]");
    if (repeat) repeat.textContent = translations[getLang()][plan.schedule];
  });
  syncHabitReaches(today);
  document.querySelectorAll<HTMLElement>(".phone-today-habits").forEach(syncHabitReaches);
}

function finish(accept: boolean) {
  setCopy("demo-result", accept ? `demo.${current}.approved` : "demo.rejected");
  if (result) result.hidden = false;
  if (preview) preview.hidden = true;
  if (today) today.hidden = !accept;
  if (continuation) continuation.hidden = !accept;
  if (accept) {
    acceptedPlan = { example: current, title, schedule, showSecond: hasSecondHabit() };
    updateToday(acceptedPlan);
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
  if (acceptedPlan) updateToday(acceptedPlan);
});

if (preview) {
  const proposalSize = new ResizeObserver(revealProposal);
  proposalSize.observe(preview);
  const thread = preview.closest(".demo-thread");
  if (thread) proposalSize.observe(thread);
  const exchange = demo?.querySelector(".demo-exchange");
  if (exchange) proposalSize.observe(exchange);
}
