const habitByRow = new Map<HTMLElement, string>();
const completedHabits = new Map<string, boolean>();

function renderCompletion(row: HTMLElement, done: boolean) {
  row.setAttribute("aria-pressed", String(done));
  row.querySelector(".status-ring")?.classList.toggle("is-done", done);
}

export function bindHabitCompletion(row: HTMLElement, identity: string) {
  habitByRow.set(row, identity);
  renderCompletion(row, completedHabits.get(identity) ?? false);
}

export function toggleHabitCompletion(row: HTMLElement) {
  const done = row.getAttribute("aria-pressed") !== "true";
  const identity = habitByRow.get(row);
  if (identity === undefined) {
    renderCompletion(row, done);
    return;
  }
  completedHabits.set(identity, done);
  habitByRow.forEach((habit, projection) => {
    if (habit === identity) renderCompletion(projection, done);
  });
}
