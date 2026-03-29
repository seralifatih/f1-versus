# F1 Driver Comparison Engine

Ad-supported Next.js web app for head-to-head F1 driver comparisons. Static-first SEO play targeting "X vs Y" search queries. Solo indie project by Nokta Studio.

## Stack

- Next.js 14+ (App Router, TypeScript, Tailwind CSS)
- Supabase (PostgreSQL + Row Level Security)
- Cloudflare Pages (deployment via GitHub Actions)
- Recharts (charts), Satori/@vercel/og (OG image generation)
- Jolpica API (F1 data: api.jolpi.ca/ergast/f1/) + OpenF1 API (telemetry/weather: api.openf1.org)
- Google AdSense (monetization)

## Commands

- `npm run dev` — local dev server (port 3000)
- `npm run build` — production build with static generation
- `npm run lint` — ESLint
- `npx tsx scripts/sync-data.ts` — sync F1 data from Jolpica API into Supabase
- `npx tsx scripts/sync-data.ts --incremental` — sync current season only
- `npx tsx scripts/compute-comparisons.ts` — pre-compute all driver pair stats
- `npm run deploy` — build + deploy to Cloudflare Pages via wrangler

## Architecture

```
app/
  (public)/
    page.tsx                    — homepage (trending comparisons, search)
    compare/[slug]/page.tsx     — core product: driver vs driver
    drivers/page.tsx            — driver grid with selection UI
    rankings/page.tsx           — sortable all-time rankings
  api/
    og/[slug]/route.tsx         — Satori OG image generation
    vote/route.ts               — community vote endpoint
lib/
  supabase/client.ts            — Supabase browser + server clients
  data/types.ts                 — all TypeScript types
  data/sync.ts                  — Jolpica API fetch + upsert logic
  comparison/compute.ts         — stats engine: takes 2 driver IDs → ComparisonResult
  comparison/normalize.ts       — radar chart 0-10 normalization
scripts/
  sync-data.ts                  — CLI entrypoint for data sync
  compute-comparisons.ts        — CLI entrypoint for pre-computation
```

## Key Decisions

- **Static generation is the product.** Every `/compare/[slug]` page is pre-rendered at build time via `generateStaticParams()`. ISR revalidates every 24h. Do NOT make these client-side fetches.
- **Comparison slug format:** always `{driverA-ref}-vs-{driverB-ref}` using Jolpica driver refs (e.g., `verstappen-vs-hamilton`). Alphabetical order by last name. Reversed URLs redirect to canonical.
- **Pre-computed stats:** The `driver_comparisons` table stores a `stats_json` JSONB column with the full ComparisonResult. Pages read from this table, not from raw results at request time.
- **Team colors come from the `constructors` table** (`color_hex` column). Never hardcode team colors.
- **Dark theme only.** Background: `#0a0a0a`. No light mode toggle.
- **No authentication.** Fully public read. Supabase RLS: public SELECT on all tables, service-role-only INSERT/UPDATE.

## Data Flow

1. `sync-data.ts` pulls from Jolpica API → upserts into `drivers`, `constructors`, `circuits`, `races`, `results`, `qualifying`
2. `compute-comparisons.ts` reads results/qualifying → computes stats for all driver pairs → stores in `driver_comparisons`
3. `npm run build` reads `driver_comparisons` → generates static pages
4. Weekly cron: sync → compute → build → deploy

## Jolpica API Notes

- Base URL: `http://api.jolpi.ca/ergast/f1/`
- Rate limit: 200 requests/hour. The sync script MUST include a delay queue (≥18s between requests).
- Response format: JSON. Wrap in `?limit=1000` for full result sets.
- Driver refs use lowercase hyphenated format: `max_verstappen`, `lewis_hamilton`
- Data updates on Monday after each race weekend.

## Gotchas

- Jolpica returns `position: "\\N"` for DNFs — handle as null, not string.
- Points systems changed across eras (pre-2010 vs post-2010). Normalize when comparing cross-era drivers.
- Sprint race results are in a separate endpoint (`/sprint`). Don't forget to sync them.
- Some historical drivers share surnames. Always use `driverId` (ref), never display name, as the unique key.
- Satori OG images cannot use Tailwind classes. Use inline styles only in `api/og/[slug]/route.tsx`.
- Cloudflare Pages has a 25k file limit for static output. With ~500 comparison pages this is fine, but don't generate all 50k+ possible historical pairs.

## Code Style

- TypeScript strict mode. No `any`.
- Named exports only. No default exports except page components (Next.js requirement).
- Use `cn()` utility (clsx + tailwind-merge) for conditional classes.
- Server Components by default. Add `"use client"` only when hooks or interactivity are needed.
- Prefer Supabase server client (`createServerClient`) in Server Components and Route Handlers. Browser client only in Client Components.

## When Compacting

Preserve: current file being edited, database schema, the comparison computation logic in `lib/comparison/compute.ts`, and any failing test output.