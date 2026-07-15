# Orbit Landing Page

Marketing landing page for the Orbit habit tracker. Static Astro 6 + Tailwind v4 site deployed on Vercel at useorbit.org. Sibling repos: `orbit-ui-mobile` (app monorepo) and `orbit-api` (.NET API) at `C:\Users\thoma\Documents\Programming\Projects\`.

## Design system (mirrored, not owned)

The design canon lives in `orbit-ui-mobile`: `DESIGN.md` (authoritative spec) + `design/handoff/` (vendored handoff). This repo MIRRORS the purple-scheme dark tokens into `src/styles/global.css` (`@theme` + `:root`). When `DESIGN.md` changes token values, update the mirror in the same task. Never invent new colors, fonts, or radii here.

- Anchor: navy-violet orbital. Canvas `#020618`, violet `#7f46f7`, gradient header `#22094f → transparent`, Rubik/Inter/Roboto, translucent cards with inset hairline rings, pill CTAs with glow.
- Dark-only, purple-scheme-only (documented deviation: the landing is the brand surface; the app's light mode and 6 schemes don't apply here).
- Fonts are self-hosted via Astro's Fonts API (`astro.config.mjs`), exposed as `--font-rubik/inter/roboto`.
- No raw slate values, no hardcoded violet rgba (use `rgba(var(--primary-rgb), α)`), no `transition-all`, no `h-screen` (use `min-h-dvh`), no em dashes in copy.

## Code standards

Same 10 rules as the monorepo's root `CLAUDE.md`: root cause over workarounds; delete unused code; no `any`; no `console.*` in production (DEV-gated only); strict comment policy (below); no premature abstraction; ~50-line functions; error handling at boundaries only; descriptive naming; DRY at the right level.

### Comment policy (lint-enforced via `local/no-comments`, autofix strips violations)

- Allowed: `/** */` JSDoc on exported symbols; tooling directives (`eslint-disable`, `@ts-expect-error`, `// @ts-check`); WHY comments ONLY when they link an upstream issue/PR/doc URL.
- Banned: everything else. No narration, no section bars, no TODOs. Rename or extract instead.
- The rule source is `eslint-rules/no-comments.cjs`, mirrored verbatim from `orbit-ui-mobile/eslint-rules/no-comments.cjs` (cross-repo standard, orbit-ui-mobile#107). Keep them in lockstep.

## Architecture

- `src/pages/index.astro` - thin composition of section components
- `src/pages/404.astro` - not-found page
- `src/layouts/Layout.astro` - HTML shell, meta/OG/JSON-LD, fonts
- `src/components/` - `Header`, `Hero`, `AppMockup`, `Features`, `Platforms`, `Cta`, `Footer` + primitives `PillButton`, `SatelliteGlyph`
- `src/i18n/translations.ts` - typed EN/PT-BR tables (`Record<TranslationKey, string>` enforces key parity at compile time)
- `src/scripts/` - client modules: `i18n.ts` (cookie + toggle + DOM apply), `reveal.ts` (scroll reveals), `header-scroll.ts`
- `src/styles/global.css` - the token mirror + type roles + base styles (single CSS file)

## i18n

Bilingual EN/PT-BR via `data-i18n` attributes applied client-side. Every new user-facing string needs a key in BOTH tables in `src/i18n/translations.ts` (the type makes a missing PT key a compile error). Brand words ("Orbit") stay untranslated.

## Commands

```bash
npm run dev           # dev server
npm run build         # production build
npm run preview       # preview the build
npm run lint          # ESLint (flat config, astro + ts + local/no-comments)
npm run lint:fix      # ESLint with autofix
npm run format        # Prettier write
npm run format:check  # Prettier check (CI gate)
npm run check         # astro check (TS)
```

CI on PRs to main runs `build.yml` (audit + lint + format:check + check + build + internal-link check, plus a `lighthouse` job asserting `lighthouserc.json`: category scores + the LCP/TBT/script-bundle-size numeric budgets) and `dependency-review.yml`. `nightly.yml` runs a scheduled external-link check + Lighthouse performance gate (`lighthouserc.nightly.json`), each filing a de-duped issue on regression.

## Git workflow

- Branch protection on `main`: no direct pushes, no force pushes. Squash-merge only; head branches auto-delete.
- Branch naming: `feature/xxx`, `fix/xxx`, `chore/xxx`.
- Never reuse a branch after its PR is squash-merged.
- One feature or fix per PR. Cross-repo design changes link the `orbit-ui-mobile` issue/PR in the description.

## Links

- App: https://app.useorbit.org
- API: https://api.useorbit.org
- Landing: https://useorbit.org
