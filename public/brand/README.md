# Orbit brand sources

Orbit is the app, its AI and its mascot. The SVG files here are byte copies of
`orbit-ui-mobile/design/brand/`. Copy them again when that folder changes.

| File                     | Use on the page                                                     |
| ------------------------ | ------------------------------------------------------------------- |
| `orbit-mascot.svg`       | The live rig at rest: planet, two pill eyes, one ring and one moon  |
| `orbit-mascot-feliz.svg` | The happy eyes that the rig shows after a visitor action            |
| `orbit-mascot-small.svg` | The small static face at 16 and 24, under the 40px floor of the rig |
| `orbit-lockup.svg`       | The header and footer lockup: the small face and the wordmark       |

`src/components/OrbitMascot.astro` inlines the rig and the small face, so
`currentColor` and the tokens resolve. Planet and ring use `--color-fg-1`, the
eyes use `--color-bg`, and the moon is the one element in `--color-primary`.

Run `npm run brand:generate` from the repository root to write the favicons,
the ICO, the Apple icon and `logo.png`. The generator reads only these files.

- Each favicon is the small static face on a `#09090B` disc. The 16px layer is
  the native `small-16` drawing in one ink. The 32px and 48px layers draw the
  24 face with the accent moon.
- The 180px Apple icon is the rig at 70% width on `#09090B`. The rig keeps its
  eyes only when each eye is at least 2px wide in the 48px icon render. The
  generator prints that measure. With the rig of `orbit-mascot.svg` each eye
  measures 1.70px, so the icon has no eyes.
- The 96px transparent `logo.png` is the rig with its eyes at 80% width.

`public/og-image.png` is the 2400 by 1260 social card. It is a byte copy of
`thomas-brain/orbit/web/og-image.png`, and the generator does not write it.
