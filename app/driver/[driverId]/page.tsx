import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowLeftRight, ArrowRight, HelpCircle } from 'lucide-react'
import { getAllDriverStats, getDriverById } from '@/lib/f1db/client'
import type { DriverStats, EraId } from '@/lib/f1db/types'
import { flagOf } from '@/lib/flags'
import { initialsFromName, raceNumberFor } from '@/lib/race-numbers'
import { rank, score } from '@/lib/scoring/engine'
import { METRIC_KEYS, METRIC_LABELS, METRIC_TOOLTIPS } from '@/lib/scoring/constants'
import type { ScoredDriver } from '@/lib/scoring/types'
import { decodeFormula } from '@/lib/url-state/decode'
import { encodeFormula } from '@/lib/url-state/encode'
import { ogImageUrl, toUrlSearchParams, type NextSearchParams } from '@/lib/url-state/next'
import { RaceNumberBox } from '@/components/atoms/RaceNumberBox'
import { SectionMarker } from '@/components/atoms/SectionMarker'

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

  const eraEntries = (
    [
      ['golden', goldenSelf],
      ['turbo', turboSelf],
      ['modern', modernSelf],
    ] as const
  ).filter(([, d]) => d !== null) as Array<[EraId, NonNullable<typeof goldenSelf>]>

  const neighbors = pickNeighbors(ranked, rankIndex)

  const formulaParams = encodeFormula(formula, era).toString()

  return (
    <div className="space-y-10">
      <Link
        href={{ pathname: '/', search: formulaParams }}
        className="inline-flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2 hover:text-curb-red transition-colors"
      >
        <ArrowLeft size={11} />
        Back to ranking
      </Link>

      <Hero
        driverId={driverId}
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
          currentEra={era}
          entries={eraEntries.map(([id, d]) => ({
            id,
            label: ERA_LABEL[id],
            score: score(d.metrics, formula.weights),
            firstYear: d.firstYear,
            lastYear: d.lastYear,
            href: `/?${encodeFormula(formula, id).toString()}`,
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

      <div className="pt-4 border-t border-border-strong">
        <Link
          href={{ pathname: '/', search: formulaParams }}
          className="inline-flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2 hover:text-curb-red transition-colors"
        >
          <ArrowLeft size={11} />
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
  driverId,
  name,
  countryCode,
  firstYear,
  lastYear,
  score,
  rankPosition,
  formulaLabel,
}: {
  driverId: string
  name: string
  countryCode: string | null
  firstYear: number
  lastYear: number
  score: number
  rankPosition: number | null
  formulaLabel: string
}) {
  const number = raceNumberFor(driverId)
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <SectionMarker code="00" label="Driver Profile" />
        <span className="font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2">
          ID: {driverId}
        </span>
      </div>
      <div className="border border-border-strong bg-panel p-5 md:p-6">
        <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-start">
          <div className="shrink-0">
            <RaceNumberBox
              number={number}
              initials={number ? null : initialsFromName(name)}
              accent="sector-purple"
            />
          </div>
          <div className="min-w-0">
            <h1
              className="font-display font-extrabold uppercase tracking-[-0.04em] leading-[0.95] m-0"
              style={{ fontSize: 'clamp(36px, 6vw, 64px)' }}
            >
              {name}
            </h1>
            <div className="mt-3 font-mono uppercase text-[11px] tracking-[0.12em] text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden="true" className="text-base">{flagOf(countryCode)}</span>
              <span>{countryCode ?? '—'}</span>
              <span>·</span>
              <span>
                {firstYear}–{lastYear}
              </span>
            </div>
          </div>
          <div className="text-right md:text-right">
            <div className="t-label">Rank</div>
            <div
              className="t-rank text-text mt-1"
              style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}
            >
              {rankPosition !== null ? String(rankPosition).padStart(2, '0') : '—'}
            </div>
            <div className="t-label mt-2">Under {formulaLabel}</div>
            <div
              className="t-value text-sector-purple mt-3"
              style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}
            >
              {score.toFixed(1)}
            </div>
            <div className="t-label mt-1">Score</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function metricColor(value: number): string {
  if (value >= 80) return 'bg-sector-purple'
  if (value >= 50) return 'bg-sector-green'
  if (value >= 20) return 'bg-muted-2'
  return 'bg-border-strong'
}

function metricValueColor(value: number): string {
  if (value >= 80) return 'text-sector-purple'
  if (value >= 50) return 'text-sector-green'
  if (value >= 20) return 'text-text'
  return 'text-muted'
}

function MetricBreakdown({ driver }: { driver: DriverStats }) {
  return (
    <section>
      <SectionMarker code="01" label="Metric Breakdown" className="mb-3" />
      <div className="border border-border-strong bg-panel">
        <table className="w-full border-collapse">
          <tbody>
            {METRIC_KEYS.map((key) => {
              const value = driver.metrics[key]
              const pct = Math.max(0, Math.min(100, value))
              return (
                <tr key={key} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="font-mono uppercase text-[11px] tracking-[0.1em] text-muted text-left px-4 py-2.5 whitespace-nowrap w-[180px]"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {METRIC_LABELS[key]}
                      <span
                        title={METRIC_TOOLTIPS[key]}
                        aria-label={METRIC_TOOLTIPS[key]}
                        className="text-muted-2 hover:text-text cursor-help"
                      >
                        <HelpCircle size={11} />
                      </span>
                    </span>
                  </th>
                  <td className="px-4 py-2.5">
                    <div className="h-2 bg-border overflow-hidden" aria-hidden="true">
                      <div
                        className={`h-full ${metricColor(value)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td
                    className={`t-value text-right tabular w-16 px-4 py-2.5 ${metricValueColor(value)}`}
                  >
                    {value.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EraComparison({
  currentEra,
  entries,
}: {
  currentEra: EraId
  entries: Array<{
    id: EraId
    label: string
    score: number
    firstYear: number
    lastYear: number
    href: string
  }>
}) {
  return (
    <section>
      <SectionMarker code="02" label="Era Comparison" className="mb-3" />
      <div className="border-y border-border-strong divide-y divide-border bg-panel">
        {entries.map((e) => {
          const isActive = e.id === currentEra
          const inner = (
            <>
              <div>
                <div className="font-display font-bold uppercase text-[16px] tracking-[-0.02em]">
                  {e.label}
                  {isActive && (
                    <span className="ml-2 t-label text-curb-red align-middle">current</span>
                  )}
                </div>
                <div className="mt-1 font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2">
                  {e.firstYear}–{e.lastYear}
                </div>
              </div>
              <div
                className={`t-value tabular text-[20px] ${
                  isActive ? 'text-sector-purple' : 'text-text'
                }`}
              >
                {e.score.toFixed(1)}
              </div>
            </>
          )
          return isActive ? (
            <div
              key={e.id}
              className="grid items-center gap-4 px-5 py-3 bg-panel-raised [grid-template-columns:1fr_auto] relative"
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[2px] bg-curb-red"
              />
              {inner}
            </div>
          ) : (
            <Link
              key={e.id}
              href={e.href}
              className="grid items-center gap-4 px-5 py-3 hover:bg-panel-2 transition-colors [grid-template-columns:1fr_auto]"
            >
              {inner}
            </Link>
          )
        })}
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
      <SectionMarker code="03" label="Compare With…" className="mb-3" />
      <div className="border-y border-border-strong divide-y divide-border bg-panel">
        {neighbors.map((n) => (
          <Link
            key={n.d.driverId}
            href={{
              pathname: `/vs/${driverId}/${n.d.driverId}`,
              search: formulaParams,
            }}
            className="grid items-center gap-3 px-5 py-3 hover:bg-panel-2 transition-colors [grid-template-columns:36px_1fr_auto_auto_auto]"
          >
            <span className="font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2">
              #{n.rank}
            </span>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg shrink-0" aria-hidden="true">{flagOf(n.d.countryCode)}</span>
              <span className="font-display font-bold uppercase text-[16px] tracking-[-0.02em] truncate">
                {n.d.name}
              </span>
            </div>
            <span className="t-value text-text text-[14px] tabular">
              {n.d.score.toFixed(1)}
            </span>
            <span className="t-label">
              {n.relation === 'above' ? 'above' : 'below'}
            </span>
            <span className="text-muted-2 flex items-center gap-1">
              <ArrowLeftRight size={12} />
              <ArrowRight size={12} />
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
