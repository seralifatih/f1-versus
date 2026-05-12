# f1-versus.com — Pivot Concept Note

## TL;DR

**f1-versus.com is the GOAT calculator for Formula 1.**

Users pick a preset formula ("Stats Geek", "Era Adjusted", "Peak Performance", "Longevity Weighted") or build their own with sliders, and instantly see how all-time F1 drivers rank under their definition of "greatness". The output is a shareable ranking that fuels the eternal "Hamilton vs Schumacher vs Senna vs Verstappen" debate — one tweet at a time.

Tagline candidates:
- **"Settle the GOAT debate. Your formula, your ranking."**
- **"Build your F1 GOAT."**
- **"Who's the greatest F1 driver? You decide the formula."**

---

## The Wedge

Every F1 fan has an opinion on the GOAT. Every Reddit thread, every X reply, every podcast spends time on it. But there is **no neutral, interactive tool** that lets you say "OK, *this* is what greatness means to me — now show me the ranking."

Existing F1 stats sites (fastestlap.io, gridvex.app, Formula1.com) show **frozen rankings** — career wins, championships, podiums. They don't let you weight, adjust for era, or define your own criteria.

f1-versus.com fills that gap with **one sharp, viral hook**: the user becomes the judge, the tool does the math, and the result is begging to be screenshotted and argued about.

---

## Target User

**Primary:** F1 fans who argue about the sport on Reddit (r/formula1, r/F1Technical), X/Twitter, and Discord. Age 18–40. Already watches races. Already has takes. Wants ammunition for the next debate.

**Secondary:** SEO long-tail traffic from queries like "Hamilton vs Schumacher", "is Verstappen the GOAT", "best F1 driver of all time".

**Tertiary:** Curious newcomers post-Drive-to-Survive who want a framework for understanding F1 history.

Anti-user: hardcore data analysts who want telemetry, lap-time charts, and ML predictions. They have F1 Tempo, FastF1, OpenF1. Not us.

---

## Core Mechanics

### 1. Two-mode engine
- **Preset mode** (default landing): 6 hand-crafted GOAT formulas with one-line descriptions. User clicks one → ranking instantly recalculates with animated row reordering.
- **Custom mode**: 8–10 weighted sliders. User builds their own formula. URL state updates in real-time → shareable.

### 2. Era filter
Top-of-page chip selector: **All time (1950+) / Golden Era (1950–1979) / Turbo & Tobacco (1980–2005) / Modern (2006–now)**. Re-ranks within the selected era.

### 3. Primary output: ranking
Top 20 drivers (configurable, default 20), styled as a vertically scrolling list with:
- Rank number (big, bold display font)
- Driver photo / silhouette
- Country flag
- Career years (e.g., 2007–present)
- Score out of 100
- "Why" — a one-liner showing what pushed them up or down ("dominated era", "outperformed teammates by 0.4s avg")

### 4. Secondary output: Battle Card (Versus mode)
Tab/route: `/vs/[driver-a]/[driver-b]`. Two driver cards side by side, score comparison, per-metric breakdown. Built for direct query SEO ("hamilton vs schumacher").

### 5. Shareable artifact
"Share my ranking" → generates a static OG image (Next.js OG Image API) showing top 10 + the formula name + watermark `f1-versus.com`. URL contains slider state. Recipient opens link → sees the exact same ranking → can fork it.

---

## Scoring Metrics (the math)

These are the slider dimensions. F1DB gives us **everything we need** for these — no scraping, no API costs, no live data:

