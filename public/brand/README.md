# Orbit brand sources

These four SVGs are copied without changes from `orbit-ui-mobile/design/brand/`.
The mark geometry and raster settings come from the app's
`tools/generate-brand-assets.mjs` for tickets #738, #747, #752, #760 and #765.

Run `npm run brand:generate` from the landing repository root to regenerate the
public PNGs and the ICO. Generation reads only files in this repository.

The 16px favicon uses the native redraw without trimming or scaling. The larger
favicons use the accent mark at 68% width. All favicon layers have a `#09090B`
disc. The 180px Apple icon uses a solid canvas and 60% mark width. The shared
96px transparent logo uses 80% mark width. Foreground and moon colors follow
the canonical generator; landing CSS tokens remain unchanged.

`src/assets/og-background.png` preserves the existing 2400 by 1260 social card
with its old logo tile removed. Only that tile's rectangle was cleared using
the adjacent background colors. The generator composites the canonical mark
into its former position, preserving the card's copy and surrounding artwork.

The SVGs use `currentColor`; inline them when consuming them directly. Image
elements use the baked `logo.png` so the foreground and moon colors resolve.
