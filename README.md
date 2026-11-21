# Orbit Landing Page

The landing page for **Orbit**, an AI that tracks habits. Orbit is the app, its AI and its mascot. It turns a plain request into a proposed routine change for the person to review. The site is a static Astro and Tailwind build.

**Live:** [useorbit.org](https://useorbit.org) | **App:** [app.useorbit.org](https://app.useorbit.org) | **API:** [api.useorbit.org](https://api.useorbit.org)

See `CLAUDE.md` for the design rules and the code standards.

## Run the site

Use the Node.js version in `.node-version`. CI and both Render sites build with this version.

```bash
npm install

npm run dev
```

The site runs at `http://localhost:4321`. `npm test` runs the source and unit suites. `npm run build` also runs the suites that read the built page in `dist/`.

## Brand files

- The SVG files in `public/brand/` are byte copies of `orbit-ui-mobile/design/brand/`. Copy them again when that folder changes.
- `npm run brand:generate` writes the favicons, the ICO, the Apple icon and `logo.png` from these files only.
- `public/og-image.png` (2400 by 1260) is a byte copy of `thomas-brain/orbit/web/og-image.png`. The generator does not write it.

## Deployment

Render hosts a production static site and a staging static site. Auto-deploy is disabled on both sites. A merge does not deploy. Run the `Release landing` GitHub Actions workflow from `main`.

```sh
gh workflow run release.yml --ref main -f environment=production
gh workflow run release.yml --ref main -f environment=staging -f branch=<branch>
```

Production accepts only the `main` branch. Staging accepts the head of the selected branch, and the `sha` input must hold the full 40-character commit. Production uses `sha` when it is set, or the commit of the dispatch when it is empty. The job checks out that exact commit and checks that the selected branch holds it.

Render build contract:

| Setting           | Value                                       |
| ----------------- | ------------------------------------------- |
| Node.js           | `.node-version`; no `NODE_VERSION` variable |
| Build command     | `npm ci && npm run build`                   |
| Publish directory | `dist`                                      |
| Auto-deploy       | Disabled                                    |

Render reads a `NODE_VERSION` variable before `.node-version`. Do not set `NODE_VERSION` on either site. The build log line `Using Node.js version <version> via <source>` shows what Render read.

Build-time variables on the Render static site:

| Variable                     | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `PUBLIC_API_URL`             | Waitlist API endpoint; defaults to `https://api.useorbit.org`                   |
| `PUBLIC_ANDROID_INSTALL_URL` | Android install links and generated QR; defaults to the production Play listing |
| `PUBLIC_APP_URL`             | HTTPS app-entry links; defaults to `https://app.useorbit.org`                   |
| `PUBLIC_POSTHOG_KEY`         | Enables consent-gated PostHog analytics through `/relay/`                       |
| `PUBLIC_TURNSTILE_SITE_KEY`  | Enables the waitlist Turnstile widget                                           |

`RENDER_API_KEY` is a secret of the `production` and `staging` GitHub environments. Keep it out of the repository secrets. Both environments permit deployments only from `main`. The repository variables `RENDER_LANDING_SERVICE_ID` and `RENDER_LANDING_STAGING_SERVICE_ID` hold the two Render service IDs.

The job runs `.github/scripts/release-landing.mjs` from the dispatch commit on `main`, so a selected commit never changes the code that deploys it. The script uses the Render API to check that auto-deploy is disabled, deploy the selected commit and wait for it to go live. Then it checks that the public origin serves that commit through the `orbit-build` meta tag. A staging release first sets the tracked branch of the service to the selected branch.

Before a production deploy, the script requires staging to serve the selected build marker with HTTP 200. The `force_unstaged` input bypasses this check and the job summary records it. The script then records a GitHub Deployment with the public URL.

The Render static site definition in [`orbit-api/infra`](https://github.com/thomasluizon/orbit-api/tree/main/infra) owns the delivery rules. Edit Terraform there for changes to:

- The canonical `Link` header on `/`: `<https://useorbit.org/>; rel="canonical"`.
- Security headers on all paths: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- Asset caching on `/_astro/*`: `Cache-Control: public, max-age=31536000, immutable`. Other paths use `Cache-Control: public, max-age=0, must-revalidate`.
- PostHog rewrites: `/relay/static/*` to `https://us-assets.i.posthog.com/static/*`, `/relay/array/*` to `https://us-assets.i.posthog.com/array/*`, and `/relay/*` to `https://us.i.posthog.com/*`.

## App entry and Android installation

A link opts in to app entry with the `data-app-entry` attribute. Every opted-in link keeps an HTTPS app href in the delivered HTML, so desktop, iPhone and a visit without JavaScript use the web link. On Chrome for Android, a trusted and unmodified click opens the app through a package-bound Android intent. The intent carries the Play listing of `PUBLIC_ANDROID_INSTALL_URL` as its fallback.

`PUBLIC_APP_URL` and `PUBLIC_ANDROID_INSTALL_URL` must name the same target, the production pair or the staging pair. A mismatched pair keeps the HTTPS navigation. `src/scripts/app-entry.test.mjs` tests this behaviour.

## Related repositories

| Repo                                                               | Description                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [orbit-ui-mobile](https://github.com/thomasluizon/orbit-ui-mobile) | Turborepo: Next.js web app + Expo Android app (owns `DESIGN.md`, the design canon) |
| [orbit-api](https://github.com/thomasluizon/orbit-api)             | .NET REST API backend                                                              |

## License

Private project.
