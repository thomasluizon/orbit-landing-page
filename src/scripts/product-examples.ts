import { toggleHabitCompletion } from "./habit-completion";

document.querySelectorAll<HTMLButtonElement>("[data-habit-toggle]").forEach((row) => {
  row.addEventListener("click", () => toggleHabitCompletion(row));
});
