# GridRival — Competitive Audit & Build Plan

**Product:** F1 Driver Head-to-Head Comparison Engine  
**Stack:** Next.js / Tailwind / Supabase / Cloudflare Pages  
**Monetization:** Ad-supported (Phase 1), optional Pro tier (Phase 2)  
**Author:** Fatih / Nokta Studio  
**Date:** March 2026

---

## Part 1: Competitive Landscape

### The Existing Players

There are roughly **6 active tools** that offer some form of F1 driver comparison. None of them own the space convincingly — the market is fragmented across hobby projects with varying levels of polish and depth.

---

### 1. Formula1Points.com — Head-to-Head

**What they do well:**
- Up to 4 drivers compared simultaneously
- Spider/radar charts on a 0–10 normalized scale
- Season-specific and career-wide views
- Teammate battle breakdowns (dedicated page)
- Active: data updated weekly, last modified March 2026

**What they do poorly:**
- UX is dated — dense tables, small fonts, cluttered layout
- No shareable social cards or OG images
- No circuit-level breakdown
- No narrative or contextual layer (e.g., "wet race specialist")
- No mobile optimization worth mentioning
- SEO structure is weak — dynamic pages, not pre-rendered static URLs

**Traffic signal:** This is the closest direct competitor. It has an established audience but has plateaued on design and features.

---

### 2. F1-Fansite.com — Driver Comparison Tool

**What they do well:**
- Simple two-driver comparison
- Career stats side-by-side
- Comment section with engaged community
- All-time driver rankings page with editorial content

**What they do poorly:**
- Very basic — just stat tables, no charts
- No filtering (by season, circuit, conditions)
- No visual identity; feels like a WordPress sidebar widget
- 403 errors on some pages (reliability issue)
- No social sharing features

---

### 3. 4mula1stats.com

**What they do well:**
- Compares drivers across different contexts (same team, same race, individual)
- Historical data since 1950
- "Compare by age" feature (unique)

**What they do poorly:**
- Extremely dated UI (looks like 2013)
- No charts — text/table only
- No mobile responsiveness
- Slow load times

---

### 4. Pitwall.app (Analytics Platform)

**What they do well:**
- Lap time comparison with lap-by-lap analysis
- Strategy timeline, gapper plots, what-if simulator
- AI-powered race narratives
- Historical data back to 1996
- Premium feel — polished, modern UI

**What they do poorly:**
- Focused on race analytics, NOT driver-vs-driver career comparison
- Freemium (3 races free, then paid)
- Niche audience — data nerds, not casual fans
- No social sharing / viral mechanic
- No SEO play for "Verstappen vs Hamilton" queries

**Important note:** Pitwall is NOT a direct competitor — it's an analytics workstation. But it sets the bar for what "modern F1 data UI" looks like.

---

### 5. TracingInsights.com

**What they do well:**
- Telemetry overlays, sector analysis
- Multi-season comparison (2018+)
- Active open-source community
- Annotated charts, stint analysis

**What they do poorly:**
- Analyst tool, not fan comparison tool
- Steep learning curve
- No pre-built driver-vs-driver pages
- No social/sharing layer

---

### 6. F1Bytes.com — Head-to-Head

**What they do well:**
- Clean teammate H2H methodology
- Dial/gauge visualizations for quick summary
- Detailed explanatory notes on methodology

**What they do poorly:**
- Teammate-only comparisons (no cross-team)
- Season-by-season only (no career aggregate)
- Small scale, limited features
- No charts beyond the summary dials

---

### 7. F1Metrics (WordPress blog)

**What they do well:**
- Mathematical driver ranking model (Elo-style)
- "What if" historical simulations (e.g., what if Senna survived?)
- Deep analytical credibility
- Frequently cited in community debates

**What they do poorly:**
- Blog format — not an interactive tool
- Hasn't been updated since 2019
- No user-facing comparison feature
- Content is static, not queryable

---

## Part 2: Gap Analysis — Where Everyone Falls Short

