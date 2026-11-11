import { demoDay, demoEvents } from "../config/product-examples";
import type { DemoCopy } from "../i18n/demo-copy";
import type { Language } from "../i18n/translations";
import { addDays, bilingualDate, demoLanguages, formatDate, type Bilingual } from "./clock-format";
import {
  bilingualCopy,
  copyElement,
  dayCellHtml,
  dayLabel,
  escapeHtml,
  isLoggable,
  weekdayDate,
} from "./day-cell";
import {
  capitalize,
  dayKey,
  dayOffset,
  parseDayKey,
  startOfWeek,
  weekdayLabels,
} from "./demo-dates";

function bilingual(build: (language: Language) => string): Bilingual {
  return Object.fromEntries(
    demoLanguages.map((language) => [language, build(language)]),
  ) as Bilingual;
}

function monthGridHtml(
  month: Date,
  selectedKey: string,
  today: Date,
  language: Language,
  copy: DemoCopy,
) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const pt = weekdayLabels("pt-BR");
  const header = weekdayLabels("en")
    .map((label, index) =>
      copyElement(
        "span",
        { en: label, "pt-BR": pt[index] },
        language,
        'class="calendar-weekday" aria-hidden="true"',
      ),
    )
    .join("");
  const cells: string[] = [];
  const end = addDays(startOfWeek(last), 6);
  for (let date = startOfWeek(first), index = 0; date <= end; date = addDays(date, 1), index++) {
    const week = Math.floor(index / 7);
    if (date.getMonth() !== month.getMonth()) {
      cells.push(`<span class="day-slot" aria-hidden="true" data-calendar-week="${week}"></span>`);
      continue;
    }
    const key = dayKey(date);
    const offset = dayOffset(today, date);
    const marks = demoDay(offset);
    cells.push(
      dayCellHtml(
        {
          key,
          day: date.getDate(),
          label: dayLabel(date),
          done: marks?.done,
          scheduled: marks?.total ?? 0,
          today: offset === 0,
          selected: key === selectedKey,
          future: offset > 0,
          raised: isLoggable(offset),
          readOnly: !isLoggable(offset),
          tabIndex: key === selectedKey ? 0 : -1,
          data: { "calendar-day": date.getDate(), "calendar-week": week },
        },
        language,
        copy,
      ),
    );
  }
  return header + cells.join("");
}

function monthHeading(month: Date, today: Date) {
  const currentYear = month.getFullYear() === today.getFullYear();
  const name = bilingual((language) => {
    const label = formatDate(month, language, { month: currentYear ? "long" : "short" });
    return currentYear ? capitalize(label) : label;
  });
  return { name, year: currentYear ? "" : String(month.getFullYear()) };
}

function monthLabels(month: Date, today: Date, copy: DemoCopy) {
  const { name, year } = monthHeading(month, today);
  return {
    title: bilingual(
      (language) =>
        `${[name[language], year].filter(Boolean).join(" ")}, ${copy[language]["calendar.goToToday"]}`,
    ),
    group: bilingualDate(month, { month: "long", year: "numeric" }),
  };
}

function monthTitleHtml(month: Date, today: Date, language: Language) {
  const { name, year } = monthHeading(month, today);
  const yearHtml = year ? ` <span class="calendar-year">${escapeHtml(year)}</span>` : "";
  return `${copyElement("span", name, language)}${yearHtml}`;
}

function dayTitle(date: Date, today: Date, copy: DemoCopy) {
  if (dayOffset(today, date) === 0) {
    return bilingual((language) =>
      capitalize(
        copy[language]["calendar.todayWithDate"].replace(
          "{date}",
          formatDate(date, language, { day: "numeric", month: "long" }),
        ),
      ),
    );
  }
  return bilingual((language) => capitalize(formatDate(date, language, weekdayDate)));
}

function daySummary(date: Date, today: Date, copy: DemoCopy) {
  const marks = demoDay(dayOffset(today, date));
  return bilingual((language) =>
    marks?.total
      ? copy[language][marks.done === 1 ? "calendar.summary.one" : "calendar.summary.other"]
          .replace("{done}", String(marks.done))
          .replace("{total}", String(marks.total))
      : copy[language]["calendar.dayCell.notScheduled"],
  );
}

function dayEventsHtml(date: Date, today: Date, language: Language, copy: DemoCopy) {
  const events = demoEvents(dayOffset(today, date), date.getDay());
  const heading = copyElement(
    "p",
    bilingualCopy(copy, "calendar.events"),
    language,
    'class="product-caption"',
  );
  if (!events.length) {
    return `${heading}${copyElement(
      "p",
      bilingualCopy(copy, "calendar.noEvents"),
      language,
      'class="calendar-empty"',
    )}`;
  }
  return `${heading}${events
    .map(
      ({ name, time }) =>
        `<p class="calendar-event">${copyElement("span", bilingualCopy(copy, name), language)} <span class="product-caption">${time}</span></p>`,
    )
    .join("")}`;
}

/** Everything the calendar card shows for one month and one selected day. */
export function calendarView(
  month: Date,
  selectedKey: string,
  today: Date,
  language: Language,
  copy: DemoCopy,
) {
  const selected = parseDayKey(selectedKey);
  return {
    grid: monthGridHtml(month, selectedKey, today, language, copy),
    title: monthTitleHtml(month, today, language),
    labels: monthLabels(month, today, copy),
    dayTitle: dayTitle(selected, today, copy),
    summary: daySummary(selected, today, copy),
    events: dayEventsHtml(selected, today, language, copy),
    isToday: dayOffset(today, selected) === 0,
  };
}
