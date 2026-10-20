# Orbit brand sources

The SVGs mirror `orbit-ui-mobile/design/brand/`. Keep their geometry aligned
with the app's `tools/generate-brand-assets.mjs`.

Run `npm run brand:generate` from the landing repository root to regenerate the
public PNGs and the ICO. Generation reads only files in this repository.

The 16px favicon uses the native redraw without trimming or scaling. The larger
favicons use the accent mark at 68% width. All favicon layers have a `#09090B`
disc. The 180px Apple icon uses a solid canvas and 60% mark width. The shared
96px transparent logo uses 80% mark width. Foreground and moon colors follow
the canonical generator; landing CSS tokens remain unchanged.

`src/assets/og-background.png` is the 2400 by 1260 social card background.
The generator composites the canonical mark into its logo tile area while
preserving the card's copy and surrounding artwork.

The SVGs use `currentColor`; inline them when consuming them directly. Image
elements use the baked `logo.png` so the foreground and moon colors resolve.
