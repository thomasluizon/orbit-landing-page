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

## Git Workflow

Branch protection is enforced on `main`. No direct pushes, no force pushes, no branch deletion.

### Branching Convention

- `feature/xxx` -- new features
- `fix/xxx` -- bugfixes
- `chore/xxx` -- maintenance, config, docs

### Merge Strategy

- **Squash merge only** -- keeps `main` history linear and clean
- Squash commit uses PR title + PR body
- Head branches auto-delete after merge

### Workflow

```bash
# 1. Create branch from main
git checkout main && git pull
git checkout -b feature/my-change

# 2. Work and commit
git add <files> && git commit -m "description"

# 3. Push and create PR
git push -u origin feature/my-change
gh pr create --fill

# 4. Merge via squash
gh pr merge --squash
```

### Rules

- Never push directly to `main` -- always go through a PR
- Never force push to `main`
- Keep PRs focused: one feature or fix per PR
- Branch names should be descriptive: `feature/add-tags-to-habits`, `fix/login-redirect`
- **Never reuse a branch after its PR is squash-merged.** Always create a fresh branch from updated `main`. Reusing branches after squash merge causes repeated merge conflicts because the branch history diverges from main's squashed version.

## Links

- **App:** https://app.useorbit.org
- **API:** https://api.useorbit.org
- **Landing:** https://useorbit.org
