import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";

type Example = "start" | "restart" | "move";

const demo = document.getElementById("astra-demo");
const exchange = demo?.querySelector<HTMLElement>(".demo-exchange");
const response = document.getElementById("demo-response");
const second = document.getElementById("demo-second");
const preview = document.getElementById("demo-preview");
const today = document.getElementById("demo-today");
const todaySecond = document.getElementById("demo-today-second");
const result = document.getElementById("demo-result");
const announcement = document.getElementById("demo-announcement");
const chips = demo?.querySelectorAll<HTMLButtonElement>("[data-demo]");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let pending: number | undefined;
let current: Example = "start";
let edited = false;

function setCopy(id: string, key: TranslationKey) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = translations[getLang()][key];
  element.setAttribute("data-i18n", key);
}

function showResponse() {
  if (response) response.style.visibility = "visible";
  exchange?.setAttribute("aria-busy", "false");
  pending = undefined;
}

function clearAnnouncement() {
  if (!announcement) return;
  announcement.textContent = "";
  announcement.removeAttribute("data-i18n");
}

function play(example: Example) {
  window.clearTimeout(pending);
  current = example;
  edited = false;
  if (today) today.hidden = true;
  if (preview) preview.hidden = false;
  if (result) result.hidden = true;
  clearAnnouncement();
  for (const field of ["request", "reply", "habit", "repeat"] as const) {
    setCopy(`demo-${field}`, `demo.${example}.${field}`);
  }
  if (second) second.hidden = example !== "move";
  setCopy("demo-second-repeat", "demo.move.secondRepeat");
  chips?.forEach((chip) =>
    chip.setAttribute("aria-pressed", String(chip.dataset.demo === example)),
  );
  if (motion.matches) return showResponse();
  if (response) response.style.visibility = "hidden";
  exchange?.setAttribute("aria-busy", "true");
  pending = window.setTimeout(showResponse, 480);
}

function finish(approved: boolean) {
  window.clearTimeout(pending);
  showResponse();
  setCopy("demo-result", approved ? `demo.${current}.approved` : "demo.rejected");
  if (result) result.hidden = false;
  if (preview) preview.hidden = true;
  if (today) today.hidden = !approved;
  if (todaySecond) todaySecond.hidden = current !== "move";
  if (approved) {
    setCopy("demo-today-habit", `demo.${current}.habit`);
    const schedule: TranslationKey = edited
      ? `demo.${current}.alternateRepeat`
      : `demo.${current}.repeat`;
    setCopy("demo-today-repeat", schedule);
    setCopy("demo-today-second-repeat", schedule);
  }
  clearAnnouncement();
  chips?.forEach((chip) => {
    if (chip.dataset.demo === current) chip.focus();
  });
}

function edit() {
  window.clearTimeout(pending);
  showResponse();
  edited = !edited;
  const key: TranslationKey = edited ? `demo.${current}.alternateRepeat` : `demo.${current}.repeat`;
  setCopy("demo-repeat", key);
  if (current === "move") setCopy("demo-second-repeat", key);
  setCopy("demo-announcement", "demo.edited");
}

chips?.forEach((chip) => chip.addEventListener("click", () => play(chip.dataset.demo as Example)));
document.getElementById("demo-approve")?.addEventListener("click", () => finish(true));
document.getElementById("demo-reject")?.addEventListener("click", () => finish(false));
document.getElementById("demo-edit")?.addEventListener("click", edit);
motion.addEventListener("change", () => {
  if (!motion.matches) return;
  window.clearTimeout(pending);
  showResponse();
});
if (demo) {
  if (motion.matches) play("start");
  else showResponse();
}
