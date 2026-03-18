# Orbit Landing Page

Marketing landing page for the Orbit habit tracker. Static site deployed on Vercel at useorbit.org.

## Stack

- **Framework:** Astro 5
- **Styling:** Tailwind CSS v4
- **Font:** Manrope (Google Fonts)
- **Deployment:** Vercel (static output)

## Dev Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```

## Design System

Shares the Orbit app's design tokens:
- **Theme:** Dark-only. Purple primary (#8b5cf6), black/gray surfaces (#0a0a0a, #141414)
- **Typography:** Manrope font, fluid sizing
- **Components:** Rounded-3xl buttons/cards, purple glow shadows on CTAs
- **Colors:** text-primary (#fff), text-secondary (#a3a3a3), text-muted (#525252), border (#262626)

## Architecture

Single-page static site:
- `src/pages/index.astro` - Main landing page
- `src/layouts/Layout.astro` - Base HTML layout with meta tags
- `src/styles/global.css` - Tailwind theme config + custom properties

## Links

- **App:** https://app.useorbit.org
- **API:** https://api.useorbit.org
- **Landing:** https://useorbit.org
