// Génère les écrans de démarrage (splash) iOS : PNG bleu marine unis, une image
// par résolution d'appareil. Aucune dépendance externe (même technique que
// generate-icons.mjs). À enrichir avec le logo VPF plus tard.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAVY = [0x0f, 0x2a, 0x4a];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidPng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3)]);
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// { cssW, cssH, ratio } — dimensions en points CSS + densité de l'appareil
const DEVICES = [
  { cssW: 320, cssH: 568, ratio: 2 },
  { cssW: 375, cssH: 667, ratio: 2 },
  { cssW: 414, cssH: 896, ratio: 2 },
  { cssW: 375, cssH: 812, ratio: 3 },
  { cssW: 390, cssH: 844, ratio: 3 },
  { cssW: 393, cssH: 852, ratio: 3 },
  { cssW: 414, cssH: 736, ratio: 3 },
  { cssW: 414, cssH: 896, ratio: 3 },
  { cssW: 428, cssH: 926, ratio: 3 },
  { cssW: 430, cssH: 932, ratio: 3 },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "splash");
mkdirSync(outDir, { recursive: true });

const links = [];
for (const { cssW, cssH, ratio } of DEVICES) {
  const w = cssW * ratio;
  const h = cssH * ratio;
  const name = `splash-${w}x${h}.png`;
  writeFileSync(join(outDir, name), solidPng(w, h, NAVY));
  links.push(
    `  { url: "/splash/${name}", media: "(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" },`
  );
  console.log(`public/splash/${name} généré`);
}

// Aide : le tableau startupImage à coller dans src/app/layout.tsx
console.log("\nstartupImage:\n[\n" + links.join("\n") + "\n]");
