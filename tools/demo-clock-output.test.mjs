import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { documentFrom, moduleLoader } from "./lib/mini-dom.mjs";

const html = readFileSync("dist/index.html", "utf8");
const format = (date, language, options) => new Intl.DateTimeFormat(language, options).format(date);
const chartDate = (date, language) =>
  format(date, language, { weekday: "short", day: "numeric", month: "short" });
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const key = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monday = (date) => addDays(date, -((date.getDay() + 6) % 7));

function translate(document, language) {
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-copy-en]")) {
    element.textContent = language === "en" ? element.dataset.copyEn : element.dataset.copyPt;
  }
  for (const element of document.querySelectorAll("[data-copy-label-en]")) {
    element.setAttribute(
      "aria-label",
      language === "en" ? element.dataset.copyLabelEn : element.dataset.copyLabelPt,
    );
  }
}

async function mount(now, language) {
  const document = documentFrom(html);
  const events = [];
  class FixedDate extends Date {
    constructor(...values) {
      if (values.length) super(...values);
      else super(now.getTime());
    }
    static now() {
      return now.getTime();
    }
  }
  const load = moduleLoader({
    Date: FixedDate,
    document,
    window: {
      matchMedia: () => ({ matches: false }),
      dispatchEvent: (event) => events.push(event.type),
    },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  const { demoNow } = load("src/scripts/demo-clock.ts");
  const weekCard = document.querySelector("[data-week-card]");
  const calendar = document.querySelector("[data-calendar]");
  for (const view of [weekCard, calendar]) {
    assert.ok(
      view.hasAttribute("data-clock-pending"),
      "the build marks the view so its build dates stay hidden until it shows the visitor's day",
    );
  }
  load("src/scripts/week.ts").mountWeek(weekCard, demoNow);
  load("src/scripts/demo-views.ts");
  for (const view of [weekCard, calendar]) {
    assert.equal(view.hasAttribute("data-clock-pending"), false);
  }
  translate(document, language);
  const part = (name) => calendar.querySelector(`[data-calendar-${name}]`);
  const days = () => part("grid").querySelectorAll("[data-day-key]");
  return {
    document,
    events,
    part,
    days,
    selected: () => days().find((day) => day.getAttribute("aria-pressed") === "true"),
    week: () => document.querySelector("[data-week-days]").querySelectorAll("[data-day-key]"),
    weekReadout: () =>
      document
        .querySelector("[data-week-readouts]")
        .children.filter((item) => !item.hidden)
        .map((item) => item.textContent),
  };
}

// Literal expectations, written by hand from the calendar, so a wrong format option or a wrong
// day period strip in the production code cannot pass by agreeing with a copy of itself.
const cases = [
  {
    name: "a Monday after a month boundary",
    now: new Date(2026, 2, 2, 9, 41),
    expected: {
      en: { time: "9:41", today: "March 2", lastChart: "Mon, Mar 2", firstChart: "Tue, Feb 24" },
      "pt-BR": {
        time: "9:41",
        today: "2 de março",
        lastChart: "seg., 2 de mar.",
        firstChart: "ter., 24 de fev.",
      },
    },
  },
  {
    name: "a Sunday",
    now: new Date(2026, 10, 15, 18, 5),
    expected: {
      en: {
        time: "6:05",
        today: "November 15",
        lastChart: "Sun, Nov 15",
        firstChart: "Mon, Nov 9",
      },
      "pt-BR": {
        time: "18:05",
        today: "15 de novembro",
        lastChart: "dom., 15 de nov.",
        firstChart: "seg., 9 de nov.",
      },
    },
  },
  {
    name: "a leap day week",
    now: new Date(2028, 2, 1, 0, 30),
    expected: {
      en: { time: "12:30", today: "March 1", lastChart: "Wed, Mar 1", firstChart: "Thu, Feb 24" },
      "pt-BR": {
        time: "0:30",
        today: "1 de março",
        lastChart: "qua., 1 de mar.",
        firstChart: "qui., 24 de fev.",
      },
    },
  },
  {
    name: "a Sunday after a year boundary",
    now: new Date(2027, 0, 3, 12, 0),
    expected: {
      en: { time: "12:00", today: "January 3", lastChart: "Sun, Jan 3", firstChart: "Mon, Dec 28" },
      "pt-BR": {
        time: "12:00",
        today: "3 de janeiro",
        lastChart: "dom., 3 de jan.",
        firstChart: "seg., 28 de dez.",
      },
    },
  },
];
const buildToday = documentFrom(html).querySelector('[data-clock="today"]');

for (const language of ["en", "pt-BR"]) {
  for (const { name, now, expected: literals } of cases) {
    const literal = literals[language];
    test(`${language}, ${name}: every demo date and the phone clock follow the stubbed now`, async () => {
      const h = await mount(now, language);
      assert.equal(h.document.querySelector('[data-clock="time"]').textContent, literal.time);
      assert.equal(h.document.querySelector('[data-clock="today"]').textContent, literal.today);
      const chart = h.document.querySelectorAll('[data-clock="chart"]');
      assert.equal(chart.length, 9, "seven readouts and the two axis dates");
      for (const element of chart) {
        const offset = Number(element.dataset.clockOffset);
        assert.ok(offset >= -6 && offset <= 0);
        assert.equal(element.textContent, chartDate(addDays(now, offset), language));
        if (offset === 0) assert.equal(element.textContent, literal.lastChart);
        if (offset === -6) assert.equal(element.textContent, literal.firstChart);
      }
      const bars = h.document.querySelectorAll("[data-metric-day]");
      assert.equal(bars.length, 7);
      bars.forEach((bar, index) =>
        assert.ok(
          bar
            .getAttribute("aria-label")
            .startsWith(`${chartDate(addDays(now, index - 6), language)}, `),
          bar.getAttribute("aria-label"),
        ),
      );
      for (const previous of [buildToday.dataset.copyEn, buildToday.dataset.copyPt]) {
        if (previous === literals.en.today || previous === literals["pt-BR"].today) continue;
        assert.doesNotMatch(h.document.textContent, new RegExp(`\\b${previous}\\b`));
      }
    });

    test(`${language}, ${name}: the week card shows this week with today marked and selected`, async () => {
      const h = await mount(now, language);
      const days = h.week();
      assert.deepEqual(
        days.map((day) => day.dataset.dayKey),
        Array.from({ length: 7 }, (_, index) => key(addDays(monday(now), index))),
      );
      const today = days.filter((day) => day.getAttribute("aria-current") === "date");
      assert.deepEqual(
        today.map((day) => day.dataset.dayKey),
        [key(now)],
      );
      assert.deepEqual(
        days.filter((day) => day.getAttribute("aria-pressed") === "true"),
        today,
      );
      assert.deepEqual(
        days.map((day) => day.querySelector(".day-cell-weekday").textContent),
        Array.from({ length: 7 }, (_, index) =>
          format(addDays(monday(now), index), language, { weekday: "narrow" }),
        ),
      );
      assert.deepEqual(
        days.map((day) => day.querySelector(".day-cell-numeral").textContent),
        Array.from({ length: 7 }, (_, index) => String(addDays(monday(now), index).getDate())),
      );
      days.forEach((day, index) => {
        const offset = index - ((now.getDay() + 6) % 7);
        assert.equal(day.dataset.outcome === "future", offset > 0, day.dataset.dayKey);
      });
      const [readout] = h.weekReadout();
      assert.match(readout, language === "en" ? /^Today: / : /^Hoje: /);
      const other = days.find((day) => day !== today[0]);
      other.dispatch("click");
      assert.equal(h.week().filter((day) => day.getAttribute("aria-pressed") === "true").length, 1);
      assert.equal(
        h.week().find((day) => day.getAttribute("aria-pressed") === "true").dataset.dayKey,
        other.dataset.dayKey,
      );
      const weekday = capitalize(
        format(new Date(`${other.dataset.dayKey}T12:00`), language, { weekday: "long" }),
      );
      assert.deepEqual(
        h.weekReadout().map((text) => text.startsWith(`${weekday}: `)),
        [true],
      );
      assert.ok(h.document.activeElement === null, "a pointer click on a day adds no focus");
      const pressed = () => h.week().find((day) => day.getAttribute("aria-pressed") === "true");
      const keyed = h.week().find((day) => day !== pressed());
      keyed.focus();
      keyed.dispatch("click");
      assert.equal(pressed().dataset.dayKey, keyed.dataset.dayKey);
      assert.ok(
        h.document.activeElement === pressed(),
        "Enter or Space on a day keeps focus on the newly drawn selected day",
      );
    });

    test(`${language}, ${name}: the calendar opens on the current month with today selected`, async () => {
      const h = await mount(now, language);
      assert.equal(
        h.part("grid").getAttribute("aria-label"),
        format(now, language, { month: "long", year: "numeric" }),
      );
      assert.equal(
        h.part("title").textContent,
        capitalize(format(now, language, { month: "long" })),
      );
      assert.equal(h.part("title").getAttribute("aria-disabled"), "true");
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      assert.deepEqual(
        h.days().map((day) => day.dataset.dayKey),
        Array.from({ length: daysInMonth }, (_, index) =>
          key(new Date(now.getFullYear(), now.getMonth(), index + 1)),
        ),
      );
      assert.equal(h.selected().dataset.dayKey, key(now));
      assert.equal(h.selected().getAttribute("aria-current"), "date");
      assert.equal(h.selected().getAttribute("tabindex"), "0");
      assert.equal(
        h.part("day-title").textContent,
        capitalize(`${language === "en" ? "Today" : "Hoje"}, ${literal.today}`),
      );
      const cells = h
        .part("grid")
        .children.filter((item) => item.hasAttribute("data-calendar-week"));
      cells.forEach((cell, index) =>
        assert.equal(Number(cell.dataset.calendarWeek), Math.floor(index / 7)),
      );
      assert.equal(cells.length, 42, "every month draws six weeks, so the card keeps one height");
      const lead = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
      assert.equal(
        cells.findIndex((cell) => cell.hasAttribute("data-day-key")),
        lead,
      );
      const pointed = h.days().find((day) => day !== h.selected());
      pointed.dispatch("click");
      assert.equal(h.selected().dataset.dayKey, pointed.dataset.dayKey);
      assert.ok(h.document.activeElement === null, "a pointer click on a day adds no focus");
    });

    test(`${language}, ${name}: arrows, swipe, keys and the title move through months and days`, async () => {
      const h = await mount(now, language);
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      h.part("next").dispatch("click");
      assert.equal(
        h.part("grid").getAttribute("aria-label"),
        format(next, language, { month: "long", year: "numeric" }),
      );
      assert.equal(h.selected().dataset.dayKey, key(next));
      assert.equal(h.part("title").getAttribute("aria-disabled"), "false");
      assert.ok(h.events.includes("orbit:layout-changed"));
      h.part("title").dispatch("click");
      assert.equal(h.selected().dataset.dayKey, key(now));
      h.part("previous").dispatch("click");
      assert.equal(h.selected().dataset.dayKey, key(previous));
      h.part("title").dispatch("click");
      h.part("grid").dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });
      h.part("grid").dispatch("touchend", { changedTouches: [{ clientX: 80, clientY: 110 }] });
      assert.equal(h.selected().dataset.dayKey, key(next), "a left swipe opens the next month");
      h.part("grid").dispatch("touchstart", { touches: [{ clientX: 80, clientY: 100 }] });
      h.part("grid").dispatch("touchend", { changedTouches: [{ clientX: 120, clientY: 300 }] });
      assert.equal(h.selected().dataset.dayKey, key(next), "a vertical drag keeps the month");
      h.part("grid").dispatch("touchstart", { touches: [{ clientX: 80, clientY: 100 }] });
      h.part("grid").dispatch("touchend", { changedTouches: [{ clientX: 200, clientY: 100 }] });
      assert.equal(h.selected().dataset.dayKey, key(now).slice(0, 8) + "01");
      h.part("title").dispatch("click");
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const clamp = (date) =>
        date < firstOfMonth ? firstOfMonth : date > lastOfMonth ? lastOfMonth : date;
      let expected = now;
      for (const [pressed, step] of [
        ["ArrowRight", 1],
        ["ArrowLeft", -1],
        ["ArrowDown", 7],
        ["ArrowUp", -7],
        ["ArrowUp", -7],
      ]) {
        expected = clamp(addDays(expected, step));
        const event = h.selected().dispatch("keydown", {
          key: pressed,
          prevented: false,
          preventDefault() {
            this.prevented = true;
          },
        });
        assert.equal(event.prevented, true, pressed);
        assert.equal(h.selected().dataset.dayKey, key(expected), pressed);
        assert.equal(
          h.document.activeElement,
          h.selected(),
          `${pressed} moves focus with selection`,
        );
      }
      const firstDay = h.days()[0];
      firstDay.dispatch("click");
      assert.equal(h.selected().dataset.dayKey, firstDay.dataset.dayKey);
      assert.ok(
        h.document.activeElement === h.selected(),
        "Enter or Space on a focused day keeps focus on the newly drawn selected day",
      );
      assert.match(
        h.selected().getAttribute("aria-label"),
        language === "en" ? /selected/ : /selecionado/,
      );
      assert.equal(h.days().filter((day) => day.getAttribute("tabindex") === "0").length, 1);
    });
  }
}
