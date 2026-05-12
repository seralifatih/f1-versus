import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowLeftRight, ArrowRight, HelpCircle } from 'lucide-react'
import { getAllDriverStats, getDriverById } from '@/lib/f1db/client'
import type { DriverStats, EraId } from '@/lib/f1db/types'
import { flagOf } from '@/lib/flags'
import { rank, score } from '@/lib/scoring/engine'
import { METRIC_KEYS, METRIC_LABELS, METRIC_TOOLTIPS } from '@/lib/scoring/constants'
import type { ScoredDriver } from '@/lib/scoring/types'
import { decodeFormula } from '@/lib/url-state/decode'
import { encodeFormula } from '@/lib/url-state/encode'
import { ogImageUrl, toUrlSearchParams, type NextSearchParams } from '@/lib/url-state/next'

type Params = Promise<{ driverId: string }>

const ERA_LABEL: Record<EraId, string> = {
  all: 'All Time',
  golden: 'Golden Era',
  turbo: 'Turbo & Tobacco',
  modern: 'Modern',
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params
  searchParams: NextSearchParams
}): Promise<Metadata> {
  const { driverId } = await params
  const { formula, era } = decodeFormula(toUrlSearchParams(await searchParams))
  const driver = await getDriverById(driverId, 'all')
  if (!driver) return { title: 'Driver — f1·versus' }

  const title = `${driver.name} — F1 GOAT Calculator | f1·versus`
  const description = `${driver.name} ranked under your formula. See their 9-metric breakdown, era comparison, and head-to-head matchups.`
  const og = ogImageUrl('driver', formula, era, { id: driverId })

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  }
}

