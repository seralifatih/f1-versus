/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from '@vercel/og'
import { getAllDriverStats, getDriversByIds } from '@/lib/f1db/client'
import { rank, score } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
import { isEraId, type EraId } from '@/lib/f1db/types'
import { METRIC_LABELS, METRIC_KEYS } from '@/lib/scoring/constants'
import type { DriverStats } from '@/lib/f1db/types'
import { flagOf } from '@/lib/flags'

// Note: not setting runtime='edge' here. OpenNext for Cloudflare routes all
// pages and handlers through the standard Worker pipeline where the D1
// binding (`env.DB`) resolves cleanly. Forcing edge runtime trips up the
// dev fallback in lib/f1db/client.ts because edge runtime has no Node
// `require`. The image still renders in well under the request budget.
//
// Theme: OG images are intentionally always rendered in the dark palette.
// They're server-generated and cached aggressively; we have no signal for
// the viewer's theme preference. Dark is the brand's primary identity and
// the most legible at thumbnail size in social feeds.
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
} as const

const ERA_LABEL: Record<EraId, string> = {
  all: 'All Time · 1950–now',
  golden: 'Golden Era · 1950–1979',
  turbo: 'Turbo & Tobacco · 1980–2005',
  modern: 'Modern · 2006–now',
}

// Fraunces is bundled at build time by scripts/fetch-og-fonts.ts and lives
// under public/fonts/. Worker reads it via the ASSETS binding rather than
// fetching Google Fonts at request time — Cloudflare egress sometimes
// can't parse Google's CSS response, which 500s the OG route.
const fontCache = new Map<number, ArrayBuffer>()
async function loadFraunces(weight: 400 | 700, reqUrl: string): Promise<ArrayBuffer> {
  const cached = fontCache.get(weight)
  if (cached) return cached
  // ASSETS binding serves files relative to the site origin. Build an
  // absolute URL off the request so this works both in `wrangler dev`
  // and in production.
  const u = new URL(reqUrl)
  u.pathname = `/fonts/fraunces-${weight}.woff2`
  u.search = ''
  const res = await fetch(u.toString())
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${u.pathname}`)
  const font = await res.arrayBuffer()
  fontCache.set(weight, font)
  return font
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'ranking'

  try {
    if (type === 'battle') return await renderBattle(url.searchParams, req.url)
    // type === 'driver' falls through to the ranking image for now. The
    // driver detail OG is a follow-up; serving the ranking image keeps
    // social previews valid until the dedicated layout ships.
    return await renderRanking(url.searchParams, req.url)
  } catch (err) {
    console.error('OG render failed', err)
    return new Response('OG render failed', { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Ranking mode
// ────────────────────────────────────────────────────────────────────────────

async function renderRanking(params: URLSearchParams, reqUrl: string): Promise<Response> {
  const { formula, era } = decodeFormula(params)
  const drivers = await getAllDriverStats(era)
  const ranked = rank(drivers, formula.weights).slice(0, 10)

  const [fraunceReg, fraunceBold] = await Promise.all([
    loadFraunces(400, reqUrl),
    loadFraunces(700, reqUrl),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0b',
          color: '#e8e8e8',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 56px',
          fontFamily: 'Fraunces',
        }}
      >
        <Header eraLabel={ERA_LABEL[era]} formulaLabel={formula.label} />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, flex: 1 }}>
          {ranked.map((d, idx) => (
            <RankingRow
              key={d.driverId}
              rank={idx + 1}
              name={d.name}
              countryCode={d.countryCode}
              score={d.score}
            />
          ))}
        </div>
        <Footer />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: CACHE_HEADERS,
      fonts: [
        { name: 'Fraunces', data: fraunceReg, weight: 400, style: 'normal' },
        { name: 'Fraunces', data: fraunceBold, weight: 700, style: 'normal' },
      ],
    },
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Battle mode
// ────────────────────────────────────────────────────────────────────────────

async function renderBattle(params: URLSearchParams, reqUrl: string): Promise<Response> {
  const a = params.get('a')
  const b = params.get('b')
  if (!a || !b) return new Response('missing a/b', { status: 400 })

  const eraParam = params.get('era')
  const era: EraId = eraParam && isEraId(eraParam) ? eraParam : 'all'
  const { formula } = decodeFormula(params)

  const drivers = await getDriversByIds([a, b], era)
  const da = drivers.find((d) => d.driverId === a)
  const db = drivers.find((d) => d.driverId === b)
  if (!da || !db) return new Response('driver not found', { status: 404 })

  const scoreA = score(da.metrics, formula.weights)
  const scoreB = score(db.metrics, formula.weights)
  const [fraunceReg, fraunceBold] = await Promise.all([
    loadFraunces(400, reqUrl),
    loadFraunces(700, reqUrl),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0b',
          color: '#e8e8e8',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 56px',
          fontFamily: 'Fraunces',
        }}
      >
        <Header eraLabel={ERA_LABEL[era]} formulaLabel={formula.label} />
        <div style={{ display: 'flex', flex: 1, marginTop: 28, gap: 24 }}>
          <DriverCard driver={da} score={scoreA} winning={scoreA > scoreB} />
          <DriverCard driver={db} score={scoreB} winning={scoreB > scoreA} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 20,
            marginBottom: 12,
          }}
        >
          {METRIC_KEYS.slice(0, 5).map((key) => (
            <BattleBar
              key={key}
              label={METRIC_LABELS[key]}
              valueA={da.metrics[key]}
              valueB={db.metrics[key]}
            />
          ))}
        </div>
        <Footer />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: CACHE_HEADERS,
      fonts: [
        { name: 'Fraunces', data: fraunceReg, weight: 400, style: 'normal' },
        { name: 'Fraunces', data: fraunceBold, weight: 700, style: 'normal' },
      ],
    },
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ────────────────────────────────────────────────────────────────────────────

function Header({ eraLabel, formulaLabel }: { eraLabel: string; formulaLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          <span>f1</span>
          <span style={{ color: '#ef3340' }}>·</span>
          <span>versus</span>
        </div>
        <div
          style={{
            fontSize: 16,
            color: '#888',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          GOAT Calculator
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ fontSize: 28, color: '#ef3340', fontWeight: 700 }}>{formulaLabel}</div>
        <div style={{ fontSize: 14, color: '#888' }}>{eraLabel}</div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 14,
        color: '#666',
        borderTop: '1px solid #1f1f22',
        paddingTop: 16,
      }}
    >
      <span>Data: F1DB · Unofficial</span>
      <span>f1-versus.com</span>
    </div>
  )
}

function RankingRow({
  rank,
  name,
  countryCode,
  score,
}: {
  rank: number
  name: string
  countryCode: string | null
  score: number
}) {
  const isFirst = rank === 1
  const isTop3 = rank <= 3
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '6px 8px',
        borderBottom: '1px solid #161618',
        background: isFirst ? 'linear-gradient(90deg, rgba(239,51,64,0.08), transparent 40%)' : '',
      }}
    >
      <div
        style={{
          width: 64,
          fontSize: isFirst ? 40 : 30,
          fontWeight: 700,
          color: isFirst ? '#ef3340' : isTop3 ? '#fff' : '#555',
          letterSpacing: '-0.04em',
        }}
      >
        {String(rank).padStart(2, '0')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <span style={{ fontSize: 24 }}>{flagOf(countryCode)}</span>
        <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em' }}>{name}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{score.toFixed(1)}</div>
    </div>
  )
}

function DriverCard({
  driver,
  score,
  winning,
}: {
  driver: DriverStats
  score: number
  winning: boolean
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
        borderRadius: 16,
        border: winning ? '2px solid #ef3340' : '1px solid #1f1f22',
        background: winning
          ? 'linear-gradient(135deg, rgba(239,51,64,0.16), rgba(239,51,64,0.02))'
          : '#101012',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <span style={{ fontSize: 40 }}>{flagOf(driver.countryCode)}</span>
        <span style={{ fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em' }}>
          {driver.name}
        </span>
      </div>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 18 }}>
        {driver.firstYear}–{driver.lastYear}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: winning ? '#ef3340' : '#fff',
            letterSpacing: '-0.03em',
          }}
        >
          {score.toFixed(1)}
        </span>
        <span
          style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.15em' }}
        >
          Score
        </span>
      </div>
    </div>
  )
}

function BattleBar({
  label,
  valueA,
  valueB,
}: {
  label: string
  valueA: number
  valueB: number
}) {
  const aHigher = valueA > valueB
  const bHigher = valueB > valueA
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: '#bbb', minWidth: 32, textAlign: 'right' }}>
          {Math.round(valueA)}
        </span>
        <div style={{ display: 'flex', flex: 1, height: 8, background: '#1f1f22', borderRadius: 999, justifyContent: 'flex-end' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, valueA))}%`,
              background: aHigher ? '#ef3340' : '#888',
              borderRadius: 999,
            }}
          />
        </div>
      </div>
      <div style={{ width: 180, textAlign: 'center', fontSize: 14, color: '#bbb' }}>{label}</div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flex: 1, height: 8, background: '#1f1f22', borderRadius: 999 }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, valueB))}%`,
              background: bHigher ? '#ef3340' : '#888',
              borderRadius: 999,
            }}
          />
        </div>
        <span style={{ fontSize: 14, color: '#bbb', minWidth: 32 }}>{Math.round(valueB)}</span>
      </div>
    </div>
  )
}
