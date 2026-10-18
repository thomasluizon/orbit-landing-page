import { translations, pricingCopy } from "../i18n/translations";

const plans = {
  en: { currency: "USD", locale: "en-US", monthly: 999, yearly: 6999 },
  "pt-BR": { currency: "BRL", locale: "pt-BR", monthly: 2990, yearly: 19900 },
} as const;

type PriceLanguage = keyof typeof plans;

export function offersFor(language: PriceLanguage) {
  const plan = plans[language];
  return [
    {
      "@type": "Offer",
      name: `Orbit ${translations[language]["plan.free"]}`,
      price: 0,
      priceCurrency: plan.currency,
    },
    ...(["monthly", "yearly"] as const).map((period) => ({
      "@type": "Offer",
      name: `Orbit Pro ${period}`,
      price: plan[period] / 100,
      priceCurrency: plan.currency,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plan[period] / 100,
        priceCurrency: plan.currency,
        billingDuration: period === "monthly" ? "P1M" : "P1Y",
      },
    })),
  ];
}

export function formatPrice(
  language: PriceLanguage,
  period: "monthly" | "yearly" | "free" | "dailyYearly" | "dailyMonthly",
) {
  const plan = plans[language];
  const amount =
    period === "free"
      ? 0
      : period === "dailyMonthly"
        ? plan.monthly / 30 / 100
        : period === "dailyYearly"
          ? plan.yearly / 365 / 100
          : plan[period] / 100;
  return new Intl.NumberFormat(plan.locale, {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function annualSavings(language: PriceLanguage) {
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
    saving: copy["pricing.saving"].replace("{percent}", String(annualSavings(language))),
  };
}
