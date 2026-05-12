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

  // Sync local state when the server re-renders with new props (era change
  // triggers a real server navigation, formula change is a router.replace
  // that re-renders the route with new searchParams).
  useEffect(() => setFormula(initialFormula), [initialFormula])

  const scoreA = score(a.metrics, formula.weights)
  const scoreB = score(b.metrics, formula.weights)
  const aWins = scoreA > scoreB
  const bWins = scoreB > scoreA

  // Per-metric tally — three buckets so the user can see ties explicitly.
  // Compares rounded values, matching what the bars display: a metric where
  // one driver scored 29.4 and the other 29.0 reads as a tie to the user.
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

  // URL writers. Era change is a real navigation (re-fetch the era's data).
  // Formula change is router.replace so the server re-renders this same page
  // under new searchParams without changing routes.
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
      {/* 1. HEADLINE */}
      <section className="grid items-end gap-4 sm:gap-8 [grid-template-columns:1fr_auto_1fr]">
        <DriverColumn driver={a} score={scoreA} winning={aWins} align="left" />
        <div className="flex items-center justify-center">
          <span
            className="font-display italic text-red font-vary-[opsz_144,wght_500]"
            style={{ fontSize: 'clamp(48px, 10vw, 96px)', lineHeight: 1 }}
          >
            vs
          </span>
        </div>
        <DriverColumn driver={b} score={scoreB} winning={bWins} align="right" />
      </section>

      {/* 2. METRIC BREAKDOWN */}
      <section>
        <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
          Metric breakdown
        </div>
        <div className="border border-border rounded-xl bg-panel divide-y divide-row-divider">
          {METRIC_KEYS.map((k) => (
            <BiDirectionalRow
              key={k}
              metric={k}
              valueA={a.metrics[k]}
              valueB={b.metrics[k]}
            />
          ))}
        </div>
        <div className="mt-3 text-sm text-muted2 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>
              {a.name}
            </span>{' '}
            wins <span className="font-mono text-red font-bold">{metricTally.aCount}</span>.
          </span>
          <span>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>
              {b.name}
            </span>{' '}
            wins <span className="font-mono text-red font-bold">{metricTally.bCount}</span>.
          </span>
          {metricTally.tied > 0 && (
            <span>
              Tied on <span className="font-mono font-bold">{metricTally.tied}</span>.
            </span>
          )}
        </div>
      </section>

      {/* 3. FORMULA SWITCHER */}
      <section className="space-y-5">
        <div className="text-[11px] text-muted uppercase tracking-[0.12em]">
          Try a different formula
        </div>
        <PresetChips
          activePresetId={formula.id}
          isCustom={formula.id === 'custom'}
          onPresetChange={onPreset}
          onToggleCustom={() => {
            /* No-op on this page — switching to "custom" requires sliders
                which live on the home page. Future: open a modal sliders. */
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-red text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Copy size={13} />
            Copy link
          </button>
          {toastVisible && (
            <span className="absolute left-0 top-full mt-2 text-[11px] text-muted2 font-mono whitespace-nowrap">
              Link copied
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onShareX}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border2 bg-panel text-xs font-medium hover:border-red transition-colors"
        >
          {/* Simple X glyph as an inline SVG — no Lucide icon for X yet. */}
          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>
      </section>

      {/* 5. RELATED MATCHUPS */}
      {related.length > 0 && (
        <section>
          <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
            More matchups
          </div>
          <div className="border border-border rounded-xl bg-panel divide-y divide-row-divider">
            {related.map((d) => (
              <Link
                key={d.driverId}
                href={{
                  pathname: `/vs/${a.driverId}/${d.driverId}`,
                  search: encodeFormula(formula, initialEra).toString(),
                }}
                className="grid items-center gap-3 px-5 py-3 hover:bg-[rgba(239,51,64,0.04)] transition-colors [grid-template-columns:1fr_auto]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">{flagOf(d.countryCode)}</span>
                  <span className="font-display text-[16px] sm:text-[18px] font-medium tracking-[-0.01em] font-vary-[opsz_36] truncate">
                    {a.name} <span className="text-red italic">vs</span> {d.name}
                  </span>
                </div>
                <span className="font-mono text-sm text-muted2 tabular-nums">
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

function DriverColumn({
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
  // Right-side driver renders flag on the right of the name (mirror layout)
  // so the two driver columns visually frame the central "vs" centerpiece.
  const colClass = align === 'right' ? 'text-right items-end' : 'text-left items-start'
  const headerRowClass =
    align === 'right' ? 'flex-row-reverse justify-start' : 'justify-start'
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${colClass}`}>
      <div className={`flex items-center gap-3 sm:gap-4 min-w-0 w-full ${headerRowClass}`}>
        <span
          className="leading-none shrink-0"
          style={{ fontSize: 'clamp(28px, 4vw, 36px)' }}
          aria-label={driver.countryCode ?? 'unknown'}
        >
          {flagOf(driver.countryCode)}
        </span>
        <div
          className="font-display font-normal tracking-[-0.02em] font-vary-[opsz_72,wght_400] leading-[1.05] truncate min-w-0"
          style={{ fontSize: 'clamp(20px, 3.5vw, 36px)' }}
        >
          {driver.name}
        </div>
      </div>
      <div className="text-[11px] text-muted font-mono">
        {driver.firstYear}–{driver.lastYear}
      </div>
      <div
        className={
          'font-mono font-bold tracking-[-0.02em] leading-none mt-2 ' +
          (winning ? 'text-red' : 'text-muted2')
        }
        style={{ fontSize: 'clamp(36px, 6vw, 56px)' }}
      >
        {score.toFixed(1)}
      </div>
    </div>
  )
}

function BiDirectionalRow({
  metric,
  valueA,
  valueB,
}: {
  metric: MetricKey
  valueA: number
  valueB: number
}) {
  // Round to whole units to match the displayed values. Without this, a
  // metric where one driver scored 29.4 and the other 29.0 reads as "29 vs
  // 29" to the user but renders with mismatched bars and a red winner —
  // confusing. Comparing rounded ints keeps what-you-see consistent.
  const a = Math.round(valueA)
  const b = Math.round(valueB)
  // Scale so the larger of the two reaches the visible edge. Avoids both
  // bars stuck at ~5% just because neither driver dominates that metric
  // (e.g. fastest laps for two early-90s drivers).
  const max = Math.max(a, b, 1)
  const pctA = (a / max) * 100
  const pctB = (b / max) * 100
  const aLeads = a > b
  const bLeads = b > a

  return (
    <div className="grid items-center px-5 py-3 gap-2 sm:gap-4 [grid-template-columns:1fr_minmax(110px,160px)_1fr]">
      {/* A side: bar grows from CENTER toward LEFT */}
      <div className="flex items-center gap-2 justify-end min-w-0">
        <span className="font-mono text-xs text-muted tabular-nums w-10 text-right shrink-0">
          {a}
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden flex justify-end">
          <div
            className={'h-full rounded-full ' + (aLeads ? 'bg-red' : 'bg-muted2')}
            style={{ width: `${pctA}%` }}
          />
        </div>
      </div>

      {/* Label */}
      <div className="text-center px-1">
        <div className="text-[12px] text-muted">{METRIC_LABELS[metric]}</div>
      </div>

      {/* B side: bar grows from CENTER toward RIGHT */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
          <div
            className={'h-full rounded-full ' + (bLeads ? 'bg-red' : 'bg-muted2')}
            style={{ width: `${pctB}%` }}
          />
        </div>
        <span className="font-mono text-xs text-muted tabular-nums w-10 shrink-0">
          {b}
        </span>
      </div>
    </div>
  )
}
