export const LANGUAGES = ["en", "pt-BR"] as const;

export type Language = (typeof LANGUAGES)[number];

const en = {
  "header.cta": "Get Started",
  "hero.eyebrow": "Habit tracker",
  "hero.title1": "Build Better Habits,",
  "hero.title2": "One Day at a Time",
  "hero.subtitle":
    "AI-powered insights, goal tracking, and streaks that actually keep you motivated.",
  "hero.cta": "Get Started",
  "hero.android": "Google Play",
  "mockup.yourDay": "Your Day",
  "mockup.aiText":
    "Amazing consistency! You've completed 5 of 7 habits today. Your morning routine streak is at 12 days.",
  "mockup.habit1": "Morning Routine",
  "mockup.habit2": "Exercise",
  "mockup.habit3": "Read 30 minutes",
  "mockup.habit4": "Meditate",
  "mockup.freq.daily": "Daily",
  "mockup.nav.habits": "Habits",
  "mockup.nav.chat": "Chat",
  "mockup.nav.calendar": "Calendar",
  "mockup.nav.profile": "Profile",
  "features.title1": "Everything you need to build",
  "features.title2": " lasting habits",
  "features.scheduling.title": "Smart Scheduling",
  "features.scheduling.desc":
    "Set daily, weekly, or custom frequencies. Orbit calculates exactly when each habit is due.",
  "features.ai.title": "AI Insights",
  "features.ai.desc": "Get personalized daily summaries and routine analysis powered by AI.",
  "features.streaks.title": "Streak Tracking",
  "features.streaks.desc":
    "Watch your streaks grow. Visual progress that keeps you motivated day after day.",
  "features.subhabits.title": "Sub-Habits",
  "features.subhabits.desc":
    "Break big habits into smaller steps. Complete sub-tasks to build momentum.",
  "features.calendar.title": "Calendar View",
  "features.calendar.desc":
    "See your entire month at a glance. Navigate dates and track completion patterns over time.",
  "features.language.title": "Multi-Language",
  "features.language.desc": "Available in English and Portuguese. More languages coming soon.",
  "platforms.title1": "Available on",
  "platforms.title2": " web & mobile",
  "platforms.subtitle": "Access your habits from any device, anytime.",
  "platforms.web.title": "Web App",
  "platforms.web.desc": "Access Orbit from any browser. Your habits sync across all your devices.",
  "platforms.web.cta": "Open Web App",
  "platforms.android.badge": "Available Now",
  "platforms.android.title": "Android",
  "platforms.android.desc":
    "Take Orbit with you. Track habits on the go with our native Android app.",
  "platforms.android.cta": "Get it on Google Play",
  "cta.title1": "Ready to build",
  "cta.title2": "better habits",
  "cta.title3": "?",
  "cta.subtitle": "Free to start. No credit card required.",
  "cta.button": "Get Started",
  "footer.privacy": "Privacy Policy",
  "footer.text": "Orbit · © 2026",
};

export type TranslationKey = keyof typeof en;

const ptBR: Record<TranslationKey, string> = {
  "header.cta": "Começar",
  "hero.eyebrow": "Rastreador de hábitos",
  "hero.title1": "Construa Hábitos Melhores,",
  "hero.title2": "Um Dia de Cada Vez",
  "hero.subtitle":
    "Insights com IA, acompanhamento de metas e sequências que realmente mantêm sua motivação.",
  "hero.cta": "Começar",
  "hero.android": "Google Play",
  "mockup.yourDay": "Seu Dia",
  "mockup.aiText":
    "Consistência incrível! Você completou 5 de 7 hábitos hoje. Sua sequência matinal está em 12 dias.",
  "mockup.habit1": "Rotina Matinal",
  "mockup.habit2": "Exercício",
  "mockup.habit3": "Ler 30 minutos",
  "mockup.habit4": "Meditar",
  "mockup.freq.daily": "Diário",
  "mockup.nav.habits": "Hábitos",
  "mockup.nav.chat": "Chat",
  "mockup.nav.calendar": "Calendário",
  "mockup.nav.profile": "Perfil",
  "features.title1": "Tudo que você precisa para construir",
  "features.title2": " hábitos duradouros",
  "features.scheduling.title": "Agendamento Inteligente",
  "features.scheduling.desc":
    "Defina frequências diárias, semanais ou personalizadas. O Orbit sabe o momento certo para cada hábito.",
  "features.ai.title": "Insights de IA",
  "features.ai.desc":
    "Receba resumos diários personalizados e análise de rotina com inteligência artificial.",
  "features.streaks.title": "Rastreamento de Sequências",
  "features.streaks.desc":
    "Veja suas sequências crescerem. Progresso visual que mantém você motivado dia após dia.",
  "features.subhabits.title": "Sub-Hábitos",
  "features.subhabits.desc":
    "Divida grandes hábitos em passos menores. Complete sub-tarefas para ganhar impulso.",
  "features.calendar.title": "Visão de Calendário",
  "features.calendar.desc":
    "Veja o mês inteiro de uma só vez. Navegue entre datas e acompanhe seus padrões ao longo do tempo.",
  "features.language.title": "Multi-Idioma",
  "features.language.desc": "Disponível em inglês e português. Mais idiomas em breve.",
  "platforms.title1": "Disponível na",
  "platforms.title2": " web e mobile",
  "platforms.subtitle": "Acesse seus hábitos de qualquer dispositivo, a qualquer hora.",
  "platforms.web.title": "Aplicativo Web",
  "platforms.web.desc":
    "Acesse o Orbit de qualquer navegador. Seus hábitos sincronizam em todos os dispositivos.",
  "platforms.web.cta": "Abrir Aplicativo Web",
  "platforms.android.badge": "Disponível Agora",
  "platforms.android.title": "Android",
  "platforms.android.desc":
    "Leve o Orbit com você. Acompanhe hábitos em movimento com nosso app Android nativo.",
  "platforms.android.cta": "Baixar no Google Play",
  "cta.title1": "Pronto para construir",
  "cta.title2": "hábitos melhores",
  "cta.title3": "?",
  "cta.subtitle": "Grátis para começar. Sem cartão de crédito.",
  "cta.button": "Começar",
  "footer.privacy": "Política de Privacidade",
  "footer.text": "Orbit · © 2026",
};

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  "pt-BR": ptBR,
};
