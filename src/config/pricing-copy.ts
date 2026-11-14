import { pricingCopy } from "../i18n/translations";
import { formatPrice, plans, type PriceLanguage } from "./pricing";

function annualSavings(language: PriceLanguage) {
  const plan = plans[language];
  return Math.floor((1 - plan.yearly / (12 * plan.monthly)) * 100);
}

export function pricingFor(language: PriceLanguage, period: "monthly" | "yearly") {
  const copy = pricingCopy[language];
  return {
    primary: copy["pricing.day"].replace(
      "{price}",
      formatPrice(language, period === "yearly" ? "dailyYearly" : "dailyMonthly"),
    ),
    billed: copy[period === "yearly" ? "pricing.billedYearly" : "pricing.billedMonthly"].replace(
      "{price}",
      formatPrice(language, period),
    ),
    annualLabel: copy["pricing.annualLabel"].replace("{percent}", String(annualSavings(language))),
    savingShort: copy["pricing.savingShort"].replace("{percent}", String(annualSavings(language))),
    saving: copy["pricing.saving"].replace("{percent}", String(annualSavings(language))),
  };
}
