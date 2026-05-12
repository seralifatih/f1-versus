# f1-versus.com — Build Prompts

Sequential prompts for Cursor. Run them **in order**. Each prompt assumes the previous one is complete and committed. Before starting, make sure your Cursor workspace has `CONCEPT.md`, `CLAUDE.md`, and `f1-goat-v1.jsx` in the root.

**Reasoning model guidance:**
- Use **Claude Opus (HIGH)** for prompts marked 🔴 (architecture, scoring engine, data pipeline)
- Use **Claude Sonnet (MEDIUM)** for prompts marked 🟡 (UI components, page composition)
- Use **GPT or Sonnet (LOW)** for prompts marked 🟢 (boilerplate, config)

---

## Phase 0 — Reset

### Prompt 0.1 🟢 — Wipe and scaffold

```
The old f1-versus.com is being scrapped. Read CONCEPT.md and CLAUDE.md to understand the pivot.

Wipe the existing app/ pages/ components/ lib/ directories. Keep:
- package.json (we will update it)
- .env files
- wrangler.toml
- public/ (we'll clean it later)
- the three docs (CONCEPT.md, CLAUDE.md, BUILD_PROMPTS.md)
- the prototype f1-goat-v1.jsx (move to /prototype/)

Then scaffold a fresh Next.js 14 App Router project structure in place. Update package.json with these dependencies:
- next@14
- react@18
- react-dom@18
- typescript@5
- tailwindcss@3
- framer-motion (latest)
- lucide-react (latest)
- @opennextjs/cloudflare (latest)
- wrangler@3 (dev dep)

Set up:
- next.config.mjs configured for Cloudflare via @opennextjs/cloudflare
- tsconfig.json with strict mode
- tailwind.config.ts with the custom color tokens and font-family extensions from the prototype
- app/layout.tsx loading Fraunces, Inter Tight, JetBrains Mono via next/font/google
- app/globals.css with CSS reset and base typography
- A minimal app/page.tsx that just renders the project name to confirm it works

Do not start implementing features yet. This prompt is scaffold only.
```

### Prompt 0.2 🟢 — Project hygiene

```
Add:
- .gitignore (Next.js standard + .wrangler + .vercel + .open-next)
- .editorconfig
- .prettierrc (single quotes, no semis, 2-space, 100 print width)
- eslint config extending next/core-web-vitals + custom rule disallowing `any`
- README.md with one-paragraph project description (pull from CONCEPT.md TL;DR), local dev instructions (npm install, npm run dev), and a link to CONCEPT.md for full context
- A scripts/ folder with an empty .gitkeep

Do not add tests or CI yet. Keep it minimal.
```

---

## Phase 1 — Data layer

### Prompt 1.1 🔴 — F1DB sync script

```
Read CLAUDE.md "Data Pipeline" section.

Create scripts/sync-f1db.ts which:
1. Fetches the latest F1DB SQLite release from GitHub releases API (https://api.github.com/repos/f1db/f1db/releases/latest), finds the asset matching `f1db-sqlite-*.zip`, downloads it.
2. Unzips, extracts the .db file to a local cache (.cache/f1db/).
3. Opens the SQLite file (use better-sqlite3 in the script).
4. Computes a `driver_stats` table with one row per driver containing pre-aggregated, era-bucketed metrics.

For each driver, compute (for each of four eras: all/golden/turbo/modern) these raw values:
- championships: count of season_driver_standings rows where positionNumber=1
- wins: count of race_result rows where positionNumber=1
- podiums: count of race_result rows where positionNumber<=3
- poles: count of qualifying_result rows where positionNumber=1
- fastestLaps: count of fastest_lap rows (or race_result rows where fastest_lap flag is set, whichever F1DB schema uses — verify against schema)
- starts: count of race_result rows where the driver actually started (i.e., grid position not null, or race_result row exists with any positionNumber including DNFs)
- winRate: wins / starts (only if starts > 0, else 0)
- careerYears: last_race_year - first_race_year + 1
- teammateH2HRace: for each race, compare driver's position to their teammate(s) in the same constructor. Wins / total comparisons. (Pull from race_result joined on raceId + constructorId, excluding the driver's own row.)
- teammateH2HQuali: same logic on qualifying_result.
- peakDominance: for each driver, find the 3-consecutive-season window with the highest sum of points-share-of-season. Store the score.

After computing raw values per era, normalize each metric to a 0-100 scale across all drivers (within the same era bucket), so the engine can apply weights directly. Use percentile-rank or min-max — pick one and document the choice with a code comment.

Write the result to a separate SQLite file `.cache/f1db/driver_stats.db` with one table `driver_stats` keyed on (driverId, eraId). Also include columns: driverName, countryCode, firstYear, lastYear so the UI can hydrate without joining back.

Finally, output a wrangler d1 command sequence the user can run to push this data into Cloudflare D1. Print these commands to stdout. Do NOT execute them automatically — Fatih runs them when ready.

Add npm scripts: `sync:f1db` runs this script.
```

