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
export const exampleMonth = Array.from({ length: 30 }, (_, index) => exampleWeek[index % 7]);

const linkedHabits = [
  { habit: "walk", emoji: "🚶", streak: 12 },
  { habit: "run", emoji: "🏃", streak: 9 },
  { habit: "stretch", emoji: "🧘", streak: 14 },
] as const;

export const exampleGoal = {
  target: 30,
  progress: Math.min(...linkedHabits.map((habit) => habit.streak)),
  habits: linkedHabits,
};

export const exampleBreakdown = [
  { habit: "dishes", cadence: "daily" },
  { habit: "laundry", cadence: "weekly" },
  { habit: "bathroom", cadence: "weekly" },
] as const;
