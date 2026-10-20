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

test("16px favicon uses the native redraw on a canvas disc", async () => {
  const source = await readFile("public/brand/orbit-mark-16.svg", "utf8");
  const native = await sharp(Buffer.from(source.replaceAll("currentColor", "#F4F4F6")))
    .png()
    .toBuffer();
  const expected = await sharp(
    Buffer.from('<svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#09090B"/></svg>'),
  )
    .composite([{ input: native }])
    .ensureAlpha()
    .raw()
    .toBuffer();
  const actual = await sharp("public/favicon-16x16.png").ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual, expected);
});

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