### Prompt 1.2 🔴 — D1 schema and binding

```
Create wrangler.toml with a D1 binding named DB pointing to a database f1versus-prod (and a separate f1versus-dev for development). Don't create the actual D1 databases — provide the commands in a comment at the top of wrangler.toml for Fatih to run.

Create lib/f1db/schema.sql with the CREATE TABLE statement for driver_stats matching what sync-f1db.ts produces. This will be applied to D1 before importing data.

Create lib/f1db/client.ts exposing:
- getAllDriverStats(era: EraId): Promise<DriverStats[]>
- getDriverById(id: string, era: EraId): Promise<DriverStats | null>
- getDriversByIds(ids: string[], era: EraId): Promise<DriverStats[]>

These use the D1 binding from the request context. For local dev fallback, support reading from the local .cache/f1db/driver_stats.db file via better-sqlite3 when DB binding is not present (NODE_ENV=development).

Define TypeScript types in lib/f1db/types.ts:
- EraId = 'all' | 'golden' | 'turbo' | 'modern'
- DriverStats = { driverId, name, countryCode, firstYear, lastYear, metrics: { c, w, p, q, f, r, h, l, d: number } }
```

---

## Phase 2 — Scoring engine

### Prompt 2.1 🔴 — Pure scoring engine

```
Create lib/scoring/ with these files:

types.ts:
- MetricKey = 'c' | 'w' | 'p' | 'q' | 'f' | 'r' | 'h' | 'l' | 'd'
- Weights = Record<MetricKey, number>
- Formula = { id: string, label: string, blurb: string, weights: Weights }
- ScoredDriver extends DriverStats with: score: number, why: string

presets.ts: export the six PRESETS array exactly as defined in the prototype f1-goat-v1.jsx. Do not invent new ones, do not adjust weights — these are tuned.

engine.ts:
- export function score(metrics: DriverStats['metrics'], weights: Weights): number
  - returns weighted average, rounded to 1 decimal
  - if all weights are 0, returns 0
- export function rank(drivers: DriverStats[], weights: Weights): ScoredDriver[]
  - scores all, sorts descending
  - attaches a "why" string for the top 5 only — a short, programmatically-generated note like "dominates championships and peak dominance" based on which metrics are highest-weighted AND highest-scoring for that driver
  - returns full list

constants.ts: export METRIC_LABELS map (full names of each metric key — match the prototype).

Write unit tests in lib/scoring/engine.test.ts using vitest. Test cases:
- Equal weights produce sane ordering
- All-zero weights return 0 score for everyone
- A weight on one metric only produces a ranking sorted by that metric
- score() is pure — same inputs always produce same output

Add vitest as dev dep and an npm script `test`.
```

### Prompt 2.2 🟡 — URL state encoder

