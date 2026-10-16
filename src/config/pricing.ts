const plans = {
  en: { currency: "USD", locale: "en-US", monthly: 999, yearly: 6999 },
  "pt-BR": { currency: "BRL", locale: "pt-BR", monthly: 2990, yearly: 19900 },
} as const;

type PriceLanguage = keyof typeof plans;

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
