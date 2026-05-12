'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import type { DriverStats, EraId, MetricKey } from '@/lib/f1db/types'
import { METRIC_KEYS, METRIC_LABELS } from '@/lib/scoring/constants'
import { score } from '@/lib/scoring/engine'
import { getPreset } from '@/lib/scoring/presets'
import type { Formula, ScoredDriver } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { flagOf } from '@/lib/flags'
import { initialsFor, raceNumberFor } from '@/lib/driver-numbers'
import { RaceNumberBox } from '@/components/atoms/RaceNumberBox'
import { SectionMarker } from '@/components/atoms/SectionMarker'
import { EraFilter } from '@/components/formula/EraFilter'
import { PresetChips } from '@/components/formula/PresetChips'

type Props = {
  a: DriverStats
  b: DriverStats
  initialFormula: Formula
  initialEra: EraId
  related: ScoredDriver[]
}

export function BattleCard({ a, b, initialFormula, initialEra, related }: Props) {
  const router = useRouter()
  const [formula, setFormula] = useState<Formula>(initialFormula)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => setFormula(initialFormula), [initialFormula])

  const scoreA = score(a.metrics, formula.weights)
  const scoreB = score(b.metrics, formula.weights)
  const aWins = scoreA > scoreB
  const bWins = scoreB > scoreA

  // Per-metric tally — three buckets so the user can see ties explicitly.
  const metricTally = useMemo(() => {
    let aCount = 0
    let bCount = 0
    let tied = 0
    for (const k of METRIC_KEYS) {
      const av = Math.round(a.metrics[k])
      const bv = Math.round(b.metrics[k])
      if (av > bv) aCount++
      else if (bv > av) bCount++
      else tied++
    }
    return { aCount, bCount, tied }
  }, [a.metrics, b.metrics])

  const onPreset = useCallback(
    (id: string) => {
      const next = getPreset(id)
      if (!next) return
      const params = encodeFormula(next, initialEra).toString()
      router.replace(`?${params}`, { scroll: false })
    },
    [initialEra, router],
  )

  const onEra = useCallback(
    (nextEra: EraId) => {
      if (nextEra === initialEra) return
      const params = encodeFormula(formula, nextEra).toString()
      router.replace(`?${params}`, { scroll: false })
    },
    [formula, initialEra, router],
  )

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2000)
    } catch {
      // Clipboard blocked — silent.
    }
  }, [])

  const onShareX = useCallback(() => {
    const tweet =
      `Under ${formula.label} on f1-versus.com: ` +
      `${a.name} scores ${scoreA.toFixed(1)}, ${b.name} scores ${scoreB.toFixed(1)}. ` +
      `Build your own formula → ${window.location.href}`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [a.name, b.name, formula.label, scoreA, scoreB])

  return (
    <div className="space-y-12">
      {/* 1. IDENTITY STRIP */}
      <section>
        <div className="grid grid-cols-2 gap-px">
          <SectionMarker code="A.LEFT" label="Driver A" className="mb-3" />
          <SectionMarker code="A.RIGHT" label="Driver B" className="mb-3 justify-end" />
        </div>
        <div className="border border-border-strong bg-panel">
          <div className="grid items-center gap-4 p-5 [grid-template-columns:1fr_auto_1fr]">
            <DriverIdentity
              driver={a}
              score={scoreA}
              winning={aWins}
              align="left"
            />
            <div className="flex items-center px-2">
              <span className="hidden md:block flex-1 border-t border-border-strong" aria-hidden="true" />
              <span
                className="font-display font-black uppercase text-sector-purple tracking-[-0.04em] mx-3"
                style={{ fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1 }}
              >
                VS
              </span>
              <span className="hidden md:block flex-1 border-t border-border-strong" aria-hidden="true" />
            </div>
            <DriverIdentity
              driver={b}
              score={scoreB}
              winning={bWins}
              align="right"
            />
          </div>
        </div>
      </section>

      {/* 2. METRIC BREAKDOWN */}
      <section>
        <SectionMarker code="A.01" label="Metric Breakdown" className="mb-3" />
        <div className="border border-border-strong overflow-x-auto bg-panel">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="t-label text-left px-3 py-2">Metric</th>
                <th className="t-label text-right px-2 py-2 w-12">L</th>
                <th className="t-label text-left px-2 py-2">Left</th>
                <th className="t-label text-center px-2 py-2 w-16">Δ</th>
                <th className="t-label text-right px-2 py-2">Right</th>
                <th className="t-label text-left px-2 py-2 w-12">R</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_KEYS.map((k) => (
                <MetricRow
                  key={k}
                  metric={k}
                  valueA={a.metrics[k]}
                  valueB={b.metrics[k]}
                />
              ))}
            </tbody>
          </table>
        </div>
        <ResultLine
          a={a.name}
          b={b.name}
          aCount={metricTally.aCount}
          bCount={metricTally.bCount}
          tied={metricTally.tied}
        />
      </section>

      {/* 3. FORMULA SWITCHER */}
      <section className="space-y-5">
        <SectionMarker code="A.02" label="Try a different formula" />
        <PresetChips
          activePresetId={formula.id}
          isCustom={formula.id === 'custom'}
          onPresetChange={onPreset}
          onToggleCustom={() => {
            /* Sliders live on the home page. */
          }}
        />
        <EraFilter value={initialEra} onChange={onEra} />
      </section>

      {/* 4. SHARE */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-curb-red text-curb-white font-mono uppercase text-[11px] tracking-[0.1em] hover:opacity-90 transition-opacity"
          >
            <Copy size={12} />
            Copy Link
          </button>
          {toastVisible && (
            <span className="absolute left-0 top-full mt-2 text-[10px] text-muted-2 font-mono uppercase tracking-[0.1em] whitespace-nowrap">
              Link copied
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onShareX}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border-strong text-muted font-mono uppercase text-[11px] tracking-[0.1em] hover:text-curb-red hover:border-curb-red transition-colors"
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>
      </section>

      {/* 5. RELATED MATCHUPS */}
      {related.length > 0 && (
        <section>
          <SectionMarker code="A.03" label="More Matchups" className="mb-3" />
          <div className="border-y border-border-strong divide-y divide-border bg-panel">
            {related.map((d) => (
              <Link
                key={d.driverId}
                href={{
                  pathname: `/vs/${a.driverId}/${d.driverId}`,
                  search: encodeFormula(formula, initialEra).toString(),
                }}
                className="grid items-center gap-3 px-5 py-3 hover:bg-panel-2 transition-colors [grid-template-columns:1fr_auto]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0" aria-hidden="true">{flagOf(d.countryCode)}</span>
                  <span className="font-display font-bold uppercase text-[14px] sm:text-[16px] tracking-[-0.02em] truncate">
                    {a.name}{' '}
                    <span className="text-sector-purple font-black mx-1">VS</span>{' '}
                    {d.name}
                  </span>
                </div>
                <span className="t-value text-text text-[14px] tabular">
                  {d.score.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Pieces
// ────────────────────────────────────────────────────────────────────────────

function DriverIdentity({
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
  const isRight = align === 'right'
  const numberBox = (
    <RaceNumberBox
      number={number}
      initials={number ? null : initialsFor(driver.name)}
      accent={winning ? 'sector-purple' : 'muted'}
    />
  )
  const identity = (
    <div className={`min-w-0 ${isRight ? 'text-right' : 'text-left'}`}>
      <div
        className="font-display font-extrabold uppercase tracking-[-0.03em] leading-[1] truncate"
        style={{ fontSize: 'clamp(20px, 3.5vw, 36px)' }}
      >
        {driver.name}
      </div>
      <div
        className={`mt-2 font-mono uppercase text-[10px] tracking-[0.12em] text-muted-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${
          isRight ? 'justify-end' : ''
        }`}
      >
        <span aria-hidden="true">{flagOf(driver.countryCode)}</span>
        <span>{driver.countryCode ?? '—'}</span>
        <span>·</span>
        <span>
          {driver.firstYear}–{driver.lastYear}
        </span>
      </div>
      <div
        className={`mt-3 t-value tabular leading-none ${
          winning ? 'text-sector-purple' : 'text-muted'
        }`}
        style={{ fontSize: 'clamp(36px, 6vw, 56px)' }}
      >
        {score.toFixed(1)}
      </div>
    </div>
  )
  return (
    <div
      className={`flex items-center gap-4 min-w-0 ${
        isRight ? 'justify-end flex-row-reverse text-right' : 'justify-start'
      }`}
    >
      {numberBox}
      {identity}
    </div>
  )
}

function MetricRow({
  metric,
  valueA,
  valueB,
}: {
  metric: MetricKey
  valueA: number
  valueB: number
}) {
  const a = Math.round(valueA)
  const b = Math.round(valueB)
  const max = Math.max(a, b, 1)
  const pctA = (a / max) * 100
  const pctB = (b / max) * 100
  const aLeads = a > b
  const bLeads = b > a
  const tied = a === b

  const delta = a - b
  const deltaLabel = tied ? '=' : delta > 0 ? `+${delta}` : `${delta}`

  const aBar = aLeads ? 'bg-sector-purple' : tied ? 'bg-sector-yellow' : 'bg-muted-2'
  const bBar = bLeads ? 'bg-sector-purple' : tied ? 'bg-sector-yellow' : 'bg-muted-2'
  const deltaColor = tied
    ? 'text-sector-yellow'
    : aLeads
      ? 'text-sector-purple'
      : 'text-sector-purple'

  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="font-mono uppercase text-[11px] tracking-[0.1em] text-muted text-left px-3 py-2.5 whitespace-nowrap"
      >
        {METRIC_LABELS[metric]}
      </th>
      <td className="t-value text-right text-[13px] text-text px-2 py-2.5 tabular">{a}</td>
      <td className="px-2 py-2.5">
        <div className="h-2 bg-border overflow-hidden flex justify-end" aria-hidden="true">
          <div className={`h-full ${aBar}`} style={{ width: `${pctA}%` }} />
        </div>
      </td>
      <td
        className={`t-value text-center text-[12px] tabular px-2 py-2.5 ${deltaColor}`}
      >
        {deltaLabel}
      </td>
      <td className="px-2 py-2.5">
        <div className="h-2 bg-border overflow-hidden" aria-hidden="true">
          <div className={`h-full ${bBar}`} style={{ width: `${pctB}%` }} />
        </div>
      </td>
      <td className="t-value text-left text-[13px] text-text px-2 py-2.5 tabular">{b}</td>
    </tr>
  )
}

function ResultLine({
  a,
  b,
  aCount,
  bCount,
  tied,
}: {
  a: string
  b: string
  aCount: number
  bCount: number
  tied: number
}) {
  const aColor = aCount > bCount ? 'text-sector-purple' : 'text-muted'
  const bColor = bCount > aCount ? 'text-sector-purple' : 'text-muted'
  return (
    <div className="mt-3 font-mono uppercase tracking-[0.1em] text-[12px] flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-2">Result —</span>
      <span className={aColor}>
        {a} <span className="t-value">{aCount}</span>
      </span>
      <span className="text-muted-2">·</span>
      <span className="text-sector-yellow">
        Draw <span className="t-value">{tied}</span>
      </span>
      <span className="text-muted-2">·</span>
      <span className={bColor}>
        {b} <span className="t-value">{bCount}</span>
      </span>
    </div>
  )
}
