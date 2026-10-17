export const exampleWeek = [100, 80, 66, 0, 100, 100, 100];

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
