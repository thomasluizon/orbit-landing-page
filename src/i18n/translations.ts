export const LANGUAGES = ["en", "pt-BR"] as const;

export type Language = (typeof LANGUAGES)[number];

const en = {
  "header.cta": "Start free",

  "hero.eyebrow": "Meet Astra, your AI coach",
  "hero.title1": "The habit tracker",
  "hero.title2": "you can talk to",
  "hero.subtitle":
    'Astra is an AI coach that acts, not just chats. Say "I ran today" and it logs it. Ask "how am I doing?" and it reads your real streaks. Type, speak, or connect your own AI assistant.',
  "hero.cta": "Start free",
  "hero.ctaNote": "7-day Pro trial, no card required",
  "hero.android": "Google Play",

  "mockup.yourDay": "Your Day",
  "mockup.aiText":
    "Amazing consistency! You've completed 5 of 7 habits today. Your morning routine streak is at 12 days.",
  "mockup.habit1": "Morning Routine",
  "mockup.habit2": "Exercise",
  "mockup.habit3": "Read 30 minutes",
  "mockup.habit4": "Meditate",
  "mockup.freq.daily": "Daily",

  "features.title1": "Everything you need to build",
  "features.title2": " habits that stick",
  "features.astra.title": "Astra, your AI coach",
  "features.astra.desc":
    "Chat or speak to create, log, and adjust habits. 61 built-in tools mean almost anything you can tap, you can just ask.",
  "features.astra.tag": "61 tools",
  "features.mcp.title": "Connect your own AI",
  "features.mcp.desc":
    "Orbit speaks MCP, so Claude or ChatGPT can manage your habits from wherever you already chat.",
  "features.social.title": "Support, not scoreboards",
  "features.social.desc":
    "Accountability buddies, co-op challenges, and cheers. No leaderboards, and off until you opt in.",
  "features.tracker.title": "A serious core tracker",
  "features.tracker.desc":
    "Daily, weekly, flexible, or one-time habits, with sub-habits, checklists, and bad-habit tracking.",
  "features.calendar.title": "Calendar and Google sync",
  "features.calendar.desc":
    "A color-coded month view, plus import your Google Calendar events straight into your habits.",
  "features.rewards.title": "Streaks, XP, and Wrapped",
  "features.rewards.desc":
    "Streak freezes, achievement badges, levels, and a shareable Orbit Wrapped recap.",
  "features.widget.title": "Android home-screen widget",
  "features.widget.desc": "Today's habits at a glance, right on your home screen.",

  "mcp.eyebrow": "Model Context Protocol",
  "mcp.title1": "Run your habits from",
  "mcp.title2": "Claude or ChatGPT",
  "mcp.desc":
    "Orbit exposes a full MCP server, so your favorite AI assistant can create habits, log progress, and check your streaks without leaving your chat.",
  "mcp.stat1Value": "79",
  "mcp.stat1Label": "MCP tools",
  "mcp.stat2Value": "15",
  "mcp.stat2Label": "tool categories",
  "mcp.point1": "OAuth 2.0 or scoped, hashed API keys",
  "mcp.point2": "Read-only or full access, revocable anytime",
  "mcp.point3": "Scoped to your account, nothing else",
  "mcp.caption": "Ask your assistant to log a habit. It just works.",
  "mcp.chat.user": "Log my run for today",
  "mcp.chat.reply": "Done. Your running streak is now 6 days.",

  "proof.eyebrow": "Why Orbit",
  "proof.title": "Built by someone who needed it",
  "proof.registrations.label": "pre-registrations",
  "proof.installs.label": "installs",
  "proof.paying.label": "paying users",
  "proof.astraTools.label": "Astra tools",
  "proof.mcpTools.label": "MCP tools",
  "proof.founder.body":
    "I'm a software engineer with ADHD. I ran my whole life out of Notion, but it grew so complex that keeping it up became its own chore. So I built Orbit: the simple, forgiving habit tracker I wished existed, for me and for anyone whose brain works the same way.",
  "proof.founder.name": "Thomas, founder of Orbit",

  "pricing.eyebrow": "Pricing",
  "pricing.title": "Start free. Upgrade when it clicks.",
  "pricing.trial": "7-day Pro trial, no card required",
  "pricing.free.name": "Free",
  "pricing.free.tagline": "Everything you need to get going.",
  "pricing.free.f1": "Up to 10 habits",
  "pricing.free.f2": "20 AI messages a month",
  "pricing.free.f3": "Streaks, XP, and achievements",
  "pricing.free.f4": "Social and accountability buddies",
  "pricing.free.cta": "Start free",
  "pricing.pro.name": "Pro",
  "pricing.pro.badge": "Most popular",
  "pricing.pro.tagline": "The full coach, unlocked.",
  "pricing.pro.f1": "Unlimited habits",
  "pricing.pro.f2": "500 AI messages a month",
  "pricing.pro.f3": "Sub-habits, goals, and calendar sync",
  "pricing.pro.f4": "AI memory, MCP, and API keys",
  "pricing.pro.cta": "Start 7-day trial",
  "pricing.note": "No credit card to start the trial. Cancel anytime.",

  "platforms.title1": "Available on",
  "platforms.title2": " web and Android",
  "platforms.subtitle": "Access your habits from any device, anytime.",
  "platforms.web.title": "Web App",
  "platforms.web.desc": "Access Orbit from any browser. Your habits sync across all your devices.",
  "platforms.web.cta": "Open Web App",
  "platforms.android.badge": "Available Now",
  "platforms.android.title": "Android",
  "platforms.android.desc":
    "Take Orbit with you. Track habits on the go with our native Android app.",
  "platforms.android.cta": "Get it on Google Play",

  "ios.eyebrow": "Coming soon",
  "ios.title": "Orbit is coming to iPhone",
  "ios.desc":
    "The iOS app is in the works. Leave your email and we'll tell you the moment it's ready. Double opt-in, no spam.",
  "ios.placeholder": "you@example.com",
  "ios.button": "Notify me",
  "ios.submitting": "Sending...",
  "ios.success": "Almost there. Check your inbox to confirm your spot.",
  "ios.error": "Something went wrong. Please try again.",
  "ios.invalidEmail": "Please enter a valid email address.",
  "ios.privacy": "We'll only email you about the iOS launch.",

  "faq.title": "Questions, answered",
  "faq.q1": "Is Orbit free?",
  "faq.a1":
    "Yes. The free plan gives you up to 10 habits, 20 AI messages a month, streaks, and social features. Pro unlocks unlimited habits and 500 messages a month, with a 7-day trial that needs no card.",
  "faq.q2": "What is Astra?",
  "faq.a2":
    'Astra is Orbit\'s built-in AI coach. It creates, logs, and adjusts your habits from a chat or your voice, and it reads your real streaks and completion rates to answer questions like "how am I doing?"',
  "faq.q3": "Can I use Orbit from Claude or ChatGPT?",
  "faq.a3":
    "Yes. Orbit exposes a Model Context Protocol server, so any MCP-capable assistant can manage your habits and goals. It's secured by OAuth or scoped API keys and available on the Pro plan.",
  "faq.q4": "Do I need a credit card for the trial?",
  "faq.a4":
    "No. The 7-day Pro trial starts at signup with no card. If you don't upgrade, you simply move to the free plan.",
  "faq.q5": "Which platforms does Orbit support?",
  "faq.a5":
    "Orbit runs on the web and on Android today. An iPhone app is coming soon, so join the waitlist above to hear first.",
  "faq.q6": "Are there leaderboards?",
  "faq.a6":
    "No. Orbit's social layer is built for support, with accountability buddies, co-op challenges, and cheers. It stays off until you opt in, so your habits are private by default.",
  "faq.q7": "Is my data private?",
  "faq.a7":
    "Your habits are private by default and social features are opt-in. AI and MCP access is scoped to your own account, and you can delete your account and data anytime.",

  "waitlistConfirmed.ok.title": "You're on the list",
  "waitlistConfirmed.ok.body":
    "Thanks for confirming. We'll email you the moment Orbit lands on iPhone.",
  "waitlistConfirmed.invalid.title": "This link has expired",
  "waitlistConfirmed.invalid.body":
    "Your confirmation link is invalid or has expired. Head back and join the waitlist again.",
  "waitlistConfirmed.cta": "Back to Orbit",

  "cta.title1": "Ready to build",
  "cta.title2": "better habits",
  "cta.title3": "?",
  "cta.subtitle": "Start free today. 7-day Pro trial, no card required.",
  "cta.button": "Start free",

  "footer.privacy": "Privacy Policy",
  "footer.terms": "Terms",
  "footer.text": "Orbit · © 2026",
};

