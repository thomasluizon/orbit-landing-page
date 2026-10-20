import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const canvasColor = "#09090B";
const foreground = "#F4F4F6";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const nativeSource = await readFile("public/brand/orbit-mark-16.svg", "utf8");
const accentSource = await readFile("public/brand/orbit-mark-accent.svg", "utf8");
const bakedAccent = accentSource
  .replaceAll("var(--primary, currentColor)", "#C4530F")
  .replaceAll("currentColor", foreground);
const trimmedMark = await sharp(Buffer.from(bakedAccent))
  .trim({ background: transparent })
  .png()
  .toBuffer();

async function renderAsset(size, { scale = 0.8, disc = false, background = transparent } = {}) {
  const layers = [];
  if (disc) {
    layers.push({
      input: Buffer.from(
        `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${canvasColor}"/></svg>`,
      ),
      left: 0,
      top: 0,
    });
  }
  const { data, info } =
    size === 16
      ? await sharp(Buffer.from(nativeSource.replaceAll("currentColor", foreground)))
          .png()
          .toBuffer({ resolveWithObject: true })
      : await sharp(trimmedMark)
          .resize({ width: Math.round(size * scale), fit: "inside", withoutEnlargement: false })
          .png()
          .toBuffer({ resolveWithObject: true });
  layers.push({
    input: data,
    left: Math.floor((size - info.width) / 2),
    top: Math.floor((size - info.height) / 2),
  });
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const faviconLayers = await Promise.all(
  [16, 32, 48].map((size) => renderAsset(size, { disc: true, scale: 0.68 })),
);
await writeFile("public/favicon-16x16.png", faviconLayers[0]);
await writeFile("public/favicon-32x32.png", faviconLayers[1]);
await writeFile("public/favicon.ico", await pngToIco(faviconLayers));
await writeFile(
  "public/apple-touch-icon.png",
  await renderAsset(180, { background: canvasColor, scale: 0.6 }),
);
await writeFile("public/logo.png", await renderAsset(96));
await sharp("src/assets/og-background.png")
  .composite([{ input: await renderAsset(112), left: 434, top: 340 }])
  .png({ compressionLevel: 9 })
  .toFile("public/og-image.png");
