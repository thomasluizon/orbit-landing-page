const plans = {
  en: { currency: "USD", locale: "en-US", monthly: 999, yearly: 6999 },
  "pt-BR": { currency: "BRL", locale: "pt-BR", monthly: 2990, yearly: 19900 },
} as const;

type PriceLanguage = keyof typeof plans;

export function pricesFor(language: PriceLanguage) {
  const plan = plans[language];
  const format = (cents: number) =>
    new Intl.NumberFormat(plan.locale, {
      style: "currency",
      currency: plan.currency,
    }).format(cents / 100);
  return {
    free: format(0),
    monthly: format(plan.monthly),
    yearly: format(plan.yearly),
    savings: format(plan.monthly * 12 - plan.yearly),
  };
}

export function offersFor(language: PriceLanguage) {
  const plan = plans[language];
  return [
    { "@type": "Offer", name: "Orbit Free", price: 0, priceCurrency: plan.currency },
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