export type TranslationKey = keyof typeof en;

const ptBR: Record<TranslationKey, string> = {
  "header.cta": "Começar grátis",

  "hero.eyebrow": "Conheça a Astra, seu coach com IA",
  "hero.title1": "O rastreador de hábitos",
  "hero.title2": "com quem você conversa",
  "hero.subtitle":
    'A Astra é um coach com IA que age, não só conversa. Diga "corri hoje" e ela registra. Pergunte "como estou indo?" e ela lê suas sequências reais. Digite, fale ou conecte seu próprio assistente de IA.',
  "hero.cta": "Começar grátis",
  "hero.ctaNote": "Teste Pro de 7 dias, sem cartão",
  "hero.android": "Google Play",

  "mockup.yourDay": "Seu Dia",
  "mockup.aiText":
    "Consistência incrível! Você completou 5 de 7 hábitos hoje. Sua sequência matinal está em 12 dias.",
  "mockup.habit1": "Rotina Matinal",
  "mockup.habit2": "Exercício",
  "mockup.habit3": "Ler 30 minutos",
  "mockup.habit4": "Meditar",
  "mockup.freq.daily": "Diário",

  "features.title1": "Tudo que você precisa para construir",
  "features.title2": " hábitos que duram",
  "features.astra.title": "Astra, seu coach com IA",
  "features.astra.desc":
    "Converse ou fale para criar, registrar e ajustar hábitos. São 61 ferramentas integradas: quase tudo que você toca, você pode simplesmente pedir.",
  "features.astra.tag": "61 ferramentas",
  "features.mcp.title": "Conecte sua própria IA",
  "features.mcp.desc":
    "O Orbit fala MCP, então Claude ou ChatGPT podem gerenciar seus hábitos de onde você já conversa.",
  "features.social.title": "Apoio, não ranking",
  "features.social.desc":
    "Parceiros de responsabilidade, desafios cooperativos e incentivos. Sem rankings, e desativado até você optar por ativar.",
  "features.tracker.title": "Um rastreador sério de verdade",
  "features.tracker.desc":
    "Hábitos diários, semanais, flexíveis ou únicos, com sub-hábitos, checklists e controle de maus hábitos.",
  "features.calendar.title": "Calendário e sincronização Google",
  "features.calendar.desc":
    "Uma visão mensal colorida, e importe eventos do Google Agenda direto para seus hábitos.",
  "features.rewards.title": "Sequências, XP e Wrapped",
  "features.rewards.desc":
    "Proteções de sequência, medalhas de conquista, níveis e um resumo Orbit Wrapped para compartilhar.",
  "features.widget.title": "Widget na tela inicial do Android",
  "features.widget.desc": "Os hábitos de hoje num piscar de olhos, na sua tela inicial.",

  "mcp.eyebrow": "Model Context Protocol",
  "mcp.title1": "Gerencie seus hábitos pelo",
  "mcp.title2": "Claude ou ChatGPT",
  "mcp.desc":
    "O Orbit expõe um servidor MCP completo, então seu assistente de IA favorito pode criar hábitos, registrar progresso e checar suas sequências sem sair da conversa.",
  "mcp.stat1Value": "79",
  "mcp.stat1Label": "ferramentas MCP",
  "mcp.stat2Value": "15",
  "mcp.stat2Label": "categorias de ferramentas",
  "mcp.point1": "OAuth 2.0 ou chaves de API com escopo e hash",
  "mcp.point2": "Acesso somente leitura ou completo, revogável a qualquer momento",
  "mcp.point3": "Restrito à sua conta, nada além disso",
  "mcp.caption": "Peça ao seu assistente para registrar um hábito. Simplesmente funciona.",
  "mcp.chat.user": "Registre minha corrida de hoje",
  "mcp.chat.reply": "Pronto. Sua sequência de corrida está em 6 dias.",

  "proof.eyebrow": "Por que o Orbit",
  "proof.title": "Feito por quem precisava dele",
  "proof.registrations.label": "pré-cadastros",
  "proof.installs.label": "instalações",
  "proof.paying.label": "usuários pagantes",
  "proof.astraTools.label": "ferramentas Astra",
  "proof.mcpTools.label": "ferramentas MCP",
  "proof.founder.body":
    "Sou engenheiro de software com TDAH. Organizava minha vida inteira no Notion, mas ficou tão complexo que mantê-lo virou uma tarefa em si. Então construí o Orbit: o rastreador de hábitos simples e tolerante que eu queria que existisse, para mim e para quem tem a mente parecida.",
  "proof.founder.name": "Thomas, fundador do Orbit",

  "pricing.eyebrow": "Planos",
  "pricing.title": "Comece grátis. Faça upgrade quando fizer sentido.",
  "pricing.trial": "Teste Pro de 7 dias, sem cartão",
  "pricing.free.name": "Grátis",
  "pricing.free.tagline": "Tudo que você precisa para começar.",
  "pricing.free.f1": "Até 10 hábitos",
  "pricing.free.f2": "20 mensagens de IA por mês",
  "pricing.free.f3": "Sequências, XP e conquistas",
  "pricing.free.f4": "Social e parceiros de responsabilidade",
  "pricing.free.cta": "Começar grátis",
  "pricing.pro.name": "Pro",
  "pricing.pro.badge": "Mais popular",
  "pricing.pro.tagline": "O coach completo, liberado.",
  "pricing.pro.f1": "Hábitos ilimitados",
  "pricing.pro.f2": "500 mensagens de IA por mês",
  "pricing.pro.f3": "Sub-hábitos, metas e sincronização de calendário",
  "pricing.pro.f4": "Memória de IA, MCP e chaves de API",
  "pricing.pro.cta": "Iniciar teste de 7 dias",
  "pricing.note": "Sem cartão para começar o teste. Cancele quando quiser.",

  "platforms.title1": "Disponível na",
  "platforms.title2": " web e no Android",
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

  "ios.eyebrow": "Em breve",
  "ios.title": "O Orbit está chegando ao iPhone",
  "ios.desc":
    "O app de iOS está a caminho. Deixe seu e-mail e avisaremos assim que estiver pronto. Confirmação dupla, sem spam.",
  "ios.placeholder": "voce@exemplo.com",
  "ios.button": "Avise-me",
  "ios.submitting": "Enviando...",
  "ios.success": "Quase lá. Confira sua caixa de entrada para confirmar sua vaga.",
  "ios.error": "Algo deu errado. Tente novamente.",
  "ios.invalidEmail": "Digite um endereço de e-mail válido.",
  "ios.privacy": "Só enviaremos e-mails sobre o lançamento no iOS.",

  "faq.title": "Perguntas, respondidas",
  "faq.q1": "O Orbit é grátis?",
  "faq.a1":
    "Sim. O plano grátis dá até 10 hábitos, 20 mensagens de IA por mês, sequências e recursos sociais. O Pro libera hábitos ilimitados e 500 mensagens por mês, com um teste de 7 dias que não pede cartão.",
  "faq.q2": "O que é a Astra?",
  "faq.a2":
    'A Astra é o coach com IA integrado ao Orbit. Ela cria, registra e ajusta seus hábitos por chat ou voz, e lê suas sequências e taxas de conclusão reais para responder perguntas como "como estou indo?"',
  "faq.q3": "Posso usar o Orbit pelo Claude ou ChatGPT?",
  "faq.a3":
    "Sim. O Orbit expõe um servidor Model Context Protocol, então qualquer assistente compatível com MCP pode gerenciar seus hábitos e metas. É protegido por OAuth ou chaves de API com escopo e está disponível no plano Pro.",
  "faq.q4": "Preciso de cartão de crédito para o teste?",
  "faq.a4":
    "Não. O teste Pro de 7 dias começa no cadastro, sem cartão. Se você não fizer upgrade, simplesmente passa para o plano grátis.",
  "faq.q5": "Em quais plataformas o Orbit funciona?",
  "faq.a5":
    "O Orbit funciona na web e no Android hoje. Um app para iPhone está chegando, então entre na lista de espera acima para saber primeiro.",
  "faq.q6": "Existem rankings?",
  "faq.a6":
    "Não. A camada social do Orbit é feita para apoio, com parceiros de responsabilidade, desafios cooperativos e incentivos. Fica desativada até você optar por ativar, então seus hábitos são privados por padrão.",
  "faq.q7": "Meus dados são privados?",
  "faq.a7":
    "Seus hábitos são privados por padrão e os recursos sociais são opcionais. O acesso de IA e MCP é restrito à sua própria conta, e você pode excluir sua conta e seus dados quando quiser.",

  "waitlistConfirmed.ok.title": "Você está na lista",
  "waitlistConfirmed.ok.body":
    "Obrigado por confirmar. Avisaremos assim que o Orbit chegar ao iPhone.",
  "waitlistConfirmed.invalid.title": "Este link expirou",
  "waitlistConfirmed.invalid.body":
    "Seu link de confirmação é inválido ou expirou. Volte e entre na lista de espera novamente.",
  "waitlistConfirmed.cta": "Voltar ao Orbit",

  "cta.title1": "Pronto para construir",
  "cta.title2": "hábitos melhores",
  "cta.title3": "?",
  "cta.subtitle": "Comece grátis hoje. Teste Pro de 7 dias, sem cartão.",
  "cta.button": "Começar grátis",

  "footer.privacy": "Política de Privacidade",
  "footer.terms": "Termos",
  "footer.text": "Orbit · © 2026",
};

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  "pt-BR": ptBR,
};
