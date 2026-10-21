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
| `PUBLIC_APP_URL`             | HTTPS app-entry links; defaults to `https://app.useorbit.org`                   |
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

## App entry and Android installation

The header, hero, Free and Pro pricing actions, accepted demo continuation, closing action, footer Open Orbit link and successful waitlist confirmation keep configured HTTPS app hrefs in delivered HTML. Their explicit `data-app-entry` opt-in loads through the shared pill module immediately, without waiting for motion or analytics. Desktop, iPhone, iPad, unknown devices, JavaScript-disabled and pre-hydration activation use those web links. Modified clicks, middle clicks, copied links, new tabs and context-menu actions retain normal anchor behavior. Legal, consent privacy, waitlist, contact and local/demo-edit controls do not opt in.

On a trusted, unmodified Chrome for Android click or Enter activation, the handler uses [Chrome's documented Android intent mechanism](https://developer.chrome.com/docs/android/intents) synchronously, with one package-bound custom scheme and an independently encoded `S.browser_fallback_url`. The browser owns launch and fallback; a UA match or assigned location proves neither installation nor successful handoff. Chrome for Android is the documented acceptance target. Other Android browser signatures and known embedded-browser signatures retain web navigation. A browser can share Chrome’s signature, so physical verification is still required; universal support is not claimed. There are no launch timers, retries, installed-app probes, visibility checks or extra network requests.

The two existing build-time variables select a coherent target:

| `PUBLIC_APP_URL`                   | `PUBLIC_ANDROID_INSTALL_URL`                                             | Scheme / package                             |
| ---------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `https://app.useorbit.org`         | `https://play.google.com/store/apps/details?id=org.useorbit.app`         | `orbit` / `org.useorbit.app`                 |
| `https://app-staging.useorbit.org` | `https://play.google.com/store/apps/details?id=org.useorbit.app.staging` | `orbit-staging` / `org.useorbit.app.staging` |

The configured Play URL must use HTTPS, the Play details path and exactly one matching package id. Preview origins, malformed URLs, crossed pairs and unsupported destinations retain HTTPS navigation. Only root, `/upgrade` and `/habits/new?title=...` qualify. The handler reads the current href when activated, so approved demo edits replace the destination. Serialized query values stay data and cannot add intent directives. The installed Expo Router receiver decodes custom-scheme query values before reparsing them: titles containing `&`, `+`, `#`, `%`, tabs, line breaks or trailing whitespace therefore keep their complete HTTPS continuation. This preserves the draft instead of handing a changed title to native.

The explicit Install on Android footer link, clickable QR, generated QR payload and Android structured `installUrl` always use the configured Play URL, including on iPhone. The Play fallback opens the listing; it does not restore Pro or a demo draft after a new installation. Consent-gated CTA capture retains its existing `{surface}` shape; hero and closing actions share the generic app event with distinct hero/footer surfaces. No destination, title or install outcome is added to telemetry.

Native interface evidence comes from UI commit `084495ce1398eed96199f674b4f3202bf8dab99a`: `apps/mobile/app.json`, `app.config.js`, `app/+native-intent.tsx`, `app/habits/new.tsx` and the existing upgrade route; installed Expo Router 57.0.24 and config-plugins 57.0.9 establish route parsing and BROWSABLE scheme production. Source and Node VM tests do not prove a generated manifest, installed binary, native navigation or Play delivery.

Release uses the existing GitHub Actions **Release landing** workflow: stage the carrying branch, then record the exact landing commit, browser/version, Android package/version, installed/absent state and observed root, Pro and demo paths on a physical device. Also verify desktop/iOS HTTPS navigation, manual web/store fallback, both languages, keyboard activation and the QR label at narrow/wide widths and 200% text. Browser/device and rendered evidence remain a release acceptance boundary. Production follows normal checks/review and the existing manual `main` release. No new variables, console changes, app release or infrastructure migration are required. Removing the targeted handler leaves the HTTPS anchors as the rollback path.

## Related Repositories

| Repo                                                               | Description                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [orbit-ui-mobile](https://github.com/thomasluizon/orbit-ui-mobile) | Turborepo: Next.js web app + Expo Android app (owns `DESIGN.md`, the design canon) |
| [orbit-api](https://github.com/thomasluizon/orbit-api)             | .NET REST API backend                                                              |

## License

Private project.
