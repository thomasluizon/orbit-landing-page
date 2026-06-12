# Orbit Landing Page

Marketing landing page for **Orbit** -- an AI-powered habit tracker. A single-page static site showcasing features, platform availability, and bilingual content.

**Live:** [useorbit.org](https://useorbit.org) | **App:** [app.useorbit.org](https://app.useorbit.org) | **API:** [api.useorbit.org](https://api.useorbit.org)

## Tech Stack

| Layer      | Technology                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Framework  | [Astro 6](https://astro.build)                                                                  |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com)                                                      |
| Fonts      | Rubik / Inter / Roboto, self-hosted via Astro's Fonts API                                       |
| Icons      | [Lucide](https://lucide.dev) (`@lucide/astro`)                                                  |
| Linting    | ESLint flat config (`eslint-plugin-astro`, `typescript-eslint`, `local/no-comments`) + Prettier |
| Deployment | [Vercel](https://vercel.com) (static output)                                                    |

## Features

- **Hero Section** -- Eyebrow, headline, subtitle, pill CTAs, and a phone mockup of the Orbit app's Today screen built from the design system's own primitives
- **Features Section** -- Streak stat tile + AI insight card, plus a list-row card for Smart Scheduling, Sub-Habits, Calendar View, and Multi-Language
- **Platform Section** -- Web App and Android (Google Play) cards with CTAs
- **CTA Section** -- Satellite glyph and final call-to-action
- **Bilingual** -- Client-side i18n switching between English and Portuguese (Brazil) via `data-i18n` attributes with cookie persistence
- **Scroll Animations** -- Intersection Observer reveals, transform + opacity only, `prefers-reduced-motion` respected
- **Sticky Header** -- Transparent at top, opaque canvas with hairline on scroll
- **SEO** -- Open Graph and Twitter meta tags, JSON-LD, semantic HTML
- **Responsive** -- Mobile-first from 360px to 1440px

## Design System

Mirrors the Orbit app's **navy-violet orbital** design system. The canon lives in the `orbit-ui-mobile` repo (`DESIGN.md`); this repo ports the purple-scheme dark tokens into `src/styles/global.css`:

| Token           | Value                                          |
| --------------- | ---------------------------------------------- |
| Canvas          | `#020618`                                      |
| Primary         | `#7f46f7` (pressed `#631df2`)                  |
| Gradient header | `#22094f → transparent`                        |
| Foregrounds     | `#f8fafc` / `#cad5e2` / `#90a1b9` / `#62748e`  |
| Cards           | `rgba(248,250,252,0.04)` + inset hairline ring |
| Hairlines       | `rgba(248,250,252,0.10)` / `0.18`              |

Dark-only theme, pill CTAs with violet glow, translucent surfaces, Rubik/Inter/Roboto type. See `CLAUDE.md` for token-mirror rules and code standards.

## Prerequisites

- **Node.js** >= 22.12.0

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The site runs at `http://localhost:4321`.

## Project Structure

```
src/
  pages/
    index.astro          # Thin composition of section components
    404.astro            # Not-found page
  layouts/
    Layout.astro         # Base HTML with meta tags, OG/Twitter cards, fonts
  components/
    Header.astro         # Fixed header: logo, language toggle, CTA
    Hero.astro           # Gradient crown, headline, CTAs, mockup, satellite
    AppMockup.astro      # Phone mockup of the app's Today screen
    Features.astro       # Stat tile + AI card + feature list rows
    Platforms.astro      # Web + Android cards
    Cta.astro            # Closing call-to-action
    Footer.astro         # Logo, privacy link, copyright
    PillButton.astro     # Pill CTA primitive (primary glow / ghost)
    SatelliteGlyph.astro # Kit satellite SVG
  i18n/
    translations.ts      # Typed EN/PT-BR copy tables
  scripts/
    i18n.ts              # Language detection, cookie, toggle, DOM apply
    reveal.ts            # IntersectionObserver scroll reveals
    header-scroll.ts     # Header scrolled state
  styles/
    global.css           # Tailwind v4 @theme token mirror + type roles + base
eslint-rules/
  no-comments.cjs        # Comment policy rule, mirrored from orbit-ui-mobile
astro.config.mjs         # Site config, fonts, sitemap, Tailwind Vite plugin
```

### i18n Implementation

Language switching is handled client-side with typed tables in `src/i18n/translations.ts`:

- All translatable elements use `data-i18n="key"` attributes
- `Record<TranslationKey, string>` makes a missing PT-BR key a compile error
- Language state persisted in `orbit_lang` cookie (1 year, SameSite Lax)
- Auto-detects browser language on first visit (`pt` prefix maps to `pt-BR`)
- Toggle button in header switches between EN and PT

## Scripts

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Start dev server at `localhost:4321`   |
| `npm run build`   | Build static site to `./dist/`         |
| `npm run preview` | Preview production build locally       |
| `npm run lint`    | ESLint (`lint:fix` to autofix)         |
| `npm run format`  | Prettier write (`format:check` for CI) |
| `npm run check`   | `astro check` type checking            |

## Deployment

Deployed on [Vercel](https://vercel.com) as a static site with auto-deploy on push to `main`.

**Domain:** `useorbit.org`

The `PUBLIC_APP_URL` environment variable controls the app link (defaults to `https://app.useorbit.org`).

## Related Repositories

| Repo                                                               | Description                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [orbit-ui-mobile](https://github.com/thomasluizon/orbit-ui-mobile) | Turborepo: Next.js 15 web app + Expo Android app (owns `DESIGN.md`, the design canon) |
| [orbit-api](https://github.com/thomasluizon/orbit-api)             | .NET 10 REST API backend                                                              |

## License

Private project.
