'use client'

import { useCallback, useEffect, useState } from 'react'
import { Share2 } from 'lucide-react'
import type { DriverStats, EraId } from '@/lib/f1db/types'
import { METRIC_KEYS, METRIC_LABELS } from '@/lib/scoring/constants'
import { score } from '@/lib/scoring/engine'
import { PRESETS, getPreset } from '@/lib/scoring/presets'
import type { Formula, MetricKey } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { flagOf } from '@/lib/flags'

type Props = {
  a: DriverStats
  b: DriverStats
  initialFormula: Formula
  initialEra: EraId
}

export function BattleCard({ a, b, initialFormula, initialEra }: Props) {
  const [formula, setFormula] = useState<Formula>(initialFormula)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => setFormula(initialFormula), [initialFormula])

  const scoreA = score(a.metrics, formula.weights)
  const scoreB = score(b.metrics, formula.weights)

  const onPreset = useCallback(
    (id: string) => {
      const next = getPreset(id)
      if (!next) return
      setFormula(next)
      const params = encodeFormula(next, initialEra)
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
    },
    [initialEra],
  )

  const onShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2000)
    } catch {
      // No clipboard. URL is in the address bar — silent.
    }
  }, [])

  return (
    <div className="space-y-10">
      {/* Top — two driver cards side-by-side */}
      <section className="grid gap-4 md:grid-cols-2">
        <DriverHead driver={a} score={scoreA} winning={scoreA > scoreB} side="left" />
        <DriverHead driver={b} score={scoreB} winning={scoreB > scoreA} side="right" />
      </section>

      {/* Middle — per-metric breakdown */}
      <section className="border border-border rounded-xl bg-panel">
        <div className="px-6 py-4 border-b border-border text-[11px] text-muted uppercase tracking-[0.12em]">
          Metric breakdown
        </div>
        <div className="divide-y divide-[#161618]">
          {METRIC_KEYS.map((key) => (
            <MetricRow
              key={key}
              label={METRIC_LABELS[key]}
              weight={formula.weights[key]}
              valueA={a.metrics[key]}
              valueB={b.metrics[key]}
            />
          ))}
        </div>
      </section>

      {/* Switch formula */}
      <section>
        <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
          Switch formula
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = formula.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.id)}
                className={
                  'px-3.5 py-2 rounded-full border text-[13px] font-medium transition-colors duration-150 ' +
                  (active
                    ? 'border-red bg-[rgba(239,51,64,0.08)] text-white'
                    : 'border-border2 text-[#aaa] hover:text-white')
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Share */}
      <section className="flex justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border2 bg-[#161618] text-white text-xs font-medium"
          >
            <Share2 size={13} />
            Share this matchup
          </button>
          {toastVisible && (
            <span className="absolute right-0 top-full mt-2 text-[11px] text-muted2 font-mono whitespace-nowrap">
              Link copied
            </span>
          )}
        </div>
      </section>
    </div>
  )
}

type HeadProps = {
  driver: DriverStats
  score: number
  winning: boolean
  side: 'left' | 'right'
}

function DriverHead({ driver, score, winning }: HeadProps) {
  return (
    <div
      className={
        'p-6 rounded-xl border ' +
        (winning
          ? 'border-red bg-[linear-gradient(135deg,rgba(239,51,64,0.12),rgba(239,51,64,0.02))]'
          : 'border-border bg-panel')
      }
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{flagOf(driver.countryCode)}</span>
        <span className="font-display text-[28px] font-medium tracking-[-0.02em] font-vary-[opsz_72]">
          {driver.name}
        </span>
      </div>
      <div className="text-xs text-muted font-mono mb-6">
        {driver.firstYear}–{driver.lastYear}
      </div>
      <div className="flex items-baseline gap-3">
        <span
          className={
            'font-mono font-bold tracking-[-0.02em] ' + (winning ? 'text-red' : 'text-white')
          }
          style={{ fontSize: 56 }}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-[10px] text-[#555] uppercase tracking-[0.1em]">Score</span>
      </div>
    </div>
  )
}

type MetricRowProps = {
  label: string
  weight: number
  valueA: number
  valueB: number
}

function MetricRow({ label, weight, valueA, valueB }: MetricRowProps) {
  const aHigher = valueA > valueB
  const bHigher = valueB > valueA
  return (
    <div className="grid items-center gap-4 px-6 py-3" style={{ gridTemplateColumns: '1fr 160px 1fr' }}>
      {/* A side bar (right-aligned) */}
      <div className="flex items-center justify-end gap-3">
        <span className="font-mono text-sm tabular-nums text-[#bbb]">{Math.round(valueA)}</span>
        <Bar value={valueA} highlight={aHigher} align="right" />
      </div>

      {/* Label */}
      <div className="text-center">
        <div className="text-xs text-[#bbb]">{label}</div>
        <div className="text-[10px] text-muted font-mono">w={weight}</div>
      </div>

      {/* B side bar (left-aligned) */}
      <div className="flex items-center gap-3">
        <Bar value={valueB} highlight={bHigher} align="left" />
        <span className="font-mono text-sm tabular-nums text-[#bbb]">{Math.round(valueB)}</span>
      </div>
    </div>
  )
}

function Bar({ value, highlight, align }: { value: number; highlight: boolean; align: 'left' | 'right' }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
      <div
        className={'h-full ' + (highlight ? 'bg-red' : 'bg-muted2')}
        style={{
          width: `${pct}%`,
          marginLeft: align === 'right' ? 'auto' : 0,
        }}
      />
    </div>
  )
}
