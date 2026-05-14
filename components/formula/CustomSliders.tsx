'use client'

import { HelpCircle } from 'lucide-react'
import { METRIC_KEYS, METRIC_LABELS, METRIC_TOOLTIPS } from '@/lib/scoring/constants'
import type { MetricKey, Weights } from '@/lib/scoring/types'

type Props = {
  weights: Weights
  onWeightChange: (key: MetricKey, value: number) => void
}

const MAX_WEIGHT = 50

// Telemetry-screen color logic for the live value readout.
//   0-10  → muted   (insignificant)
//   10-30 → green   (meaningful)
//   30+   → purple  (dominant)
function valueColor(v: number): string {
  if (v >= 30) return 'text-sector-purple'
  if (v >= 10) return 'text-sector-green'
  return 'text-muted'
}

function trackFill(v: number): string {
  const pct = Math.max(0, Math.min(100, (v / MAX_WEIGHT) * 100))
  // Green at 0%, transitioning through to purple at 100% of the filled
  // section. Unfilled section uses border so it doesn't disappear in light
  // theme. background-size keeps the fill anchored to the left.
  return `linear-gradient(to right, var(--color-sector-green), var(--color-sector-purple)) 0 / ${pct}% 100% no-repeat, var(--color-border)`
}

export function CustomSliders({ weights, onWeightChange }: Props) {
  return (
    <section className="border-y border-border-strong divide-y divide-border bg-panel">
      {METRIC_KEYS.map((key) => {
        const label = METRIC_LABELS[key]
        const value = weights[key]
        return (
          <div key={key} className="px-4 md:px-6 py-3">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="t-label text-muted">{label}</span>
                <span
                  title={METRIC_TOOLTIPS[key]}
                  aria-label={METRIC_TOOLTIPS[key]}
                  className="text-muted-2 hover:text-text cursor-help transition-colors"
                >
                  <HelpCircle size={13} />
                </span>
              </div>
              <span className={`t-value text-[24px] leading-none ${valueColor(value)}`}>
                {String(value).padStart(2, '0')}
              </span>
            </div>
            <div className="border border-border-strong">
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                value={value}
                onChange={(e) => onWeightChange(key, parseInt(e.target.value, 10))}
                aria-label={`${label} weight`}
                className="telemetry-slider w-full block"
                style={{ background: trackFill(value) }}
              />
            </div>
          </div>
        )
      })}
    </section>
  )
}
