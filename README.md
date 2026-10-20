# Orbit Landing Page

One screen for **Orbit**, an AI that tracks habits. Astra turns a plain request into a proposed routine change for the person to review.

**Live:** [useorbit.org](https://useorbit.org) | **App:** [app.useorbit.org](https://app.useorbit.org) | **API:** [api.useorbit.org](https://api.useorbit.org)

## Tech Stack

| Layer      | Technology                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Framework  | [Astro](https://astro.build)                                                                    |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com)                                                      |
| Fonts      | Geist Sans / Space Grotesk / Geist Mono, self-hosted via Astro's Fonts API                      |
| Icons      | [Lucide](https://lucide.dev) (`@lucide/astro`)                                                  |
| Linting    | ESLint flat config (`eslint-plugin-astro`, `typescript-eslint`, `local/no-comments`) + Prettier |
| Deployment | [Render](https://render.com) (static site)                                                      |

## Page

The header, headline, Astra conversation, actions and footer share one centred column. The page uses the visible viewport height, with fewer conversation turns in short windows.

- Three example requests replay locally, with no model or network call. Each shows a proposed habit change; approval, edit and rejection labels are visual examples.
- English and Brazilian Portuguese copy switches through `data-i18n` attributes with cookie persistence.
- The iPhone waitlist opens in a native dialog, including direct links to `/#ios`, and keeps the existing email confirmation and Turnstile flow.
- Open Graph, Twitter metadata and application structured data describe Astra and the supported platforms.

## Design system

The canon lives in `orbit-ui-mobile/DESIGN.md`. This repository mirrors its dark tokens in `src/styles/global.css`:

| Token        | Value                                         |
| ------------ | --------------------------------------------- |
| Canvas       | `#09090B`                                     |
| Primary      | `#C4530F`                                     |
| Foregrounds  | `#F4F4F6` / `#C9C9CC` / `#8F8F93` / `#5D5D60` |
| Card surface | `rgba(250,250,250,0.04)`                      |
| Hairline     | `rgba(255,255,255,0.08)`                      |

Type sizes step with viewport width. The Astra proposal uses a tonal preview with approval controls. See `CLAUDE.md` for token rules and code standards.

## Viewport assertions

The landing follows a scrolling composition with a centered Astra device, floating product cards, feature sections, pricing, questions and a closing invitation. Node tests check section order, accent actions, bilingual copy, pricing and motion startup. The animation libraries load after paint and interaction. Reduced motion keeps the static composition and does not load the scroll driver.

Rendered checks cover 1352, 1100, 840, 412 and 320 CSS pixels in English and Brazilian Portuguese, including the pinned hero, no horizontal overflow, whole control labels and a static reduced motion page. Rendered evidence and Lighthouse remain part of the orchestrator's verification.

## Prerequisites

- **Node.js** `^22.22.3 || ^24.16.0 || >=26.3.0` (the `engines` range in `package.json`)

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
    index.astro          # One-screen composition and waitlist dialog
    404.astro            # Not-found page
    waitlist-confirmed.astro # Email confirmation result
  layouts/
    Layout.astro         # HTML, metadata, fonts and application structured data
  components/
    Header.astro         # Orbit lockup, language toggle and install action
    Hero.astro           # Copy, conversation and actions in one column
    AstraDemo.astro      # Proposed changes and example request chips
    AstraGlyph.astro     # Astra identity
    IosWaitlist.astro    # Waitlist dialog and form
    Footer.astro         # Privacy, terms and copyright
    PillButton.astro     # Shared action primitive
  i18n/
    translations.ts      # Typed English and Brazilian Portuguese copy
  scripts/
    i18n.ts              # Language cookie, toggle and translated metadata
    demo.ts              # Local scripted examples
    waitlist.ts          # Turnstile and waitlist submission
    waitlist-section.ts  # Fragment navigation and email focus
    scroll.ts           # Deferred scroll animation startup
    landing-motion.ts   # Lenis and GSAP choreography
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
| Node.js           | `NODE_VERSION=22.22.3`    |
| Build command     | `npm ci && npm run build` |
| Publish directory | `dist`                    |
| Auto-deploy       | Disabled                  |

Build-time variables on the Render static site:

| Variable                     | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `PUBLIC_API_URL`             | Waitlist API endpoint; defaults to `https://api.useorbit.org`                   |
| `PUBLIC_ANDROID_INSTALL_URL` | Android install links and generated QR; defaults to the production Play listing |
| `PUBLIC_APP_URL`             | Web app links; defaults to `https://app.useorbit.org`                           |
| `PUBLIC_POSTHOG_KEY`         | Enables consent-gated PostHog analytics through `/relay/`                       |
| `PUBLIC_TURNSTILE_SITE_KEY`  | Enables the waitlist Turnstile widget                                           |

Configure release credentials in GitHub Settings > Environments:

| Environment  | Secret           | Deployment branches |
| ------------ | ---------------- | ------------------- |
| `production` | `RENDER_API_KEY` | Selected: `main`    |
| `staging`    | `RENDER_API_KEY` | Selected: `main`    |

Use a selected deployment branch rule matching only `main` for both environments, with no required reviewers. Set the repository variables `RENDER_LANDING_SERVICE_ID` and `RENDER_LANDING_STAGING_SERVICE_ID` to their respective Render service IDs. Dispatch the workflow from `main` and choose the branch to deploy in its input. Keep the Render API key out of repository secrets. Once both release paths have succeeded with their environment secrets, delete the old repository secret `RENDER_API_KEY` from GitHub Settings > Secrets and variables > Actions.

Both jobs use the Render API to check that auto-deploy is disabled, deploy the resolved commit, wait for it to go live, and confirm that the Render service URL serves that commit through the `orbit-build` meta tag, which `Layout.astro` fills from Render's `RENDER_GIT_COMMIT` build variable. The staging job first sets the service's tracked branch to the selected branch. Production also requires `https://useorbit.org/` to serve the same build marker; a missing or different marker fails the run, and the Deployment records the public URL. Each job records a GitHub Deployment for the verified commit.

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
