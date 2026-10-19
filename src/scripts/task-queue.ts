type Task = () => unknown | Promise<unknown>;

export function yieldToMain(): Promise<void> {
  const scheduler = (window as Window & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function afterLoad(tasks: Task[]) {
  if (document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      window.addEventListener("load", () => resolve(), { once: true });
    });
  }
  for (const task of tasks) {
    await yieldToMain();
    await task();
  }
}
