# Orbit Landing Page

Landing page for Orbit, an AI that tracks habits. Static Astro + Tailwind site deployed on Render at useorbit.org through the manual release workflow. Sibling repos: `../orbit-ui-mobile` (app monorepo) and `../orbit-api` (.NET API).

## Design system (mirrored, not owned)

The design canon lives in `orbit-ui-mobile`: `DESIGN.md` (authoritative spec) + `design/canvas/` (granted drawings). This repo MIRRORS the dark tokens into `src/styles/global.css` (`@theme` + `:root`). When `DESIGN.md` changes token values, update the mirror in the same task. Never invent new colors, fonts, or radii here.

- Anchor: spacious near-black. Canvas `#09090B`, warm orange `#C4530F`, Geist Sans/Space Grotesk/Geist Mono, neutral surface steps, flat pill CTAs. No decorative glow or gradient wash.
- Dark-only (landing deviation); the single accent follows the current canon.
- Fonts are self-hosted via Astro's Fonts API (`astro.config.mjs`), exposed as `--font-geist/space-grotesk/geist-mono`.
- No raw slate values, no hardcoded violet rgba (use `rgba(var(--primary-rgb), α)`), no `transition-all`, no `h-screen` (use `min-h-dvh`), no em dashes in copy.

## Code standards

Same 10 rules as the monorepo's root `CLAUDE.md`: root cause over workarounds; delete unused code; no `any`; no `console.*` in production (DEV-gated only); strict comment policy (below); no premature abstraction; ~50-line functions; error handling at boundaries only; descriptive naming; DRY at the right level.

### Comment policy (lint-enforced via `local/no-comments`, autofix strips violations)

- Allowed: `/** */` JSDoc on exported symbols; tooling directives (`eslint-disable`, `@ts-expect-error`, `// @ts-check`); WHY comments ONLY when they link an upstream issue/PR/doc URL.
- Banned: everything else. No narration, no section bars, no TODOs. Rename or extract instead.
- The rule source is `eslint-rules/no-comments.cjs`. Keep its behavior aligned with the sibling repository's rule.
- Write rules, docs, and comments timelessly: no dates except load-bearing data, names or attributions, incident stories, or machine paths. `tools/check-timeless.mjs` enforces this.

## Architecture

- `src/i18n/translations.ts` - typed EN/PT-BR tables (`Record<TranslationKey, string>` enforces key parity at compile time)
- `src/scripts/` - client modules: `i18n.ts` (language cookie, toggle, copy and structured data), `waitlist.ts` (Turnstile and waitlist requests), `analytics.ts` (consent-gated loader), `consent.ts` (analytics choice and events)
- `src/styles/global.css` - the token mirror + type roles + base styles (single CSS file)

## i18n

Bilingual EN/PT-BR via `data-i18n` attributes applied client-side. Every new user-facing string needs a key in BOTH tables in `src/i18n/translations.ts` (the type makes a missing PT key a compile error). Brand words ("Orbit") stay untranslated.

## Commands

Standard Astro scripts; read `package.json` for the list. The CI-gating ones are
`format:check` and `check` (`astro check`), not just `lint`.

CI on PRs to main runs `build.yml` (audit + lint + format:check + check + build + internal-link check, plus the required `Lighthouse` check) and `dependency-review.yml`. Lighthouse consumes Build's checked `dist` artifact and collects three samples per page. Performance, LCP and TBT assertions use the median; the other assertions require every sample to pass. Lighthouse blocks merging when the home page falls below 0.90 for performance, accessibility, best practices, or SEO, exceeds 2850 ms LCP or 200 ms TBT, or any audited page exceeds 24 KB of script. The synthetic 404 page remains subject to accessibility, best practices, LCP, and script-size assertions, but not performance or TBT. The original review behind this exception reported 0.77 performance and 889 ms TBT for 295 bytes of script. A [Lighthouse CI run](https://github.com/thomasluizon/orbit-landing-page/actions/runs/39685371885) on October 21, 2026, using the same source tree as `7516f49`, measured 1.00 performance, 0 ms TBT, and 4,956 bytes of transferred script across all three 404 samples; these results meet the home-page performance and TBT budgets. Any change that adds script to the 404 page, including shared imports, must re-measure the page and restore the home-page performance and TBT assertions before merge. The post-waitlist confirmation page (`/waitlist-confirmed/`) is excluded from Lighthouse collection by `ci.collect.autodiscoverUrlBlocklist` in `lighthouserc.json`, which matches its generated path `/waitlist-confirmed/index.html`. No Lighthouse assertions run on that page, including the merge-blocking accessibility assertion (`categories:accessibility` at `error` with a 0.90 minimum score), so accessibility regressions there do not block merging through Lighthouse. `nightly.yml` runs a scheduled external-link check only, filing a de-duped issue on regression. Lighthouse runs at PR time in `build.yml`, not nightly.

## Git workflow

- Branch protection on `main`: no direct pushes, no force pushes. Squash-merge only; head branches auto-delete.
- Branch naming: `feature/xxx`, `fix/xxx`, `chore/xxx`.
- Never reuse a branch after its PR is squash-merged.
- One feature or fix per PR. Cross-repo design changes link the `orbit-ui-mobile` issue/PR in the description.

## Links

- App: https://app.useorbit.org
- API: https://api.useorbit.org
- Landing: https://useorbit.org