| Gap | Who has it? | Opportunity |
|-----|------------|-------------|
| **Beautiful, modern UI** | Only Pitwall (but wrong category) | Massive — every comparison tool looks like 2015 |
| **Shareable social cards** | Nobody | Viral growth mechanic, zero competition |
| **SEO-optimized static pages** | Nobody properly | `/compare/verstappen-vs-norris` — pure SEO gold |
| **Circuit-level breakdown** | Nobody in comparison tools | "Hamilton vs Verstappen at Monza" = unique content |
| **Condition filters (wet/dry)** | Nobody | Settles the "rain master" debates |
| **Narrative context** | F1Metrics (blog only) | AI-generated comparison summaries |
| **Mobile-first design** | Nobody | 60%+ of F1 social traffic is mobile |
| **Community voting/verdict** | Autosport/Motorsport (ratings only) | "Who's better?" polls on each comparison |

---

## Part 3: Your Wedge — The Three Differentiators

### Wedge 1: "The Social Debate Settler"

Every F1 argument on Twitter/Reddit follows the same pattern: claim → counter-claim → someone links a stats page → nobody agrees on interpretation. GridRival closes that loop by generating **shareable comparison cards** with a clear visual verdict.

When someone tweets "Norris > Leclerc and it's not close", they can link `gridrival.com/compare/norris-vs-leclerc` — and the OG card preview shows a visual summary right in the tweet. This is the viral loop that NO competitor has.

**Implementation:** Satori/`@vercel/og` or a Cloudflare Worker that renders comparison cards as PNG for OG meta tags.

### Wedge 2: "Context, Not Just Numbers"

Raw stats lie in F1. A driver with 0 wins might be more talented than a 4x champion if they never had the car. GridRival's wedge is **contextual comparison** — filters that let you slice by:

