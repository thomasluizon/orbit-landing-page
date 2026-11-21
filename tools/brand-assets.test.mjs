import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { parse } from "@astrojs/compiler";

test("document head declares the ICO and both sized PNG favicons", async () => {
  const { ast } = await parse(await readFile("src/layouts/Layout.astro", "utf8"));
  const icons = [];
  function visit(node) {
    if (node.type === "element" && node.name === "link") {
      const attributes = Object.fromEntries(
        node.attributes.map(({ name, value }) => [name, value]),
      );
      if (attributes.rel === "icon") icons.push(attributes);
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(ast);
  assert.deepEqual(icons, [
    { rel: "icon", type: "image/x-icon", sizes: "16x16 32x32 48x48", href: "/favicon.ico" },
    { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
    { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  ]);
});

test("16px favicon draws the native small static face on a canvas disc", async () => {
  const source = await readFile("public/brand/orbit-mascot-small.svg", "utf8");
  const [, viewBox, inner] = /<symbol id="small-16" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/.exec(
    source,
  );
  const native = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="16" height="12" fill="none">${inner}</svg>`
        .replaceAll("var(--primary, currentColor)", "#F4F4F6")
        .replaceAll("var(--orbit-surface, var(--bg, #09090B))", "#09090B")
        .replaceAll("var(--bg, #09090B)", "#09090B")
        .replaceAll("currentColor", "#F4F4F6"),
    ),
  )
    .png()
    .toBuffer();
  const expected = await sharp(
    Buffer.from('<svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#09090B"/></svg>'),
  )
    .composite([{ input: native, left: 0, top: 2 }])
    .ensureAlpha()
    .raw()
    .toBuffer();
  const actual = await sharp("public/favicon-16x16.png").ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual, expected);
});

test("the brand sources are the mascot rig, the small static face and the lockup", async () => {
  const rig = await readFile("public/brand/orbit-mascot.svg", "utf8");
  assert.match(rig, /viewBox="-210 -150 420 300"/);
  assert.equal(rig.match(/fill="var\(--bg, #09090B\)"/g)?.length, 2, "the rig has two eyes");
  assert.equal(rig.match(/var\(--primary/g)?.length, 1, "the moon is the one accent element");
  const small = await readFile("public/brand/orbit-mascot-small.svg", "utf8");
  assert.match(small, /<symbol id="small-16" viewBox="0 0 16 12">/);
});

test("the Apple icon is the mascot at rest with both eyes, as the app icon draws it", async () => {
  const { data, info } = await sharp("public/apple-touch-icon.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const row = Math.round(info.height * 0.42);
  const runs = [];
  let inEye = false;
  for (let x = Math.round(info.width * 0.38); x < Math.round(info.width * 0.62); x++) {
    const pixel = (row * info.width + x) * 4;
    const dark = data[pixel] < 60;
    if (dark && !inEye) runs.push(0);
    if (dark) runs[runs.length - 1] += 1;
    inEye = dark;
  }
  assert.equal(runs.length, 2, "the planet face holds two canvas-coloured eyes");
  for (const width of runs) assert.ok(width >= 2, `each eye is at least 2px wide, not ${width}px`);
});

for (const { path, row, from, to } of [
  { path: "public/og-image.png", row: 554, from: 840, to: 960 },
]) {
  test(`${path} draws the mascot face with both eyes`, async () => {
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const runs = [];
    let inEye = false;
    for (let x = from; x < to; x++) {
      const dark = data[(row * info.width + x) * 4] < 60;
      if (dark && !inEye) runs.push(0);
      if (dark) runs[runs.length - 1] += 1;
      inEye = dark;
    }
    assert.equal(runs.length, 2, "the planet face holds two canvas-coloured eyes");
    for (const width of runs)
      assert.ok(width >= 2, `each eye is at least 2px wide, not ${width}px`);
  });
}

test("larger public assets contain the canonical foreground and accent moon", async () => {
  for (const [path, width, height] of [
    ["public/favicon-32x32.png", 32, 32],
    ["public/apple-touch-icon.png", 180, 180],
    ["public/logo.png", 96, 96],
    ["public/og-image.png", 2400, 1260],
  ]) {
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, width, path);
    assert.equal(info.height, height, path);
    let foreground = 0;
    let accent = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) foreground++;
      if (data[i] > 80 && data[i + 1] < data[i] * 0.6 && data[i + 2] < data[i + 1] * 0.5) accent++;
    }
    assert.ok(foreground > 0, `${path} needs the pale foreground`);
    assert.ok(accent > 0, `${path} needs the orange moon`);
  }
});

test("ICO contains 16, 32 and 48px bitmaps with the PNG pixels preserved", async () => {
  const ico = await readFile("public/favicon.ico");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(ico.readUInt32LE(offset), 40);
    assert.equal(ico.readInt32LE(offset + 4), size);
    assert.equal(ico.readInt32LE(offset + 8), size * 2);
    assert.equal(ico.readUInt16LE(offset + 14), 32);
    assert.ok(offset + ico.readUInt32LE(entry + 8) <= ico.length);
    if (size === 48) continue;
    const rgba = await sharp(`public/favicon-${size}x${size}.png`).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pixel = (y * size + x) * 4;
        const bitmap = offset + 40 + ((size - y - 1) * size + x) * 4;
        assert.deepEqual(
          [...ico.subarray(bitmap, bitmap + 4)],
          [rgba[pixel + 2], rgba[pixel + 1], rgba[pixel], rgba[pixel + 3]],
        );
      }
    }
  }
});