```
Create lib/url-state/ with:

encode.ts:
- export function encodeFormula(formula: Formula, era: EraId): URLSearchParams
- Uses the schema from CLAUDE.md:
  - p = preset id OR 'custom'
  - w = compact weights string only when p='custom', format: `c<n>-w<n>-p<n>-q<n>-f<n>-r<n>-h<n>-l<n>-d<n>` (single chars for each metric)
  - era = era id

decode.ts:
- export function decodeFormula(params: URLSearchParams): { formula: Formula, era: EraId, isCustom: boolean }
- Validates everything. Invalid input → returns default ({ presetId: 'era-adjusted', era: 'all' }) silently. Does NOT throw.
- If p='custom' and w is malformed, falls back to default preset weights but keeps p='custom' marker so UI knows.

Tests in lib/url-state/url-state.test.ts:
- Round-trip encode → decode for each preset
- Round-trip for custom weights
- Garbage input falls back to defaults
- Missing params fall back to defaults
```

---

## Phase 3 — UI core

### Prompt 3.1 🟡 — Design tokens and base layout

```
Read /prototype/f1-goat-v1.jsx — this is the design bible. Match it exactly.

Update tailwind.config.ts:
- Colors: ink (#0a0a0b), panel (#101012), panel2 (#141416), border (#1f1f22), border2 (#2a2a2e), muted (#666), muted2 (#888), red (#ef3340)
- Font families: display (Fraunces), body (Inter Tight), mono (JetBrains Mono)
- fontVariationSettings utility plugin so we can use opsz easily in JSX

Update app/layout.tsx:
- Import the three fonts via next/font/google with display: swap and variable: '--font-display' / '--font-body' / '--font-mono'
- HTML lang="en"
- Body background = ink, text = #e8e8e8
- Metadata: title, description, OG image placeholder, twitter:card large_image, robots index/follow

Update app/globals.css:
- Reset
- Smooth scrolling
- Variable font defaults for body
- ::selection in red

Create components/layout/Header.tsx and components/layout/Footer.tsx matching prototype header/footer exactly. Header has logo, "GOAT Calculator" subtitle, nav (Ranking, Battle, Methodology). Footer has data attribution, version.

Render Header + Footer in app/layout.tsx. Page content slots between.
```

### Prompt 3.2 🟡 — Ranking page composition

```
Build the main ranking page in app/page.tsx as a Server Component that:
1. Reads URL search params on the server
2. Decodes formula and era via lib/url-state
3. Fetches getAllDriverStats(era) from D1
4. Computes the rank() server-side
5. Passes the result to a Client Component <RankingView /> for interactivity

Create components/ranking/RankingView.tsx (client component) which receives:
- initialRanked: ScoredDriver[]
- initialFormula: Formula
- initialEra: EraId
- isCustom: boolean

It renders:
- Hero section (match prototype exactly: "Settle the GOAT debate. Your formula, your ranking.")
- <EraFilter /> chips
- <PresetChips /> grid + "Custom mode" toggle button
- <CustomSliders /> (only when isCustom)
- Share bar with "Share ranking" button
- <RankingList />

When the user changes a preset, era, or slider, the client re-runs rank() on the initial driver stats (which it already has) — NO new server request needed unless era changes. If era changes, push a new URL and trigger router.replace so the server re-fetches.

URL updates happen via router.replace with the encoded state — never reloads the page, no scroll jump. Use Next 14's useRouter and useSearchParams.
```

### Prompt 3.3 🟡 — Ranking list with motion

```
Build components/ranking/RankingList.tsx and components/ranking/RankingRow.tsx.

RankingList:
- Uses framer-motion's <AnimatePresence> with mode="popLayout"
- Each row uses layout prop on motion.div for FLIP-style reorder
- Stagger initial mount by 15ms per row index

RankingRow (per row):
- Match prototype exactly: 64px rank number on left (huge Fraunces, red for #1, white for top 3, muted for rest), driver name with flag emoji, career years in mono font, score on right (28px JetBrains Mono), versus icon button on far right
- For rank 1, add the subtle red gradient background as in prototype
- Click on versus icon → navigates to /vs/[currentDriver]/?selecting=true (or open a small picker drawer — for v1, just navigate to a versus mode picker page)
- Click on driver name → /driver/[driverId] for v2; for v1, no-op or anchor for SEO

Implementation note: the rank number transition between sizes (#1 is 56px, others 36px) should NOT animate — only the position/y should. Wrap the rank number in its own non-animating div if needed.
```