| Metric | F1DB source |
|---|---|
| World Championships | `season_driver_standings` (position = 1) |
| Race Wins | `race_results` (position = 1) |
| Podiums | `race_results` (position ≤ 3) |
| Pole Positions | `qualifying_results` (position = 1) |
| Fastest Laps | `fastest_laps` |
| Win Rate (wins / starts) | `race_results` |
| Teammate H2H — race | derived: compare positions to teammate same race |
| Teammate H2H — quali | derived: compare quali positions to teammate |
| Longevity (career years) | `driver` first/last race |
| Peak Dominance (best 3 consecutive seasons points share) | derived |
| Era Difficulty (grid depth, # of GP-winning teammates) | derived |

Era adjustment: each metric has an "era multiplier" applied so Fangio's 4 titles aren't unfairly compared to Hamilton's 7 across very different season lengths.

**Default preset weights** (each preset is just a different combo of these):
- **Stats Geek** — pure totals, no era adjustment
- **Era Adjusted** — same metrics, era-normalized
- **Peak Performance** — heavy weight on peak 3-year window, low longevity
- **Longevity** — heavy weight on career years, win rate over decades
- **Teammate Slayer** — H2H quali + race vs teammates dominant
- **Pure Speed** — poles + fastest laps + quali H2H

---

## Stack & Constraints

Aligned with your standard stack:
- **Next.js 14** (App Router) + TypeScript
- **Tailwind** + custom design system (see prototype)
- **D3** for any chart-y visualizations on driver detail pages (career trajectory)
- **Cloudflare D1** for the F1DB data (import SQLite dump → D1)
- **Cloudflare Workers via @opennextjs/cloudflare**
- **No backend auth needed** for v1 (state in URL)
- **Paddle** later if monetization, not in v1

Why D1 over JSON files: scoring queries need to aggregate over thousands of race results across hundreds of drivers. SQL is the right tool. D1 free tier handles this comfortably.

---

## Out of Scope (anti-goals)

To prevent f1-versus.com from becoming f1-versus.com v2 scope-creep:

- ❌ Live timing / telemetry — F1DB doesn't have it, not our wedge
- ❌ Race predictions — already done (formula1.plus)
- ❌ Fantasy F1 — already done (GridRival, official F1 app)
- ❌ Full stats reference (career profiles for every driver, lap-by-lap data) — gridvex.app and fastestlap.io own this
- ❌ Sign-up / accounts in v1 — friction kills viral. URL state only.
- ❌ Mobile app in v1 — responsive web first
- ❌ Predictions for current season — different product entirely

If something doesn't directly serve "the user builds a formula and shares a ranking", it doesn't ship in v1.

---

## Distribution Strategy

Pre-launch:
1. Pin tweet from @fatihbuilds: "I built a tool that lets you define what makes an F1 driver the GOAT. Here's my formula → [link with custom slider state pre-set]"
2. r/formula1 post: "I built a GOAT calculator using the open F1DB dataset. What's your formula?"
3. r/F1Technical for the era-adjustment methodology angle (more receptive crowd, smarter discussion)

The product *itself* is the marketing. Every share is a different ranking. Every ranking starts a fight.

---

## Monetization (not v1, but plausible v2)

- **Affiliate**: F1 TV subscriptions, racing book Amazon links on driver profile pages
- **Ko-fi / Buy Me a Coffee** initially
- **Premium tier later**: deeper analytics, "your formula vs the community average", historical alt-season simulator (would need substantial work, not for v1)

Realistic v1 goal: **traffic, not revenue.** This is an audience-building play that grows @fatihbuilds, gives Nokta Studio a flagship piece, and creates a known asset to monetize later.

---

## Success Metrics (3 months post-launch)

- 10k+ sessions/month from organic search + social
- 100+ shared formula URLs visited (network effect signal)
- 1 viral moment on r/formula1 (front page or 500+ upvotes) OR 1 viral X thread (50k+ impressions)
- Indexed for "f1 goat", "f1 greatest driver", at least one driver-vs-driver query

If none of these hit by month 3, the wedge is wrong and we pivot again. No further patches.

---

## Why this beats the current f1-versus

| Current f1-versus | New f1-versus |
|---|---|
| Generic driver comparison | One specific question (GOAT) with strong narrative |
| Static comparisons | Interactive sliders, every visit different |
| No share hook | Built-in viral mechanic |
| No clear ICP | Crystal clear: F1 fans who argue |
| SEO target unclear | Long-tail "X vs Y" + "f1 goat calculator" |
| Patches won't fix scope drift | Clean rebuild, locked scope, anti-goals explicit |
