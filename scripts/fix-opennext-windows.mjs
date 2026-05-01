/**
 * scripts/fix-opennext-windows.mjs
 *
 * Workaround for opennextjs/cloudflare Windows build issues:
 * 1. Copies wasm/font files next to handler.mjs so wrangler can resolve them
 *
 * Run after: npx @opennextjs/cloudflare build
 */

import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const nextOgSrc = "node_modules/next/dist/compiled/@vercel/og";
const dest = ".open-next/server-functions/default";

const filesToCopy = [
  { src: join(nextOgSrc, "yoga.wasm"),   dst: join(dest, "yoga.wasm") },
  { src: join(nextOgSrc, "resvg.wasm"),  dst: join(dest, "resvg.wasm") },
  // Font needs to be renamed to .bin
  { src: join(nextOgSrc, "noto-sans-v27-latin-regular.ttf"), dst: join(dest, "noto-sans-v27-latin-regular.ttf.bin") },
];

let copied = 0;
for (const { src, dst } of filesToCopy) {
  if (existsSync(src) && !existsSync(dst)) {
    copyFileSync(src, dst);
    console.log(`  copied: ${src} → ${dst}`);
    copied++;
  }
}

if (copied === 0) {
  console.log("  All files already in place.");
} else {
  console.log(`  ${copied} file(s) copied.`);
}
