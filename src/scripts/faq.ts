for (const details of document.querySelectorAll<HTMLDetailsElement>(".faq-list details")) {
  const summary = details.querySelector("summary");
  if (!summary) continue;
  const updateExpanded = () => summary.setAttribute("aria-expanded", String(details.open));
  updateExpanded();
  details.addEventListener("toggle", updateExpanded);
}
