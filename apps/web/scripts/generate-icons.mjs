/**
 * Regenerates every app icon from assets/logo-source.png.
 *
 *   pnpm --filter web gen:icons
 *
 * Run this after changing the source art. The outputs are committed, so this
 * is not part of the build — nothing at runtime depends on sharp being
 * installable.
 */
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "assets/logo-source.png");
const PUBLIC = join(root, "public");
const APP = join(root, "src/app");

/**
 * 256 colours measures at 0.07/255 mean error against truecolour on this
 * artwork — visually identical, a third smaller. 128 halves it again but
 * pushes worst-case error to 44/255, which bands visibly on a gradient.
 */
const PNG = { compressionLevel: 9, palette: true, colours: 256 };

/** Sampled from the source corner; also the manifest theme colour. */
const BACKGROUND = { r: 8, g: 14, b: 21 };

const square = (size) => sharp(SOURCE).resize(size, size, { fit: "cover" });

async function main() {
  for (const size of [192, 512]) {
    await square(size).png(PNG).toFile(join(PUBLIC, `icon-${size}.png`));
  }
  for (const size of [16, 32]) {
    await square(size).png(PNG).toFile(join(PUBLIC, `favicon-${size}.png`));
  }
  // iOS reads this rather than the manifest for a Home Screen icon.
  await square(180).png(PNG).toFile(join(PUBLIC, "apple-touch-icon.png"));

  // Android crops maskable icons to a circle or squircle and only guarantees
  // the middle 80%. Reusing the plain icon shaves the artwork's edges, so
  // inset it into that safe zone and fill the margin with the logo's own
  // background — transparency would render as a white ring.
  const SIZE = 512;
  const safe = Math.round(SIZE * 0.8);
  const pad = (SIZE - safe) / 2;
  const art = await square(safe).toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BACKGROUND } })
    .composite([{ input: art, top: pad, left: pad }])
    .png(PNG)
    .toFile(join(PUBLIC, "icon-maskable-512.png"));

  await writeIco([16, 32, 48], join(APP, "favicon.ico"));

  console.log("Icons regenerated from assets/logo-source.png");
}

/**
 * ICO is a 6-byte header, one 16-byte directory entry per frame, then the
 * payloads. Browsers accept PNG payloads, so no BMP encoding is needed.
 *
 * The frames are RGBA truecolour rather than paletted like every other output
 * here: Turbopack decodes app/favicon.ico during the build and rejects
 * anything else with "The PNG is not in RGBA format!". The source art is
 * opaque, so ensureAlpha only adds the channel the decoder insists on. At
 * 16-48px the size difference is a rounding error.
 */
async function writeIco(sizes, outPath) {
  const images = await Promise.all(
    sizes.map((s) => square(s).ensureAlpha().png({ compressionLevel: 9 }).toBuffer()),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });

  writeFileSync(outPath, Buffer.concat([header, ...entries, ...images]));
}

await main();
