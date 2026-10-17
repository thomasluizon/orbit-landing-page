import { translations } from "../i18n/translations";

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
  period: "monthly" | "yearly" | "free" | "monthlyEquivalent",
) {
  const plan = plans[language];
  const amount =
    period === "free"
      ? 0
      : period === "monthlyEquivalent"
        ? plan.yearly / 12 / 100
        : plan[period] / 100;
  return new Intl.NumberFormat(plan.locale, {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
