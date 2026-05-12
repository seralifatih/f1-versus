/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from '@vercel/og'
import { getAllDriverStats, getDriversByIds } from '@/lib/f1db/client'
import { rank, score } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
import { isEraId, type EraId } from '@/lib/f1db/types'
import type { DriverStats } from '@/lib/f1db/types'
import { flagOf } from '@/lib/flags'
import { initialsFromName, raceNumberFor } from '@/lib/race-numbers'
import { BUILD_DATA_VERSION, BUILD_DATA_SYNC, APP_VERSION } from '@/lib/build-info'

// OG images are intentionally always rendered in the dark palette — they
// are server-cached and we have no signal for the viewer's theme.
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630

// New palette values, inlined as @vercel/og does NOT see CSS vars.
const C = {
  bg: '#0c0c0d',
  panel: '#131316',
  panelRaised: '#1e1e22',
  border: '#26262c',
  borderStrong: '#3a3a42',
  text: '#ececed',
  muted: '#9a9aa3',
  muted2: '#6a6a72',
  dim: '#45454c',
  sectorPurple: '#b026ff',
  sectorGreen: '#00d563',
  sectorYellow: '#ffcc00',
  curbRed: '#e6112d',
  curbWhite: '#ffffff',
} as const

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
} as const

const ERA_LABEL: Record<EraId, string> = {
  all: 'All Time · 1950–now',
  golden: 'Golden Era · 1950–1979',
  turbo: 'Turbo & Tobacco · 1980–2005',
  modern: 'Modern · 2006–now',
}

// Archivo is bundled at build time by scripts/fetch-og-fonts.ts and lives
// under public/fonts/. Worker reads it via the ASSETS binding rather than
// fetching Google Fonts at request time — Cloudflare egress sometimes
// can't parse Google's CSS response, which 500s the OG route.
const fontCache = new Map<number, ArrayBuffer>()
async function loadArchivo(weight: 400 | 800, reqUrl: string): Promise<ArrayBuffer> {
  const cached = fontCache.get(weight)
  if (cached) return cached
  const u = new URL(reqUrl)
  u.pathname = `/fonts/archivo-${weight}.woff`
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
    // type === 'driver' falls through to ranking until a dedicated driver
    // OG ships — keeps social previews valid.
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

  const [archivoReg, archivoBlack] = await Promise.all([
    loadArchivo(400, reqUrl),
    loadArchivo(800, reqUrl),
  ])

  return new ImageResponse(
    (
      <div style={shell()}>
        <TopStrip />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 48px 12px' }}>
          <div style={{ fontSize: 18, color: C.muted2, letterSpacing: '0.15em' }}>
            § 01 — TOP 10
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '-0.045em',
              lineHeight: 1,
              marginTop: 6,
              color: C.text,
            }}
          >
            {formula.label}
          </div>
          <div style={{ fontSize: 16, color: C.muted, marginTop: 6, letterSpacing: '0.05em' }}>
            {ERA_LABEL[era]}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            borderTop: `1px solid ${C.borderStrong}`,
            borderBottom: `1px solid ${C.borderStrong}`,
            margin: '0 48px',
            background: C.panel,
          }}
        >
          {ranked.map((d, idx) => (
            <RankingRow
              key={d.driverId}
              rank={idx + 1}
              driverId={d.driverId}
              name={d.name}
              countryCode={d.countryCode}
              score={d.score}
            />
          ))}
        </div>
        <BottomStrip />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: CACHE_HEADERS,
      fonts: [
        { name: 'Archivo', data: archivoReg, weight: 400, style: 'normal' },
        { name: 'Archivo', data: archivoBlack, weight: 800, style: 'normal' },
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
  const [archivoReg, archivoBlack] = await Promise.all([
    loadArchivo(400, reqUrl),
    loadArchivo(800, reqUrl),
  ])

  return new ImageResponse(
    (
      <div style={shell()}>
        <TopStrip />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 48px 12px' }}>
          <div style={{ fontSize: 18, color: C.muted2, letterSpacing: '0.15em' }}>
            § A — HEAD-TO-HEAD
          </div>
          <div
            style={{
              fontSize: 24,
              color: C.muted,
              marginTop: 6,
              letterSpacing: '0.05em',
            }}
          >
            {formula.label} · {ERA_LABEL[era]}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            margin: '0 48px',
            borderTop: `1px solid ${C.borderStrong}`,
            borderBottom: `1px solid ${C.borderStrong}`,
            background: C.panel,
          }}
        >
          <BattleColumn driver={da} score={scoreA} winning={scoreA > scoreB} align="left" />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0 16px',
              borderLeft: `1px solid ${C.borderStrong}`,
              borderRight: `1px solid ${C.borderStrong}`,
            }}
          >
            <div
              style={{
                fontSize: 96,
                fontWeight: 800,
                color: C.sectorPurple,
                letterSpacing: '-0.05em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              VS
            </div>
          </div>
          <BattleColumn driver={db} score={scoreB} winning={scoreB > scoreA} align="right" />
        </div>
        <BottomStrip />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: CACHE_HEADERS,
      fonts: [
        { name: 'Archivo', data: archivoReg, weight: 400, style: 'normal' },
        { name: 'Archivo', data: archivoBlack, weight: 800, style: 'normal' },
      ],
    },
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ────────────────────────────────────────────────────────────────────────────

function shell(): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    background: C.bg,
    color: C.text,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Archivo',
  }
}

