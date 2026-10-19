import { pricingFor } from "../config/pricing";

function mountBillingControl() {
  const group = document.querySelector<HTMLElement>("[data-billing-control]");
  if (!group) return;
  const options = [...group.querySelectorAll<HTMLButtonElement>("[data-billing-period]")];
  const price = document.querySelector<HTMLElement>("[data-pro-price]");
  const billed = document.querySelector<HTMLElement>("[data-billed-total]");
  const recommendation = document.querySelector<HTMLElement>("[data-plan-recommendation]");
  const billingSaving = document.querySelector<HTMLElement>("[data-billing-saving]");
  if (!price || !billed) return;
  let selected: "monthly" | "yearly" = "yearly";
  const render = () => {
    const language = document.documentElement.lang === "pt-BR" ? "pt-BR" : "en";
    const display = pricingFor(language, selected);
    price.textContent = display.primary;
    recommendation?.closest("article")?.setAttribute("data-plan-period", selected);
    if (billingSaving) billingSaving.textContent = display.savingShort;
    billed.textContent = display.billed;
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
