# Orbit Landing Page

Landing page for Orbit, an AI that tracks habits. Orbit is the app, its AI and its mascot, and the page is built around the mascot. Static Astro and Tailwind site, deployed on Render at useorbit.org through the manual release workflow. Sibling repos: `../orbit-ui-mobile` (app monorepo) and `../orbit-api` (.NET API).

## Design system (mirrored, not owned)

- The canon is `orbit-ui-mobile/DESIGN.md` and `orbit-ui-mobile/design/canvas/`. This repository mirrors the dark tokens in `src/styles/global.css`. When `DESIGN.md` changes a token value, update the mirror in the same task.
- Never invent a colour, a font or a radius. The page is dark only. Write no em dash in copy.
- The landing copies the structure, motion and copy discipline of Pierre's long-scroll page (lp.pierre.finance/lp/converse) in Orbit's design: a centred hero with the device centred below it. Never a split hero (text on one side, a visual on the other).
- Use no raw slate value, no `transition-all` and no `h-screen` (use `min-h-dvh`).
- Each interactive element has one role, and the role sets its hover, press, focus ring and transition tier:
  - Control (button, chip, pill): fill colour on `--duration-hover-control`. Neutral fills use `--color-bg-hover`. Primary fills use `--color-primary-hover` and `--color-primary-pressed`.
  - Surface (habit row, FAQ row, downloads entry): `--color-bg-hover` and `--color-hairline-strong` on `--duration-hover-surface`. A press paints at once.
  - Link: colour on `--duration-hover-surface`. A link without a persistent underline draws an underline that scales from its leading edge.
  - Text field (the Ask Orbit composer included): keeps its `--color-border-control` ring on hover, has no press fill and takes the inset 2px primary focus ring.
  - Dense composite (carousel, bar chart, day cells): feedback paints only its own mark.
- The press rule comes after the hover query, outside it. A disabled control shows no hover and no press. `--duration-fast` is for press movement and state changes. Habit toggling stays immediate.
- A focus ring stays inside its control unless 8px of clearance stays outside it. A focus ring never repeats a state marker of its control.
- No animation runs longer than 5 seconds without a visitor action. The page starts no frame loop for the mascot.
- Orbit leads the hero and guides each section with one short line (`src/components/OrbitLine.astro`).
- `public/brand/` holds byte copies of the mascot files of `orbit-ui-mobile/design/brand/`. `src/components/OrbitMascot.astro` inlines them.

## i18n

Every user-facing string needs a key in both tables of `src/i18n/translations.ts`. "Orbit" stays untranslated.

## Commands

The CI gates are `format:check`, `check`, `lint`, `test` and `build`. CI is `.github/workflows/build.yml`; read it. Lighthouse fails a page that holds more than 24 KB of script. Never raise that budget.

## Git workflow

- Branches: `feature/`, `fix/` and `chore/`. Squash merge only. Never reuse a merged branch.
- The PR body says `Tracks thomasluizon/orbit-tickets#N`, never `Closes`.
- The Pullfrog prompt lives in its console. It changes only by an owner decision.
