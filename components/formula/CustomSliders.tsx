'use client'

import { HelpCircle } from 'lucide-react'
import { METRIC_KEYS, METRIC_LABELS, METRIC_TOOLTIPS } from '@/lib/scoring/constants'
import type { MetricKey, Weights } from '@/lib/scoring/types'

type Props = {
  weights: Weights
  onWeightChange: (key: MetricKey, value: number) => void
}

export function CustomSliders({ weights, onWeightChange }: Props) {
  return (
    <section className="p-5 border border-border rounded-xl bg-panel2">
      <div
        className="grid gap-x-6 gap-y-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {METRIC_KEYS.map((key) => {
          const label = METRIC_LABELS[key]
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5">
                  {label}
                  <span
                    title={METRIC_TOOLTIPS[key]}
                    aria-label={METRIC_TOOLTIPS[key]}
                    className="text-muted hover:text-current cursor-help transition-colors"
                  >
                    <HelpCircle size={12} />
                  </span>
                </span>
                <span className="text-red font-mono font-bold">{weights[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={weights[key]}
                onChange={(e) => onWeightChange(key, parseInt(e.target.value, 10))}
                aria-label={`${label} weight`}
                className="weight-slider w-full"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
