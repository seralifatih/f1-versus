'use client'

import { Sliders } from 'lucide-react'
import { PRESETS } from '@/lib/scoring/presets'
import type { Formula, MetricKey } from '@/lib/scoring/types'

type Props = {
  activePresetId: string | null
  isCustom: boolean
  onPresetChange: (id: string) => void
  onToggleCustom: () => void
}

// Three-letter labels for the weight indicator strip. Short enough to fit
// under a 36px square without wrapping or truncation.
const METRIC_SHORT: Record<MetricKey, string> = {
  c: 'CHA',
  w: 'WIN',
  p: 'POD',
  q: 'POL',
  f: 'FAS',
  r: 'RTE',
  h: 'H2H',
  l: 'LON',
  d: 'DOM',
}

function topMetrics(formula: Formula, n: number): Array<{ key: MetricKey; weight: number }> {
  return (Object.entries(formula.weights) as Array<[MetricKey, number]>)
    .map(([key, weight]) => ({ key, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
}

export function PresetChips({ activePresetId, isCustom, onPresetChange, onToggleCustom }: Props) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-3">
        <span className="t-label">Formula</span>
        <button
          onClick={onToggleCustom}
          className={
            'flex items-center gap-1.5 font-mono uppercase text-[13px] tracking-[0.1em] transition-colors ' +
            (isCustom ? 'text-curb-red' : 'text-muted hover:text-text')
          }
        >
          <Sliders size={13} />
          Custom Mode
        </button>
      </div>
      <div className="grid gap-px bg-border-strong grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        {PRESETS.map((p, idx) => {
          const active = !isCustom && p.id === activePresetId
          const code = `A.${String(idx + 1).padStart(2, '0')}`
          const top = topMetrics(p, 3)
          return (
            <button
              key={p.id}
              onClick={() => onPresetChange(p.id)}
              className={
                'relative text-left p-4 transition-colors group ' +
                (active
                  ? 'bg-panel-raised'
                  : 'bg-panel hover:bg-panel-raised')
              }
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-curb-red"
                />
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="t-label">{p.label.toUpperCase()}</span>
                <span className="t-label text-muted-2">{code}</span>
              </div>
              <div className="font-display font-bold uppercase text-[20px] tracking-[-0.02em] leading-tight mt-3">
                {p.label}
              </div>
              <div className="t-body-muted mt-2 leading-snug">{p.blurb}</div>
              <div className="mt-4 flex items-end gap-1.5">
                {top.map((m) => (
                  <div key={m.key} className="flex flex-col items-center gap-1">
                    <div className="border border-border-strong w-10 h-10 flex items-center justify-center t-value text-[15px] text-text">
                      {m.weight}
                    </div>
                    <span className="font-mono uppercase text-[11px] tracking-[0.08em] text-muted-2">
                      {METRIC_SHORT[m.key]}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
