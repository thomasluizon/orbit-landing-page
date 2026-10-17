import { formatPrice } from "../config/pricing";

function mountBillingControl() {
  const group = document.querySelector<HTMLElement>("[data-billing-control]");
  if (!group) return;
  const options = [...group.querySelectorAll<HTMLButtonElement>("[data-billing-period]")];
  const price = document.querySelector<HTMLElement>("[data-pro-price]");
  const unit = document.querySelector<HTMLElement>("[data-plan-period]");
  const equivalent = document.querySelector<HTMLElement>("[data-annual-equivalent]");
  if (!price || !unit || !equivalent) return;
  let selected: "monthly" | "yearly" = "monthly";
  const render = () => {
    const language = document.documentElement.lang === "pt-BR" ? "pt-BR" : "en";
    const suffix = language === "pt-BR" ? "Pt" : "En";
    price.dataset.price = selected;
    price.textContent = formatPrice(language, selected);
    unit.textContent = unit.dataset[`${selected === "monthly" ? "month" : "year"}${suffix}`] ?? "";
    equivalent.hidden = selected === "monthly";
    equivalent.textContent = (equivalent.dataset[`template${suffix}`] ?? "").replace(
      "{price}",
      formatPrice(language, "monthlyEquivalent"),
    );
    options.forEach((option) => {
      const active = option.dataset.billingPeriod === selected;
      option.setAttribute("aria-checked", String(active));
      option.tabIndex = active ? 0 : -1;
    });
  };
  options.forEach((option, index) => {
    option.addEventListener("click", () => {
      selected = option.dataset.billingPeriod === "yearly" ? "yearly" : "monthly";
      render();
    });
    option.addEventListener("keydown", (event) => {
      const next = nextOption(event.key, index, options.length);
      if (next === undefined) return;
      event.preventDefault();
      options[next].click();
      options[next].focus();
    });
  });
  window.addEventListener("orbit:language-changed", render);
  render();
}

function nextOption(key: string, index: number, count: number) {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index + count - 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
}

mountBillingControl();