### Prompt 3.4 🟡 — Preset chips + custom sliders

```
Build components/formula/PresetChips.tsx:
- Renders the 6 PRESETS as a 3-column grid (auto-fit minmax 220px 1fr) of buttons matching prototype styling
- Active preset has red border + faint red gradient background
- Clicking a preset calls onChange(presetId) and (if currently in custom mode) flips out of custom mode
- "Custom mode" toggle button on top-right of the section (small, with Sliders icon)

Build components/formula/CustomSliders.tsx:
- Renders all 9 metric sliders in a 2-3 column grid
- Each slider: label on left, current value on right (mono font, red), <input type="range" min=0 max=50 step=1>
- accent-color: #ef3340 on the input via global CSS for ::-webkit-slider-thumb and ::-moz-range-thumb
- onChange calls onWeightChange(metric, value) — parent decides what to do

Build components/formula/EraFilter.tsx:
- Renders 4 era chips as inline-flex pill buttons matching prototype
- Each chip shows label + small range text in mono font
- Active chip has red border + faint red background
- onChange(eraId)

All three components are presentational — they receive value + onChange via props, no internal state.
```

---

## Phase 4 — Versus mode

### Prompt 4.1 🟡 — Versus route and picker

```
Create app/vs/page.tsx — a driver picker. Shows the same ranking list but rows have checkboxes; pick 2, hit "Compare". This is the entry point when "Battle" link in header is clicked.

Create app/vs/[a]/[b]/page.tsx (Server Component):
- Params validate as valid driverIds (404 if not)
- Reads era and formula from search params (same encoding as main page)
- Fetches both drivers' stats
- Renders <BattleCard /> client component

Create components/battle/BattleCard.tsx:
- Two-column side-by-side card layout
- Top: driver names, flags, years, score (large)
- Middle: per-metric breakdown — each row is one metric, two bars (one per driver) showing the 0-100 value, both colored, the higher one in red
- Bottom: "Switch formula" inline preset chips (so the user can re-run the comparison with a different formula)
- Below: "Share this matchup" button
```

---

## Phase 5 — Share & SEO

### Prompt 5.1 🔴 — OG image generation

```
Implement app/api/og/route.tsx using @vercel/og (works on Cloudflare with appropriate runtime config).

Two modes based on query params:
- /api/og?type=ranking&p=...&era=... → renders a 1200x630 image with: f1·versus logo, formula name, era label, top 10 drivers as a vertical list with rank + name + score. Background ink color, accents red, Fraunces font (load via Google Fonts URL fetch in route).
- /api/og?type=battle&a=...&b=...&p=...&era=... → renders the two-driver matchup card

Make sure the route handler:
- Sets runtime = 'edge'
- Caches aggressively (Cache-Control: public, max-age=3600, s-maxage=86400)
- Fetches driver data from D1 within the route

Update app/page.tsx and app/vs/[a]/[b]/page.tsx generateMetadata functions to emit og:image pointing to the corresponding /api/og URL with the current state encoded.

The "Share ranking" button on the page calls navigator.clipboard.writeText(window.location.href) and shows a 2-second toast "Link copied".
```

### Prompt 5.2 🟡 — Methodology page

```
Create app/methodology/page.tsx — a static page (no DB calls) explaining:
- Where the data comes from (F1DB, link out)
- How each of the 9 metrics is calculated (one paragraph each)
- How era adjustment works
- Why we don't include things like "race craft" or "wet weather" (subjective, no data)
- A "limitations" section being honest about what the tool can and can't tell us

This page is critical for SEO credibility AND for fending off "your tool is BS because X" critics. Be intellectually honest.

Style: editorial, long-form, Fraunces for headers, Inter Tight for body. No interactive elements. Generous typography. Max-width 720px centered.

Add this page to the header nav.
```

### Prompt 5.3 🟢 — SEO basics

