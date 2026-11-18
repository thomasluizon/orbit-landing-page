import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const canvasColor = "#09090B";
const foreground = "#F4F4F6";
const accentColor = "#C4530F";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const rigBoxWidth = 420;
const eyeUnits = 22;
const eyeFloorPixels = 2;
const renderDensity = 384;
const moonFill = "var(--primary, currentColor)";
const outlineFill = "var(--orbit-surface, var(--bg, #09090B))";
const eyeFill = "var(--bg, #09090B)";
const eyePath = /<path fill="var\(--bg, #09090B\)"[^>]*\/>\n?/g;

const rigSource = await readFile("public/brand/orbit-mascot.svg", "utf8");
const smallSource = await readFile("public/brand/orbit-mascot-small.svg", "utf8");

/**
 * @param {string} source
 * @param {{ accent: boolean }} options
 */
function bakeColours(source, { accent }) {
  const baked = source
    .replaceAll(moonFill, accent ? accentColor : foreground)
    .replaceAll(outlineFill, canvasColor)
    .replaceAll(eyeFill, canvasColor)
    .replaceAll("currentColor", foreground);
  if (baked.includes("currentColor") || baked.includes("var(")) {
    throw new Error("a mascot source still carries an unresolved colour after baking");
  }
  return baked;
}

/** @param {16 | 24} size */
function smallFaceSvg(size) {
  if (size === 24) return smallSource.replace(/<defs><symbol[\s\S]*<\/symbol><\/defs>/, "");
  const match = /<symbol id="small-16" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/.exec(smallSource);
  if (!match) throw new Error("orbit-mascot-small.svg must carry the symbol small-16");
  const [, viewBox, inner] = match;
  const [, , width, height] = viewBox.split(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" fill="none">${inner}</svg>`;
}

const disc = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${canvasColor}"/></svg>`,
  );

async function smallFaceLayer(size, canvas, accent) {
  const scaled = sharp(Buffer.from(bakeColours(smallFaceSvg(size === 16 ? 16 : 24), { accent })), {
    density: size === 16 ? 72 : (72 * canvas * 0.75) / 24,
  });
  return scaled.png().toBuffer({ resolveWithObject: true });
}

async function rigLayer(width, { eyes }) {
  const source = eyes ? rigSource : rigSource.replace(eyePath, "");
  const trimmed = await sharp(Buffer.from(bakeColours(source, { accent: true })), {
    density: renderDensity,
  })
    .trim({ background: transparent })
    .png()
    .toBuffer();
  return sharp(trimmed)
    .resize({ width, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function compose(size, layer, { background = transparent, withDisc = false } = {}) {
  const layers = withDisc ? [{ input: disc(size), left: 0, top: 0 }] : [];
  layers.push({
    input: layer.data,
    left: Math.floor((size - layer.info.width) / 2),
    top: Math.floor((size - layer.info.height) / 2),
  });
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const inkUnits = await sharp(Buffer.from(bakeColours(rigSource, { accent: true })), {
  density: renderDensity,
})
  .trim({ background: transparent })
  .toBuffer({ resolveWithObject: true })
  .then(({ info }) => (info.width * 72) / renderDensity);
const eyeWidth = (inkPixels) => (eyeUnits * inkPixels) / inkUnits;
const iconScale = 0.7;
const adaptiveSafeFraction = 66 / 108;
const markCircleUnits = 380;
const iconEyeAt48 = eyeWidth((48 * adaptiveSafeFraction * inkUnits) / markCircleUnits);
const iconHasEyes = iconEyeAt48 >= eyeFloorPixels;
const logoWidth = Math.round(96 * 0.8);
if (eyeWidth(logoWidth) < eyeFloorPixels) throw new Error("the 96px logo eye is under 2px");
process.stdout.write(
  `icon eye at 48px: ${iconEyeAt48.toFixed(2)}px, so the app icon and the Apple icon ${iconHasEyes ? "keep" : "drop"} the eyes (rig ink ${inkUnits.toFixed(1)} of ${rigBoxWidth} units)\n`,
);

const faviconLayers = [
  await compose(16, await smallFaceLayer(16, 16, false), { withDisc: true }),
  await compose(32, await smallFaceLayer(24, 32, true), { withDisc: true }),
  await compose(48, await smallFaceLayer(24, 48, true), { withDisc: true }),
];
await writeFile("public/favicon-16x16.png", faviconLayers[0]);
await writeFile("public/favicon-32x32.png", faviconLayers[1]);
await writeFile("public/favicon.ico", await pngToIco(faviconLayers));
await writeFile(
  "public/apple-touch-icon.png",
  await compose(180, await rigLayer(Math.round(180 * iconScale), { eyes: iconHasEyes }), {
    background: canvasColor,
  }),
);
await writeFile("public/logo.png", await compose(96, await rigLayer(logoWidth, { eyes: true })));