export default async function DriverPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: NextSearchParams
}) {
  const { driverId } = await params
  const sp = toUrlSearchParams(await searchParams)
  const { formula, era } = decodeFormula(sp)

  // Parallel fetch: driver in 'all' era + per-era variants for the comparison
  // table + the full all-era list for rank position and neighbors.
  const [driver, allDrivers, goldenSelf, turboSelf, modernSelf] = await Promise.all([
    getDriverById(driverId, 'all'),
    getAllDriverStats('all'),
    getDriverById(driverId, 'golden'),
    getDriverById(driverId, 'turbo'),
    getDriverById(driverId, 'modern'),
  ])

  if (!driver) notFound()

  const driverScore = score(driver.metrics, formula.weights)
  const ranked = rank(allDrivers, formula.weights)
  const rankIndex = ranked.findIndex((d) => d.driverId === driverId)
  const rankPosition = rankIndex >= 0 ? rankIndex + 1 : null

  // Era comparison: only show eras the driver actually appears in. If only
  // one era is non-null, the whole block is suppressed.
  const eraEntries = (
    [
      ['golden', goldenSelf],
      ['turbo', turboSelf],
      ['modern', modernSelf],
    ] as const
  ).filter(([, d]) => d !== null) as Array<[EraId, NonNullable<typeof goldenSelf>]>

  const neighbors = pickNeighbors(ranked, rankIndex)

  // Encoded params for "back to ranking" and other CTAs.
  const formulaParams = encodeFormula(formula, era).toString()

  return (
    <div className="space-y-12">
      <Link
        href={{ pathname: '/', search: formulaParams }}
        className="inline-flex items-center gap-1.5 text-xs text-muted2 hover:text-current transition-colors"
      >
        <ArrowLeft size={13} />
        Back to ranking
      </Link>

      <Hero
        name={driver.name}
        countryCode={driver.countryCode}
        firstYear={driver.firstYear}
        lastYear={driver.lastYear}
        score={driverScore}
        rankPosition={rankPosition}
        formulaLabel={formula.label}
      />

      <MetricBreakdown driver={driver} />

      {eraEntries.length > 1 && (
        <EraComparison
          entries={eraEntries.map(([id, d]) => ({
            id,
            label: ERA_LABEL[id],
            score: score(d.metrics, formula.weights),
            firstYear: d.firstYear,
            lastYear: d.lastYear,
          }))}
        />
      )}

      {neighbors.length > 0 && (
        <RelatedComparisons
          driverId={driverId}
          neighbors={neighbors}
          formulaParams={formulaParams}
        />
      )}

      <div className="pt-4 border-t border-border">
        <Link
          href={{ pathname: '/', search: formulaParams }}
          className="inline-flex items-center gap-1.5 text-xs text-muted2 hover:text-current transition-colors"
        >
          <ArrowLeft size={13} />
          See full ranking
        </Link>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Pieces
// ────────────────────────────────────────────────────────────────────────────

function Hero({
  name,
  countryCode,
  firstYear,
  lastYear,
  score,
  rankPosition,
  formulaLabel,
}: {
  name: string
  countryCode: string | null
  firstYear: number
  lastYear: number
  score: number
  rankPosition: number | null
  formulaLabel: string
}) {
  return (
    <section className="grid gap-6 sm:grid-cols-[1fr_auto] items-end">
      <div>
        <div className="flex items-center gap-4 mb-2">
          <span className="text-4xl sm:text-5xl">{flagOf(countryCode)}</span>
          <h1
            className="font-display font-normal tracking-[-0.03em] font-vary-[opsz_144,wght_400] leading-[1] m-0"
            style={{ fontSize: 'clamp(40px, 6vw, 64px)' }}
          >
            {name}
          </h1>
        </div>
        <div className="text-sm text-muted font-mono ml-[calc(2.25rem+1rem)] sm:ml-[calc(3rem+1rem)]">
          {firstYear}–{lastYear}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[28px] font-bold tracking-[-0.02em] leading-none">
          {score.toFixed(1)}
        </div>
        <div className="text-[11px] text-muted2 uppercase tracking-[0.12em] mt-2">
          {rankPosition !== null ? (
            <>
              Ranked <span className="text-red font-bold">#{rankPosition}</span> under{' '}
              {formulaLabel}
            </>
          ) : (
            <>Unranked under {formulaLabel}</>
          )}
        </div>
      </div>
    </section>
  )
}

function MetricBreakdown({ driver }: { driver: DriverStats }) {
  return (
    <section className="border border-border rounded-xl bg-panel">
      <div className="px-5 py-3 border-b border-border text-[11px] text-muted uppercase tracking-[0.12em]">
        Metric breakdown
      </div>
      <div className="divide-y divide-row-divider">
        {METRIC_KEYS.map((key) => {
          const value = driver.metrics[key]
          const pct = Math.max(0, Math.min(100, value))
          return (
            <div
              key={key}
              className="grid items-center gap-4 px-5 py-3 [grid-template-columns:1fr_2fr_auto]"
            >
              <div className="flex items-center gap-1.5 text-[13px]">
                <span>{METRIC_LABELS[key]}</span>
                <span title={METRIC_TOOLTIPS[key]} className="text-muted hover:text-current">
                  <HelpCircle size={12} />
                </span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-red rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-sm tabular-nums w-12 text-right">
                {value.toFixed(1)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EraComparison({
  entries,
}: {
  entries: Array<{ id: EraId; label: string; score: number; firstYear: number; lastYear: number }>
}) {
  return (
    <section>
      <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
        Era comparison
      </div>
      <div className="border border-border rounded-xl bg-panel divide-y divide-row-divider">
        {entries.map((e) => (
          <div
            key={e.id}
            className="grid items-center gap-4 px-5 py-3 [grid-template-columns:1fr_auto_auto]"
          >
            <div className="font-display text-[18px] font-medium tracking-[-0.01em] font-vary-[opsz_36]">
              {e.label}
            </div>
            <div className="text-xs text-muted font-mono">
              {e.firstYear}–{e.lastYear}
            </div>
            <div className="font-mono text-[20px] font-bold tabular-nums">
              {e.score.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RelatedComparisons({
  driverId,
  neighbors,
  formulaParams,
}: {
  driverId: string
  neighbors: Array<{ d: ScoredDriver; rank: number; relation: 'above' | 'below' }>
  formulaParams: string
}) {
  return (
    <section>
      <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
        Compare with&hellip;
      </div>
      <div className="border border-border rounded-xl bg-panel divide-y divide-row-divider">
        {neighbors.map((n) => (
          <Link
            key={n.d.driverId}
            href={{
              pathname: `/vs/${driverId}/${n.d.driverId}`,
              search: formulaParams,
            }}
            className="grid items-center gap-3 px-5 py-3 hover:bg-[rgba(239,51,64,0.04)] transition-colors [grid-template-columns:24px_1fr_auto_auto_auto]"
          >
            <span className="text-[11px] text-muted font-mono">#{n.rank}</span>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg shrink-0">{flagOf(n.d.countryCode)}</span>
              <span className="font-display text-[17px] font-medium tracking-[-0.01em] font-vary-[opsz_36] truncate">
                {n.d.name}
              </span>
            </div>
            <span className="font-mono text-sm tabular-nums">
              {n.d.score.toFixed(1)}
            </span>
            <span className="text-[10px] text-muted2 uppercase tracking-[0.1em]">
              {n.relation === 'above' ? 'above' : 'below'}
            </span>
            <span className="text-muted2 group-hover:text-red flex items-center gap-1">
              <ArrowLeftRight size={13} />
              <ArrowRight size={13} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function pickNeighbors(
  ranked: ScoredDriver[],
  index: number,
): Array<{ d: ScoredDriver; rank: number; relation: 'above' | 'below' }> {
  if (index < 0) return []
  const out: Array<{ d: ScoredDriver; rank: number; relation: 'above' | 'below' }> = []
  for (let off = 2; off >= 1; off--) {
    const i = index - off
    const d = ranked[i]
    if (i >= 0 && d) out.push({ d, rank: i + 1, relation: 'above' })
  }
  for (let off = 1; off <= 2; off++) {
    const i = index + off
    const d = ranked[i]
    if (i < ranked.length && d) out.push({ d, rank: i + 1, relation: 'below' })
  }
  return out
}
