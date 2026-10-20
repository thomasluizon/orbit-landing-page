# Orbit brand sources

The SVGs mirror `orbit-ui-mobile/design/brand/`. Keep their geometry aligned
with the app's `tools/generate-brand-assets.mjs`.

Run `npm run brand:generate` from the landing repository root to regenerate the
favicons, the Apple icon, the logo PNG and the ICO. Generation reads only files in this repository.

The 16px favicon uses the native redraw without trimming or scaling. The larger
favicons use the accent mark at 68% width. All favicon layers have a `#09090B`
disc. The 180px Apple icon uses a solid canvas and 60% mark width. The shared
96px transparent logo uses 80% mark width. Foreground and moon colors follow
the canonical generator; landing CSS tokens remain unchanged.

`public/og-image.png` is the 2400 by 1260 social card: the Orbit lockup with
the accent moon and the line "An AI that tracks habits." on `#09090B`, the same
composition as the app's launch brand images. It is a committed source image,
and the generator does not write it.

The SVGs use `currentColor`; inline them when consuming them directly. Image
elements use the baked `logo.png` so the foreground and moon colors resolve.
