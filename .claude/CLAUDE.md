# CLAUDE.md — f1-versus.com

This file tells AI coding assistants (Cursor, Claude Code) everything they need to know about this project. Read it first.

## Project Identity

**Name:** f1-versus.com
**One-liner:** The GOAT calculator for Formula 1. Build your formula, see the ranking, share the debate.
**Owner:** Fatih (Nokta Studio)
**Status:** Greenfield rebuild (post-pivot from generic comparison engine)
**Public-facing brand:** Nokta Studio side project. No mention of UNHCR anywhere.

## Why this project exists

The previous f1-versus.com was a generic driver comparison engine with unclear ICP and no viral hook. It is being scrapped. The new product answers ONE sharp question — "who is the F1 GOAT under your definition?" — and turns the answer into a shareable artifact.

Read `CONCEPT.md` for the full strategic context. Read `BUILD_PROMPTS.md` for the implementation order.

## Tech Stack (locked, do not propose alternatives)

- **Next.js 14** App Router + TypeScript (strict mode)
- **Tailwind CSS** with custom design tokens (see prototype `f1-goat-v1.jsx`)
- **D3** for any career trajectory / chart visualizations only — NOT for the main ranking UI (that's plain React + Tailwind)
- **Cloudflare D1** as the database (F1DB SQLite dump → D1 via wrangler)
- **Cloudflare Workers** runtime via `@opennextjs/cloudflare`
- **No auth in v1.** State lives entirely in URL search params.
- **No analytics SaaS in v1** — Cloudflare Web Analytics only (free, privacy-friendly, zero JS bloat)

Standard Nokta stack patterns apply: Paddle (not Stripe) if/when monetized, Resend for any email (none in v1).

## What the user actually does

1. Lands on `/` — sees Top 20 GOAT ranking computed with the default preset ("Era Adjusted")
2. Clicks a preset chip: ranking re-renders with row-reorder animation
3. Toggles era filter chip: ranking re-renders again
4. Opens "Custom" mode: 8–10 sliders. Moves any slider → ranking updates in real time. URL updates with the slider state.
5. Clicks "Share my ranking" → generates an OG image, copies URL to clipboard
6. (Alt path) Goes to `/vs/[a]/[b]` — Battle Card showing two drivers head-to-head under current formula

That's it. v1 ships nothing else.

## Anti-Goals (refuse politely if asked to add)

- Live race data / telemetry — F1DB doesn't have it
- User accounts, profiles, saved formulas server-side
- Race predictions, fantasy mechanics, gambling
- Full driver biography pages (gridvex/fastestlap own that space)
- Mobile native app
- Any feature requiring API keys to third parties (Ergast, OpenF1, etc.)

If a feature doesn't directly serve "user builds formula → sees ranking → shares it", push back.

## Data Pipeline

1. F1DB releases new SQLite dump at `https://github.com/f1db/f1db/releases` (CalVer e.g. `v2026.1.0`)
2. A script in `scripts/sync-f1db.ts` downloads the latest release, transforms relevant tables, and pushes to D1 via `wrangler d1 execute`
3. We do NOT keep ALL F1DB tables. We keep:
   - `driver` (basic info, country, dates)
   - `season_driver_standings` (for championships)
   - `race_result` (for wins, podiums, positions)
   - `qualifying_result` (for poles, quali H2H)
   - `fastest_lap` (for fastest laps)
   - A pre-computed `driver_stats` materialized table we generate (see below)
4. **Pre-computation is mandatory.** At sync time we compute every metric per driver and store it in `driver_stats` so runtime is just `SELECT * FROM driver_stats` + apply weights in JS. We never aggregate over millions of race result rows at request time.

## Scoring Engine

The scoring engine is a pure function:

```ts
function score(driver: DriverStats, formula: Formula, era: EraFilter): number
```

- `DriverStats`: pre-normalized 0–100 values for each metric (championships, wins, podiums, poles, fastest laps, win rate, teammate H2H race, teammate H2H quali, longevity, peak dominance)
- `Formula`: weights summing to 100 (UI enforces this) plus an `eraAdjusted: boolean`
- `EraFilter`: filters which seasons count toward `DriverStats` (we keep multiple pre-computed `driver_stats` variants per era OR filter on the fly — decide in implementation)

Engine lives in `lib/scoring/` and is unit-testable. UI is dumb — it just calls the engine.

## URL State Schema

```
/?p=era-adjusted&era=all
/?p=custom&w=c20-w15-p10-q10-f5-r10-h15-l10-d5&era=modern
/vs/lewis-hamilton/michael-schumacher?p=era-adjusted&era=all
```

- `p` = preset id OR `custom`
- `w` = weights, only present when `p=custom`. Format: `c<champs>-w<wins>-p<podiums>-q<poles>-f<fastest>-r<rate>-h<h2h>-l<long>-d<dom>` — single chars to keep URLs short
- `era` = `all` | `golden` | `turbo` | `modern`

Always validate URL state. Invalid state falls back to defaults silently.

## Design System

The prototype `f1-goat-v1.jsx` is the design bible. Match it pixel-by-pixel:
- Dark theme by default (race-night atmosphere)
- Editorial display font: **Fraunces** (variable, serif, sharp opticals)
- Body / numeric font: **JetBrains Mono** for ranks/scores, **Inter Tight** for prose (yes Inter for body is fine here because the display font carries character)
- Accent: signal red `#ef3340` (F1 race red without being a brand violation)
- Background: deep ink `#0a0a0b`, raised panels `#141416`
- Animation: row reorder uses `Motion` library (FLIP technique). Stagger 30ms per row.
- Numbers are LARGE. Ranks are huge. Scores are bold.

Do not use shadcn/ui pre-styled. Build custom. The product *looks* like a magazine power-ranking, not like a SaaS dashboard.

## File Structure (target)

```
/app
  /                       # Landing = ranking view
  /vs/[a]/[b]             # Battle Card
  /api/og                 # OG image generation for shares
  /methodology            # Static page explaining how scoring works (SEO + credibility)
/components
  /ranking                # RankingList, RankingRow
  /formula                # PresetChips, CustomSliders, EraFilter
  /battle                 # BattleCard, MetricBreakdown
/lib
  /scoring                # Pure scoring engine
  /f1db                   # D1 query helpers
  /url-state              # URL ↔ Formula encode/decode
/scripts
  sync-f1db.ts            # Pulls latest F1DB release into D1
/prototype
  f1-goat-v1.jsx          # Design bible — DO NOT DELETE
```

## What to do when uncertain

1. Re-read `CONCEPT.md` — does this serve the wedge?
2. Re-read the Anti-Goals section above — am I drifting?
3. If still unclear, leave a `// TODO(fatih): ...` comment and move on. Don't invent.

## Communication style with Fatih

- Direct, minimal, caveman-style. No filler.
- If a recommendation crosses a practical or ethical line, say so explicitly. Fatih will course-correct, not get defensive.
- Numbers and concrete tradeoffs over abstract advice.
