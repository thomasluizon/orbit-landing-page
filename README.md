# Orbit Landing Page

Marketing landing page for **Orbit** -- an AI-powered habit tracker. A single-page static site showcasing features, platform availability, and bilingual content.

**Live:** [useorbit.org](https://useorbit.org) | **App:** [app.useorbit.org](https://app.useorbit.org) | **API:** [api.useorbit.org](https://api.useorbit.org)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Astro 6](https://astro.build) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Font | [Manrope](https://fonts.google.com/specimen/Manrope) (Google Fonts) |
| Deployment | [Vercel](https://vercel.com) (static output) |

## Features

- **Hero Section** -- Headline, subtitle, CTA button, and an interactive phone mockup showing the Orbit app with sample habits, streaks, and AI summary
- **Feature Grid** -- Six feature cards: Smart Scheduling, Streak Tracking, AI Insights, Sub-Habits, Calendar View, Multi-Language
- **Platform Section** -- Web App (live) and Android (coming soon) cards with CTAs
- **CTA Section** -- Final call-to-action with gradient background glow
- **Bilingual** -- Client-side i18n switching between English and Portuguese (Brazil) via `data-i18n` attributes with cookie persistence
- **Scroll Animations** -- Intersection Observer-based fade-in animations on all sections
- **Sticky Header** -- Transparent on top, blurred background on scroll with border transition
- **SEO** -- Open Graph and Twitter meta tags, semantic HTML
- **Responsive** -- Mobile-first design from 320px to desktop, grid-based feature layout

## Design System

Shares the Orbit app's visual identity:

| Token | Value |
|-------|-------|
| Primary | `#8b5cf6` (purple) |
| Background | `#0a0a0a` |
| Surface | `#141414` |
| Text Primary | `#ffffff` |
| Text Secondary | `#a3a3a3` |
| Text Muted | `#525252` |
| Border | `#262626` |

Dark-only theme with purple glow CTAs, rounded-3xl cards, and gradient text headings.

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
    index.astro          # Main landing page (hero, features, platforms, CTA, footer)
  layouts/
    Layout.astro         # Base HTML with meta tags, OG/Twitter cards, font loading
  styles/
    global.css           # Tailwind v4 theme config, custom properties, animations
public/
  logo.png               # Orbit logo
astro.config.mjs         # Astro config with Tailwind CSS Vite plugin
```

### i18n Implementation

Language switching is handled client-side with inline translations in `index.astro`:

- All translatable elements use `data-i18n="key"` attributes
- Language state persisted in `orbit_lang` cookie (1 year, SameSite Lax)
- Auto-detects browser language on first visit (`pt` prefix maps to `pt-BR`)
- Toggle button in header switches between EN and PT

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Build static site to `./dist/` |
| `npm run preview` | Preview production build locally |

## Deployment

Deployed on [Vercel](https://vercel.com) as a static site with auto-deploy on push to `main`.

**Domain:** `useorbit.org`

The `PUBLIC_APP_URL` environment variable controls the app link (defaults to `https://app.useorbit.org`).

## Related Repositories

| Repo | Description |
|------|-------------|
| [orbit-ui](https://github.com/thomasluizon/orbit-ui) | Nuxt 4 frontend (web + Android) |
| [orbit-api](https://github.com/thomasluizon/orbit-api) | .NET 10 REST API backend |

## License

Private project.