- **Teammate battles** (the most car-neutral metric)
- **Wet races only** (who's the rain king?)
- **Street circuits vs. permanent circuits**
- **First-lap position changes** (who's the overtaking specialist?)
- **Points scored vs. maximum possible** (normalized for car quality)

Then, an **AI-generated narrative summary** ties the numbers into a readable verdict: "While Hamilton has more raw wins, Verstappen's teammate gap is historically wider, suggesting a higher individual performance ceiling."

### Wedge 3: "Design as Moat"

Every existing tool looks like a data dump. GridRival should look like it belongs on the F1 broadcast — dark theme, team colors, clean typography, smooth animations. When someone screenshots a GridRival comparison, it should look like premium content, not a spreadsheet.

This is the ContentMorph thesis applied to F1 data: **the same information, presented in a way that's native to how people actually consume and share it.**

---

## Part 4: Data Architecture

### Primary Data Source: Jolpica API

The Jolpica API is the community successor to the deprecated Ergast API. It's free, open-source, and backward-compatible with Ergast endpoints.

- **Endpoint:** `http://api.jolpi.ca/ergast/f1/`
- **Rate limit:** 200 requests/hour (unauthenticated)
- **Coverage:** Full F1 history from 1950 to present
- **Update frequency:** Monday after each race weekend
- **Data available:** Race results, qualifying, sprint, standings, constructors, circuits, lap times, pit stops, driver info

**Strategy:** Don't hit the API on every page load. Instead:

1. Write a **weekly data sync script** (Node.js or Python) that pulls new results after each race
2. Store everything in **Supabase PostgreSQL**
3. Generate static pages at build time from the database
4. Re-build only changed pages via ISR (Incremental Static Regeneration)

### Supplementary: OpenF1 API

For richer data (telemetry, tire compounds, weather) from 2023 onwards:

- **Endpoint:** `https://api.openf1.org/v1/`
- **Rate limit:** 3 req/s, 30 req/min (free tier)
- **Unique data:** Tire compounds per stint, weather conditions, car telemetry
- **Use case:** "Wet race" filtering, tire strategy comparison

### Database Schema (Supabase)

```
drivers
  id, driver_ref, first_name, last_name, dob, nationality, headshot_url

constructors
  id, constructor_ref, name, color_hex

circuits
  id, circuit_ref, name, country, lat, lng, type (street/permanent)

races
  id, season, round, circuit_id, date, name

results
  id, race_id, driver_id, constructor_id, grid, position, points,
  status, fastest_lap_time, fastest_lap_rank

qualifying
  id, race_id, driver_id, constructor_id, q1_time, q2_time, q3_time

weather_conditions
  id, race_id, wet (boolean), temperature

driver_comparisons (pre-computed)
  id, driver_a_id, driver_b_id, season (nullable for career),
  stats_json, last_computed_at
```

Pre-computing the `driver_comparisons` table avoids expensive joins on every request. Recompute weekly after data sync.

---

## Part 5: Feature Specification (MVP)

### Page: `/compare/[driverA]-vs-[driverB]`

The core product page. Statically generated for the top ~500 driver pairs (current grid × current grid + historical legends).

**Sections (top to bottom):**

1. **Hero Header** — Driver photos, team colors, names, career summary line
2. **Quick Verdict Card** — AI-generated 2-sentence summary + community vote ("Who's better?")
3. **Career Stats Table** — Wins, poles, podiums, championships, fastest laps, DNFs, races started
4. **Radar Chart** — Normalized performance profile (race pace, qualifying, consistency, wet performance, overtaking, longevity)
5. **Season-by-Season Timeline** — Interactive line chart showing points per season for both drivers
6. **Teammate Battle Score** — How each driver performed vs. their teammates (the great equalizer)
7. **Circuit Breakdown** — Expandable table showing performance at each shared circuit
8. **Share Card** — "Share this comparison" button that generates a pre-formatted image

### Page: `/drivers`

Grid of all drivers with search/filter. Click any two to compare.

### Page: `/` (Homepage)

Trending comparisons, search bar, "Pick two drivers" CTA, latest race highlights.

### Page: `/rankings`

All-time and season rankings with sortable columns. Links to comparison pages.

---

## Part 6: SEO Strategy

### URL Structure

Every comparison generates a canonical URL:
```
/compare/verstappen-vs-hamilton
/compare/norris-vs-leclerc
/compare/senna-vs-prost
```

Alphabetical ordering ensures one canonical URL per pair (redirect `hamilton-vs-verstappen` → `verstappen-vs-hamilton` would be wrong; instead, always use the more-searched order based on keyword volume).

### Static Generation

At build time, generate pages for:
- All current-grid driver pairs (~250 pages)
- Top 50 historical legend pairs (Senna vs Prost, Schumacher vs Hamilton, etc.)
- All teammate pairs from last 10 seasons (~100 pages)

**Total: ~400 static pages at launch**, each a unique piece of indexable content.

### Structured Data

Each comparison page includes:
- FAQ schema: "Who has more wins, X or Y?" / "Have X and Y ever been teammates?"
- BreadcrumbList schema
- SportsEvent schema where applicable

### Internal Linking

Every driver page links to all their comparison pages. Every comparison page links to related comparisons. This creates a dense internal link graph that search engines love.

---

## Part 7: Monetization Plan

### Phase 1: Google AdSense (Month 1–3)

- Sidebar ads on desktop
- Between-section ads on mobile (after radar chart, after timeline)
- Anchor ad at bottom
- Target CPM: $3–8 (sports/automotive niche)
- Revenue estimate at 50K monthly pageviews: $150–400/month

### Phase 2: Premium Ad Networks (Month 4+)

- Apply to **Mediavine** (requires 50K sessions/month) or **Raptive** (100K pageviews)
- Sports niche CPMs on premium networks: $15–30
- Revenue estimate at 100K monthly pageviews: $1,500–3,000/month

### Phase 3: Affiliate + Sponsorship

- F1 TV affiliate link ("Watch these drivers race live")
- F1 merch store affiliate (team merchandise)
- Racing game affiliate (EA F1 game)
- Sponsored comparison pages from betting/fantasy platforms

### Phase 4 (Optional): Pro Tier

- No ads
- Export comparison data as PDF/image
- API access for content creators
- Custom comparison sets
- Price: $29 lifetime deal

---

## Part 8: Build Plan — 20-Prompt Playbook

Each prompt is designed for Cursor/Claude Code. Execute in order.

### Foundation (Prompts 1–5)

**Prompt 1 — Project Scaffold**
```
Create a Next.js 14+ App Router project with TypeScript, Tailwind CSS,
and Supabase client. Set up the folder structure:
app/(public)/compare/[slug]/page.tsx
app/(public)/drivers/page.tsx
app/(public)/rankings/page.tsx
lib/supabase/client.ts
lib/data/sync.ts
lib/data/types.ts
lib/comparison/compute.ts
Use environment variables for Supabase URL and anon key.
Add a dark theme as default with CSS variables for team colors.
```

**Prompt 2 — Database Schema + Migration**
```
Create Supabase migration files for the F1 database:
Tables: drivers, constructors, circuits, races, results, qualifying,
weather_conditions, driver_comparisons.
Include indexes on (driver_id, race_id) for results and qualifying.
Add a computed_stats JSONB column on driver_comparisons for flexible
stat storage. Include RLS policies: public read, service-role write only.
```

**Prompt 3 — Data Sync Script**
```
Build a Node.js script (lib/data/sync.ts) that:
1. Fetches all seasons from Jolpica API (api.jolpi.ca/ergast/f1/)
2. For each season, fetches races, results, qualifying, drivers, constructors
3. Upserts into Supabase tables using the service role key
4. Handles rate limiting (200 req/hr) with a delay queue
5. Logs progress and errors
6. Can be run incrementally (only fetch current season if --incremental flag)
Make it runnable via `npx tsx lib/data/sync.ts`
```

**Prompt 4 — Comparison Computation Engine**
```
Build lib/comparison/compute.ts that:
1. Takes two driver IDs and optional filters (season, circuit_type, wet_only)
2. Queries results + qualifying tables for both drivers
3. Computes: wins, poles, podiums, DNFs, avg finish, avg grid,
   points per race, teammate gap (avg qualifying delta to teammate),
   first-lap positions gained, consistency score (std dev of finishes)
4. Returns a structured ComparisonResult type
5. Includes a normalizeForRadar() function that scales each metric 0-10
6. Pre-compute career comparisons for all current-grid pairs and store
   in driver_comparisons table
```

**Prompt 5 — Driver Data Types + Helpers**
```
Create comprehensive TypeScript types in lib/data/types.ts:
Driver, Constructor, Circuit, Race, Result, Qualifying, Comparison,
RadarMetric, SeasonStats, TeammateRecord, CircuitPerformance.
Add helper functions:
- getDriverSlug(driver) → "max-verstappen"
- getComparisonSlug(driverA, driverB) → "verstappen-vs-hamilton"
- getTeamColor(constructorRef) → hex color
- formatLapTime(ms) → "1:23.456"
```

### Core Pages (Prompts 6–10)

**Prompt 6 — Comparison Page Layout**
```
Build app/(public)/compare/[slug]/page.tsx:
- Parse slug to extract two driver refs
- Fetch pre-computed comparison from Supabase
- If not found, compute on-demand and cache
- Layout sections: HeroHeader, QuickVerdict, StatsTable, RadarChart,
  SeasonTimeline, TeammateBattle, CircuitBreakdown, ShareCard
- Use generateStaticParams() to pre-render top 400 driver pairs
- Add generateMetadata() with dynamic OG image URL
- Dark theme with team color accents on each driver's side
```

**Prompt 7 — Radar Chart Component**
```
Build a reusable RadarChart React component using Recharts:
- 6 axes: Race Pace, Qualifying, Consistency, Wet Performance,
  Overtaking, Longevity
- Two overlapping polygons in each driver's team color
- Animated entrance on scroll into view
- Tooltip on hover showing exact values
- Responsive: full width on mobile, 50% on desktop
- Legend with driver names and team badges
```

**Prompt 8 — Season Timeline Chart**
```
Build a SeasonTimeline component using Recharts LineChart:
- X-axis: seasons (years)
- Y-axis: points scored
- Two lines in team colors
- Clickable season points that expand to show race-by-race breakdown
- Highlighted shared seasons (where both competed)
- Annotation markers for championship wins
- Smooth animation on load
```

**Prompt 9 — Stats Table + Teammate Battle**
```
Build two components:
1. StatsTable: Two-column comparison table with animated counting numbers.
   Rows: Wins, Poles, Podiums, Fastest Laps, Championships, Races Started,
   Points, DNFs. Highlight the leader in each row with a subtle glow.
2. TeammateBattle: For each driver, show their record vs. every teammate.
   Display as a horizontal bar chart (e.g., Hamilton 42-16 Bottas).
   Sort by most races together. This is the most car-neutral metric.
```

**Prompt 10 — Drivers Grid Page**
```
Build app/(public)/drivers/page.tsx:
- Grid of all drivers (current season first, then historical legends)
- Each card shows: headshot, name, team, nationality, career stats summary
- Click to select (checkbox style), once two selected → "Compare" button
- Search bar with fuzzy matching
- Filter by: decade, nationality, team
- Use Supabase query with pagination
```

### Growth Features (Prompts 11–15)

**Prompt 11 — OG Image / Social Share Card**
```
Build an API route app/api/og/[slug]/route.tsx that generates a
1200x630 PNG comparison card using Satori (@vercel/og).
Design: dark background, both drivers' headshots, key stats in between,
team color accents, GridRival logo watermark.
Wire this into the page's metadata: og:image → /api/og/verstappen-vs-hamilton
Also add a "Share" button that copies the URL + generates a
downloadable image version.
```

**Prompt 12 — Community Vote Widget**
```
Build a voting widget on each comparison page:
- "Who's better overall?" with two driver buttons
- Click to vote (store in Supabase with IP-based dedup)
- Show live results as an animated percentage bar
- "X% of fans chose [Driver]" summary
- Table: votes (id, comparison_slug, driver_ref, ip_hash, created_at)
- RLS: anyone can insert, only service role can read aggregates
- Display results only after voting (prevents bias)
```

**Prompt 13 — Circuit Breakdown Component**
```
Build CircuitBreakdown component:
- Expandable/collapsible list of circuits where both drivers raced
- For each circuit: avg finish, best finish, wins, poles
- Sort by: most races, biggest performance gap, alphabetical
- Small circuit outline SVG icon next to each name (use a sprite sheet)
- Click a circuit to see race-by-race results at that venue
- Filter toggles: Street circuits only, Wet races only
```

**Prompt 14 — AI Comparison Summary**
```
Build a server-side function that generates a 3-sentence comparison
narrative using the Groq API (llama-3.3-70b-versatile):
- Input: ComparisonResult object
- System prompt: "You are an F1 analyst. Write a concise, opinionated
  3-sentence verdict comparing these two drivers based on the stats
  provided. Be specific about numbers. Take a position."
- Cache the result in Supabase (regenerate weekly or on data update)
- Prefer Groq over Anthropic here for lower summary-generation cost
- Display in the QuickVerdict section with a subtle "AI Analysis" badge
- Fallback to a template-based summary if API is unavailable
```

**Prompt 15 — Homepage + Trending**
```
Build the homepage app/(public)/page.tsx:
- Hero: "Settle F1 arguments with data" + search bar (two driver inputs)
- Trending Comparisons: top 10 most-voted comparisons this week
- Latest Race Impact: "After [race], here's how the numbers changed"
- Popular Matchups: grid of 6 cards for evergreen comparisons
  (Senna vs Prost, Hamilton vs Verstappen, etc.)
- Quick stats: "X comparisons made, Y votes cast"
```

### Polish & Launch (Prompts 16–20)

**Prompt 16 — Mobile Optimization**
```
Audit and optimize all pages for mobile:
- Radar chart: switch to a simplified bar chart on screens < 640px
- Stats table: horizontal scroll or stacked cards on mobile
- Season timeline: swipeable with pinch-to-zoom
- Share button: use Web Share API on mobile for native share sheet
- Ensure all tap targets are 44px minimum
- Test on iPhone SE (375px) and Pixel 5 (393px) viewports
```

**Prompt 17 — Ad Integration**
```
Add Google AdSense integration:
- Create AdBanner component with responsive sizing
- Placements: after hero (leaderboard 728x90), after radar chart
  (medium rectangle 300x250), in circuit breakdown (in-feed),
  sticky footer on mobile (320x50)
- Use next/script for async ad loading
- Add ads.txt to public directory
- Ensure ads don't shift layout (reserve space with min-height)
- Add "Remove ads" link pointing to future Pro page
```

**Prompt 18 — SEO Hardening**
```
Optimize for search:
- Generate sitemap.xml with all comparison pages, driver pages, rankings
- Add robots.txt allowing all crawlers
- Implement JSON-LD structured data on comparison pages:
  FAQ schema ("Who has more wins?"), BreadcrumbList
- Add canonical URLs (handle reversed driver order redirects)
- Internal linking: each comparison links to related comparisons
  ("If you liked X vs Y, see also X vs Z")
- Create a /compare page listing all available comparisons (link hub)
- Ensure meta descriptions are unique per page with stats preview
```

**Prompt 19 — Performance + Cloudflare Deployment**
```
Optimize for Core Web Vitals and deploy:
- Implement image optimization for driver headshots (WebP, lazy loading)
- Add ISR (revalidate: 86400) to comparison pages
- Configure Cloudflare Pages deployment with wrangler
- Set up GitHub Actions CI/CD: lint → test → build → deploy
- Add Cloudflare caching headers for static assets (1 year)
- Enable Cloudflare Web Analytics (free, privacy-friendly)
- Test with Lighthouse: target 95+ on all metrics
```

**Prompt 20 — Analytics + Launch Checklist**
```
Final launch preparation:
- Add Plausible or Cloudflare Web Analytics for privacy-friendly tracking
- Track: page views, comparison pairs viewed, votes cast, shares
- Create a /changelog page for updates
- Add a feedback widget (simple email form or link to GitHub Issues)
- Write 3 seed blog posts for /blog:
  "The All-Time Best F1 Teammates Ranked by Data"
  "Wet Weather Kings: Who Really Is the Best in Rain?"
  "New Regs, New Era: How 2026 Drivers Compare So Far"
- Submit to Google Search Console
- Share on r/formula1, r/F1Technical, Hacker News, Product Hunt
- Post initial comparisons to Twitter with OG card previews
```

---

## Part 9: Timeline

| Week | Milestone |
|------|-----------|
| **1** | Prompts 1–5: Foundation, data pipeline, schema, first sync |
| **2** | Prompts 6–10: Core comparison page, charts, drivers grid |
| **3** | Prompts 11–15: Social cards, voting, AI summaries, homepage |
| **4** | Prompts 16–20: Mobile, ads, SEO, deploy, launch |

**Total estimated time: 4 weeks with vibe coding workflow.**

---

## Part 10: Naming & Domain

Working name: **GridRival**

Alternatives to check availability:
- `gridrival.com` / `gridrival.io`
- `driverversus.com`
- `f1versus.com`
- `pitdata.io`
- `racegap.com`
- `apexrival.com`

Pick whatever has a clean `.com` available. The name should evoke head-to-head competition.

---

## Summary: Why This Wins

The F1 driver comparison space is wide open. Existing tools are functional but ugly, data-rich but context-poor, and completely missing the social sharing layer that would make them grow organically.

GridRival's formula: **Beautiful design + contextual filters + shareable cards + SEO machine = organic growth with zero marketing spend.**

The closest competitor (formula1points.com) proves the demand exists. GridRival just needs to be the version you'd actually want to share on Twitter.


Month 1–2: Pure SEO mode. Launch with zero ads. Focus entirely on fast load times, clean markup, and getting those 400+ static comparison pages indexed. Google rewards fast, ad-free sites in early indexing. Every millisecond matters for Core Web Vitals, which directly affects your search rankings. This is when you're building the foundation that will generate revenue later.
Month 2–3: Validate traffic. Watch Google Search Console. Once you're seeing 1K+ monthly pageviews and pages are ranking for "X vs Y" queries, you know the SEO thesis is working. This is also when you should be posting comparisons on Reddit and Twitter to test the social sharing loop.
Month 3–4: Apply for AdSense. By now you'll have enough content and traffic for approval. Start with minimal, non-intrusive placements — one ad after the radar chart, one in the sidebar on desktop. Measure the impact on bounce rate and page speed. If your traffic is growing fast, you might even skip AdSense entirely and go straight to a premium network.
Month 6+: Premium networks. Mediavine (50K sessions/month) or Raptive (100K pageviews) pay 3–5x what AdSense pays. This is where the real money is in ad-supported content sites. Sports/automotive niches get $15–30 CPMs on these networks versus $3–8 on AdSense.
The one thing you should do from day one is add a placeholder AdBanner component with reserved height in your layout. This way when you do add ads, your layout doesn't shift and you don't need to redesign anything. Just a gray box with min-height that you swap for real ad code later.
Bottom line: ads on a new site with no traffic is all cost (slower pages, worse SEO) and zero benefit. Your first 10K pageviews are worth far more as SEO momentum than the $15 they'd generate in AdSense revenue.
