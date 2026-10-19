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

export const exampleDate = "2026-08-18";
export const exampleExportFile = `orbit-data-export-${exampleDate}.json`;
