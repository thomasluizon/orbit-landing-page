import { calendarView } from "./calendar-view";
import { addDays, pageLanguage, setCopy } from "./clock-format";
import { readDemoCopy, setLabel } from "./day-cell";
import { addMonths, dayKey, parseDayKey, startOfWeek } from "./demo-dates";

const swipe = { threshold: 60, ratio: 1.2 };

const keySteps: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function steppedDay(selectedKey: string, key: string) {
  const selected = parseDayKey(selectedKey);
  let target: Date;
  if (key === "Home") target = startOfWeek(selected);
  else if (key === "End") target = addDays(startOfWeek(selected), 6);
  else if (keySteps[key] !== undefined) target = addDays(selected, keySteps[key]);
  else return undefined;
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  return dayKey(target < first ? first : target > last ? last : target);
}

function parts(root: HTMLElement) {
  const get = (name: string) => root.querySelector<HTMLElement>(`[data-calendar-${name}]`);
  const elements = {
    previous: get("previous"),
    next: get("next"),
    title: get("title"),
    grid: get("grid"),
    panel: get("panel"),
    dayTitle: get("day-title"),
    summary: get("summary"),
    events: get("events"),
  };
  return Object.values(elements).every(Boolean)
    ? (elements as { [name in keyof typeof elements]: HTMLElement })
    : undefined;
}

/** Reads a motion token from the root styles, so the slide follows `DESIGN.md` when a token changes. */
function motionToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads a duration token (`220ms` or `0.22s`) in milliseconds. */
function durationToken(name: string) {
  const value = motionToken(name);
  const amount = Number.parseFloat(value);
  return value.endsWith("ms") ? amount : amount * 1000;
}

/** Draws the app's month view for `today` and binds month arrows, the title, swipe and arrow keys. */
export function mountCalendar(root: HTMLElement, today: Date) {
  const element = parts(root);
  if (!element) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const copy = readDemoCopy(root);
  let month = addMonths(today, 0);
  let selected = dayKey(today);
  const render = ({ focus = false, slide = 0 } = {}) => {
    const language = pageLanguage();
    const view = calendarView(month, selected, today, language, copy);
    element.grid.innerHTML = view.grid;
    setLabel(element.grid, view.labels.group, language);
    element.title.innerHTML = view.title;
    setLabel(element.title, view.labels.title, language);
    element.title.setAttribute("aria-disabled", String(view.isToday));
    setCopy(element.dayTitle, view.dayTitle, language);
    setLabel(element.panel, view.dayTitle, language);
    setCopy(element.summary, view.summary, language);
    element.events.innerHTML = view.events;
    if (slide && !reduced.matches && element.grid.animate) {
      element.grid.animate(
        [
          { opacity: 0, transform: `translateX(${slide * 12}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: durationToken("--duration-normal"), easing: motionToken("--ease-out") },
      );
    }
    if (focus) element.grid.querySelector<HTMLElement>(`[data-day-key="${selected}"]`)?.focus();
    window.dispatchEvent(new CustomEvent("orbit:layout-changed"));
  };
  const changeMonth = (step: 1 | -1) => {
    month = addMonths(month, step);
    selected = dayKey(month);
    render({ slide: step });
  };
  element.previous.addEventListener("click", () => changeMonth(-1));
  element.next.addEventListener("click", () => changeMonth(1));
  element.title.addEventListener("click", () => {
    if (selected === dayKey(today)) return;
    month = addMonths(today, 0);
    selected = dayKey(today);
    render();
  });
  element.grid.addEventListener("click", (event) => {
    const day = (event.target as Element).closest<HTMLElement>("[data-day-key]");
    if (!day) return;
    selected = day.dataset.dayKey!;
    render({ focus: element.grid.contains(document.activeElement) });
  });
  element.grid.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = steppedDay(selected, event.key);
    if (!target) return;
    event.preventDefault();
    selected = target;
    render({ focus: true });
  });
  let start: { x: number; y: number } | undefined;
  element.grid.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      start = touch ? { x: touch.clientX, y: touch.clientY } : undefined;
    },
    { passive: true },
  );
  element.grid.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      start = undefined;
      if (Math.abs(deltaX) <= swipe.threshold) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * swipe.ratio) return;
      changeMonth(deltaX < 0 ? 1 : -1);
    },
    { passive: true },
  );
  render();
  delete root.dataset.clockPending;
}
