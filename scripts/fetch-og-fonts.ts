/**
 * Pre-fetches Fraunces 400 + 700 woff2 files into public/fonts/ so the OG
 * image route can read them via the ASSETS binding instead of hitting
 * Google Fonts at request time. Cloudflare egress sometimes can't extract
 * the woff2 URL from the CSS endpoint — bundling it sidesteps that.
 *
 * Idempotent. Run automatically before deploy via the `predeploy` script.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'fonts')
const WEIGHTS: Array<400 | 700> = [400, 700]

async function fetchWoff2(weight: 400 | 700): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Fraunces:wght@${weight}&display=swap`,
    {
      headers: {
        // Real browser UA so Google returns the woff2 variant, not TTF.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    },
  ).then((r) => r.text())
  const match = css.match(/url\((https:\/\/[^)]+\.woff2)\)/)
  if (!match || !match[1]) {
    throw new Error(`Could not find Fraunces ${weight} woff2 URL in CSS response`)
  }
  return fetch(match[1]).then((r) => r.arrayBuffer())
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const w of WEIGHTS) {
    const out = join(OUT_DIR, `fraunces-${w}.woff2`)
    if (existsSync(out)) {
      console.log(`✓ ${out} (cached)`)
      continue
    }
    console.log(`→ Fetching Fraunces ${w}…`)
    const bytes = await fetchWoff2(w)
    writeFileSync(out, Buffer.from(bytes))
    console.log(`  wrote ${bytes.byteLength} bytes`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
