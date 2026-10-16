import { translations, type TranslationKey } from "../i18n/translations";
import { getLang } from "./i18n";

type Example = "start" | "restart" | "move";

const demo = document.getElementById("astra-demo");
const exchange = demo?.querySelector<HTMLElement>(".demo-exchange");
const response = document.getElementById("demo-response");
const second = document.getElementById("demo-second");
const chips = demo?.querySelectorAll<HTMLButtonElement>("[data-demo]");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let pending: number | undefined;

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

function play(example: Example) {
  window.clearTimeout(pending);
  for (const field of ["request", "reply", "habit", "repeat"] as const) {
    setCopy(`demo-${field}`, `demo.${example}.${field}`);
  }
  if (second) second.hidden = example !== "move";
  chips?.forEach((chip) =>
    chip.setAttribute("aria-pressed", String(chip.dataset.demo === example)),
  );
  if (motion.matches) return showResponse();
  if (response) response.style.visibility = "hidden";
  exchange?.setAttribute("aria-busy", "true");
  pending = window.setTimeout(showResponse, 480);
}

chips?.forEach((chip) => chip.addEventListener("click", () => play(chip.dataset.demo as Example)));
motion.addEventListener("change", () => {
  if (!motion.matches) return;
  window.clearTimeout(pending);
  showResponse();
});
if (demo) play("start");
