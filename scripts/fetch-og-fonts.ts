/**
 * Pre-fetches Archivo 400 + 800 woff (not woff2) files into public/fonts/
 * so the OG image route can read them via the ASSETS binding at runtime.
 *
 * @vercel/og / satori does not accept woff2. We ask Google Fonts for woff
 * by sending an older browser UA (IE 11) — Google's response then ships
 * legacy woff inside @font-face. The URL Google hands back has no
 * extension (it's a /l/font?kit=... handler), so we save the bytes with
 * a .woff suffix locally for clarity.
 *
 * Idempotent. Run automatically before deploy via the `predeploy` script.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'fonts')
const WEIGHTS: Array<400 | 800> = [400, 800]

// IE 11 UA — too old for woff2, so Google serves legacy woff inside the
// @font-face declaration.
const LEGACY_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko'

async function fetchWoff(weight: 400 | 800): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Archivo:wght@${weight}&display=swap`,
    { headers: { 'User-Agent': LEGACY_UA } },
  ).then((r) => r.text())
  // Match the woff URL specifically. The handler URL has no .woff suffix —
  // we identify it by the format('woff') hint immediately after.
  const match = css.match(/url\((https:\/\/[^)]+)\)\s+format\('woff'\)/)
  if (!match || !match[1]) {
    throw new Error(`Could not find Archivo ${weight} woff URL in CSS response`)
  }
  return fetch(match[1]).then((r) => r.arrayBuffer())
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const w of WEIGHTS) {
    const out = join(OUT_DIR, `archivo-${w}.woff`)
    if (existsSync(out)) {
      console.log(`✓ ${out} (cached)`)
      continue
    }
    console.log(`→ Fetching Archivo ${w}…`)
    const bytes = await fetchWoff(w)
    writeFileSync(out, Buffer.from(bytes))
    console.log(`  wrote ${bytes.byteLength} bytes`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
