# Orbit Landing Page

Marketing landing page for **Orbit** -- an AI-powered habit tracker. A single-page static site showcasing features, platform availability, and bilingual content.

**Live:** [useorbit.org](https://useorbit.org) | **App:** [app.useorbit.org](https://app.useorbit.org) | **API:** [api.useorbit.org](https://api.useorbit.org)

## Tech Stack

| Layer      | Technology                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Framework  | [Astro](https://astro.build)                                                                    |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com)                                                      |
| Fonts      | Rubik / Inter / Roboto, self-hosted via Astro's Fonts API                                       |
| Icons      | [Lucide](https://lucide.dev) (`@lucide/astro`)                                                  |
| Linting    | ESLint flat config (`eslint-plugin-astro`, `typescript-eslint`, `local/no-comments`) + Prettier |
| Deployment | [Render](https://render.com) (static site)                                                      |

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

- **Node.js** >= 22.19.0

## Getting Started

```bash
npm install

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

Deployed on Render as static sites for production and staging. Auto-deploy is disabled on both sites. Merges and pushes do not deploy them. Run the `Release landing` GitHub Actions workflow from `main` with an environment and branch. The `production` GitHub environment permits deployments only from `main`. Production accepts only the `main` branch; staging accepts the selected branch head.

```sh
gh workflow run release.yml --ref main -f environment=production
gh workflow run release.yml --ref main -f environment=staging -f branch=<branch>
```

**Domain:** `useorbit.org`

Render build contract:

| Setting           | Value                     |
| ----------------- | ------------------------- |
| Node.js           | `NODE_VERSION=22.19.0`    |
| Build command     | `npm ci && npm run build` |
| Publish directory | `dist`                    |
| Auto-deploy       | Disabled                  |

Build-time variables on the Render static site:

| Variable                    | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `PUBLIC_API_URL`            | Waitlist API endpoint; defaults to `https://api.useorbit.org` |
| `PUBLIC_APP_URL`            | Web app links; defaults to `https://app.useorbit.org`         |
| `PUBLIC_POSTHOG_KEY`        | Enables consent-gated PostHog analytics through `/relay/`     |
| `PUBLIC_TURNSTILE_SITE_KEY` | Enables the waitlist Turnstile widget                         |

Configure release credentials in GitHub Settings > Environments:

| Environment  | Secret                           | Variable                     | Deployment branches |
| ------------ | -------------------------------- | ---------------------------- | ------------------- |
| `production` | `RENDER_API_KEY`                 | None                         | Selected: `main`    |
| `staging`    | `RENDER_STAGING_DEPLOY_HOOK_URL` | `RENDER_LANDING_STAGING_URL` | As needed           |

Use a selected deployment branch rule matching only `main` for `production`, with no required reviewers. Set the repository variable `RENDER_LANDING_SERVICE_ID` to the production Render service ID. The staging secret is the staging static site's deploy hook URL from its Render Dashboard > Settings > Deploy Hook. The staging variable is that site's public HTTPS URL. Keep the Render API key out of repository secrets. Once both release paths have succeeded with their environment secrets, delete the old repository secret `RENDER_API_KEY` from GitHub Settings > Secrets and variables > Actions.

The production job uses the Render API to check that auto-deploy is disabled, deploy the resolved commit, wait for it to go live, and confirm that the Render service URL serves that commit through the `orbit-build` meta tag, which `Layout.astro` fills from Render's `RENDER_GIT_COMMIT` build variable. It also checks `https://useorbit.org/`: a page that carries a different build marker fails the run, and a page without one (the old host, before the DNS cutover) records the Render service URL in GitHub Deployments instead of the public domain. The staging job sends the resolved commit SHA as the deploy hook's `ref` parameter, waits until the public staging URL serves that SHA in the same build marker, and records a staging GitHub Deployment. Staging does not use the Render API or change the site's tracked branch.

The Render static site definition in [`orbit-api/infra`](https://github.com/thomasluizon/orbit-api/tree/main/infra) owns the former `vercel.json` delivery rules. Edit Terraform there for changes to:

- The canonical `Link` header on `/`: `<https://useorbit.org/>; rel="canonical"`.
- Security headers on all paths: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- Asset caching on `/_astro/*`: `Cache-Control: public, max-age=31536000, immutable`. Other paths use `Cache-Control: public, max-age=0, must-revalidate`.
- PostHog rewrites: `/relay/static/*` to `https://us-assets.i.posthog.com/static/*`, `/relay/array/*` to `https://us-assets.i.posthog.com/array/*`, and `/relay/*` to `https://us.i.posthog.com/*`.

## Related Repositories

| Repo                                                               | Description                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [orbit-ui-mobile](https://github.com/thomasluizon/orbit-ui-mobile) | Turborepo: Next.js web app + Expo Android app (owns `DESIGN.md`, the design canon) |
| [orbit-api](https://github.com/thomasluizon/orbit-api)             | .NET REST API backend                                                              |

## License

Private project.