```
Create:
- app/robots.txt as a Next.js route (app/robots.ts)
- app/sitemap.ts dynamic sitemap including: /, /methodology, /vs (picker), and a batch of /vs/[a]/[b] routes for the top 100 most-popular driver pairs (just enumerate: top 20 drivers x top 20 drivers, dedupe, exclude self)
- Per-page metadata: each /vs/[a]/[b] page generateMetadata returns a title like "Lewis Hamilton vs Michael Schumacher — F1 GOAT Calculator" and a tailored description with the current formula's score outputs
- Cloudflare Web Analytics snippet inserted in app/layout.tsx (env var for the token)

Do NOT add Google Analytics, Plausible, or any other tracker in v1.
```

---

## Phase 6 — Pre-launch polish

### Prompt 6.1 🟢 — Error boundaries and 404

```
Add:
- app/not-found.tsx — themed 404 page with "race retired" copy
- app/error.tsx — error boundary with a "try again" button
- A loading skeleton in app/loading.tsx for the ranking page

Sanity check all routes with proper TypeScript types and Suspense boundaries where needed.
```

### Prompt 6.2 🔴 — Pre-launch checklist

```
Before deploying, verify and fix any of these that fail:

1. F1DB sync script runs end-to-end locally and produces a driver_stats.db with at least the top 50 drivers having all 9 metrics filled for the "all" era.
2. The scoring engine produces sensible top-10 rankings under each preset (manual sanity check — Hamilton, Schumacher, Fangio, Senna should appear in top 10 of "Era Adjusted").
3. Changing sliders in custom mode re-orders the list with visible animation, no flash, no scroll jump.
4. URL state survives a page refresh — copy a custom URL, paste in new tab, see identical ranking.
5. OG image route returns a valid PNG for both modes when tested with curl.
6. /vs/[a]/[b] page works for all the top-20 driver IDs paired with each other.
7. Methodology page is readable and accurate.
8. The site is fully responsive down to 360px width.
9. Lighthouse: performance >= 85, accessibility >= 95, SEO >= 95.
10. No console errors in the browser on any page.

Print a report listing what passes and what fails. Fix the failures.
```

### Prompt 6.3 🟢 — Deploy

```
Final deployment checklist:

1. Set up Cloudflare D1 database f1versus-prod via wrangler.
2. Run the schema (lib/f1db/schema.sql) against it.
3. Run the sync-f1db script, then run the printed wrangler d1 commands to import driver_stats into prod D1.
4. Set required env vars via wrangler secret put or the Cloudflare dashboard:
   - NEXT_PUBLIC_SITE_URL=https://f1-versus.com
   - CLOUDFLARE_WEB_ANALYTICS_TOKEN=<token>
5. Run: npm run build && npx opennextjs-cloudflare && npx wrangler deploy
6. Verify the live site at f1-versus.com loads, ranking renders, and a custom-URL works.
7. Submit sitemap to Google Search Console.

Then stop. Do not add features. Wait for real user feedback before iterating.
```

---

## Launch (out of scope for prompts — Fatih executes)

1. Pre-stage 3 different formula links you'll share:
   - "My personal GOAT formula" — your custom slider state, with Senna/Verstappen ranked higher than the default to spark replies
   - "The 'stats geek' ranking" — pure totals, Hamilton wins, controversial-by-design
   - "Schumi era-adjusted" — Schumacher #1

2. Pin tweet from @fatihbuilds Sunday afternoon Istanbul time:
   > Built an F1 GOAT calculator. You set the formula, it shows the ranking. Here's mine: [link]. What's yours?

3. Reddit r/formula1 post Monday morning:
   > [OC] I built an F1 GOAT calculator using the open F1DB dataset. You define what greatness means — championships, peak performance, teammate H2H — and it ranks all 770+ drivers. What's your formula?
   > [link]
   > Honest about limitations in /methodology.

4. Wait 7 days. Watch traffic and feedback. Do not add features yet. The point of v1 is to learn whether the wedge resonates.

If wedge works: iterate (more drivers, better era adjustment, driver detail pages).
If wedge doesn't: read the feedback, decide whether to repivot or shelve. Do not patch endlessly.
