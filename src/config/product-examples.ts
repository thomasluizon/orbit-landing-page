export const exampleDays = [
  { done: 5, total: 5 },
  { done: 4, total: 5 },
  { done: 2, total: 3 },
  { done: 0, total: 3 },
  { done: 3, total: 3 },
  { done: 4, total: 4 },
  { done: 5, total: 5 },
];

export const exampleWeek = exampleDays.map(({ done, total }) => Math.round((done / total) * 100));

const linkedStreaks = [12, 9, 14];

export const exampleGoal = {
  target: 30,
  progress: Math.min(...linkedStreaks),
  linkedHabitCount: linkedStreaks.length,
};

export const exampleBreakdown = [
  { habit: "dishes", cadence: "daily" },
  { habit: "laundry", cadence: "weekly" },
  { habit: "bathroom", cadence: "weekly" },
] as const;

const earlierDays = [
  { done: 5, total: 5 },
  { done: 3, total: 4 },
  { done: 4, total: 4 },
  { done: 2, total: 3 },
  { done: 3, total: 3 },
  { done: 0, total: 2 },
  { done: 4, total: 5 },
];

/** Demo habit counts for the day `offset` days from today. The last seven days are `exampleDays`; future days have none. */
export function demoDay(offset: number) {
  if (offset > 0) return undefined;
  if (offset >= -6) return exampleDays[6 + offset];
  return earlierDays[-offset % earlierDays.length];
}

/** Demo calendar events for the day `offset` days from today with local weekday `weekday` (0 is Sunday). */
export function demoEvents(offset: number, weekday: number) {
  const events: { name: "orbit.teamMeeting" | "orbit.dentist"; time: string }[] = [];
  if (weekday > 0 && weekday < 6) events.push({ name: "orbit.teamMeeting", time: "10:00" });
  if (offset % 9 === 0) events.push({ name: "orbit.dentist", time: "15:30" });
  return events;
}

/** The build time. Every demo date falls back to it when JavaScript does not run. */
export const buildNow = new Date();
