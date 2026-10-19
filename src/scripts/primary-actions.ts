const actions = Array.from(document.querySelectorAll<HTMLElement>("[data-primary-action]"));
const visible = new Set<Element>();
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (
      entry.isIntersecting &&
      entry.intersectionRect.width > 0 &&
      entry.intersectionRect.height > 0
    ) {
      visible.add(entry.target);
    } else {
      visible.delete(entry.target);
    }
  }
  const active =
    actions.find((action) => action.id === "demo-approve" && visible.has(action)) ??
    actions.find((action) => visible.has(action));
  for (const action of actions)
    action.setAttribute("data-accent-active", String(action === active));
});
for (const action of actions) observer.observe(action);