function TopStrip() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 48px',
        borderTop: `1px solid ${C.borderStrong}`,
        borderBottom: `1px solid ${C.borderStrong}`,
        background: C.panel,
        height: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
          }}
        >
          <span>f1</span>
          <span style={{ color: C.curbRed }}>·</span>
          <span>versus</span>
        </span>
        <span
          style={{
            borderLeft: `1px solid ${C.borderStrong}`,
            height: 22,
          }}
        />
        <span
          style={{
            fontSize: 14,
            color: C.muted2,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          GOAT Calculator
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontSize: 12,
          color: C.muted2,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span>{BUILD_DATA_VERSION}</span>
        <span>SYNC {BUILD_DATA_SYNC}</span>
        <span style={{ color: C.curbRed }}>{APP_VERSION}</span>
      </div>
    </div>
  )
}

function BottomStrip() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 48px',
        borderTop: `1px solid ${C.borderStrong}`,
        background: C.panel,
        fontSize: 14,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: C.curbRed, fontWeight: 800 }}>
        MOVE THE SLIDERS YOURSELF →
      </span>
      <span style={{ color: C.muted2 }}>f1-versus.com</span>
    </div>
  )
}

function RankingRow({
  rank,
  driverId,
  name,
  countryCode,
  score,
}: {
  rank: number
  driverId: string
  name: string
  countryCode: string | null
  score: number
}) {
  const isTop3 = rank <= 3
  const number = raceNumberFor(driverId)
  const numberBg = isTop3 ? C.sectorPurple : rank <= 10 ? C.curbRed : C.panelRaised
  const scoreColor = isTop3 ? C.sectorPurple : C.text
  const rankColor = isTop3 ? C.sectorPurple : rank <= 10 ? C.text : C.muted
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '6px 18px',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          width: 56,
          fontSize: 36,
          fontWeight: 800,
          color: rankColor,
          letterSpacing: '-0.06em',
          textAlign: 'right',
        }}
      >
        {String(rank).padStart(2, '0')}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 32,
          background: numberBg,
          border: `1px solid ${C.borderStrong}`,
          color: C.curbWhite,
          fontSize: 14,
          fontWeight: 800,
        }}
      >
        {number ?? initialsFromName(name)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <span style={{ fontSize: 24 }}>{flagOf(countryCode)}</span>
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '-0.03em',
          }}
        >
          {name}
        </span>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: scoreColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {score.toFixed(1)}
      </div>
    </div>
  )
}

function BattleColumn({
  driver,
  score,
  winning,
  align,
}: {
  driver: DriverStats
  score: number
  winning: boolean
  align: 'left' | 'right'
}) {
  const number = raceNumberFor(driver.driverId)
  const numberBg = winning ? C.sectorPurple : C.panelRaised
  const isRight = align === 'right'
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '28px 32px',
        alignItems: isRight ? 'flex-end' : 'flex-start',
        textAlign: isRight ? 'right' : 'left',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexDirection: isRight ? 'row-reverse' : 'row',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            background: numberBg,
            border: `1px solid ${C.borderStrong}`,
            color: C.curbWhite,
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          {number ?? initialsFromName(driver.name)}
        </div>
        <span style={{ fontSize: 40 }}>{flagOf(driver.countryCode)}</span>
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '-0.04em',
          marginTop: 14,
          lineHeight: 1,
        }}
      >
        {driver.name}
      </div>
      <div
        style={{
          fontSize: 14,
          color: C.muted2,
          marginTop: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {driver.countryCode ?? '—'} · {driver.firstYear}–{driver.lastYear}
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: winning ? C.sectorPurple : C.muted,
          letterSpacing: '-0.04em',
          marginTop: 18,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {score.toFixed(1)}
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.muted2,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginTop: 6,
        }}
      >
        Score
      </div>
    </div>
  )
}
