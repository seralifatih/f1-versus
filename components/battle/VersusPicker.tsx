'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import type { EraId } from '@/lib/f1db/types'
import type { Formula, ScoredDriver } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { flagOf } from '@/lib/flags'

type Props = {
  ranked: ScoredDriver[]
  formula: Formula
  era: EraId
  seedDriverId?: string | null
}

const MAX_PICKS = 2

export function VersusPicker({ ranked, formula, era, seedDriverId }: Props) {
  const router = useRouter()
  const [picks, setPicks] = useState<string[]>(seedDriverId ? [seedDriverId] : [])

  const toggle = (driverId: string) => {
    setPicks((prev) => {
      if (prev.includes(driverId)) return prev.filter((id) => id !== driverId)
      if (prev.length >= MAX_PICKS) return prev
      return [...prev, driverId]
    })
  }

  const canCompare = picks.length === MAX_PICKS

  const onCompare = () => {
    if (!canCompare) return
    const [a, b] = picks
    const params = encodeFormula(formula, era)
    router.push(`/vs/${a}/${b}?${params.toString()}`)
  }

  return (
    <div className="space-y-8">
      <section>
        <h1
          className="font-display font-normal leading-[0.95] tracking-[-0.03em] font-vary-[opsz_144,wght_400] m-0"
          style={{ fontSize: 'clamp(36px, 5vw, 60px)', maxWidth: 900 }}
        >
          Pick two. <em className="not-italic text-red font-vary-[opsz_144,wght_500] italic">Settle it.</em>
        </h1>
        <p className="text-[15px] text-[#999] max-w-[620px] leading-[1.5] mt-3">
          Choose any two drivers and we&rsquo;ll lay them out side-by-side under your current
          formula.
        </p>
      </section>

      <div className="sticky top-0 z-10 bg-ink py-3 -mx-8 px-8 border-b border-border flex items-center justify-between">
        <div className="text-[11px] text-muted uppercase tracking-[0.12em]">
          {picks.length} / {MAX_PICKS} selected
        </div>
        <button
          type="button"
          onClick={onCompare}
          disabled={!canCompare}
          className={
            'flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors ' +
            (canCompare
              ? 'bg-red text-white hover:opacity-90'
              : 'border border-border2 bg-panel text-muted2 cursor-not-allowed')
          }
        >
          <ArrowLeftRight size={13} />
          Compare
        </button>
      </div>

      <section>
        {ranked.slice(0, 50).map((d, idx) => {
          const checked = picks.includes(d.driverId)
          const flag = flagOf(d.countryCode)
          const disabled = !checked && picks.length >= MAX_PICKS
          return (
            <button
              key={d.driverId}
              type="button"
              onClick={() => !disabled && toggle(d.driverId)}
              disabled={disabled}
              className={
                'w-full grid items-center gap-5 px-5 py-3 border-b border-[#161618] text-left transition-colors ' +
                (checked
                  ? 'bg-[rgba(239,51,64,0.06)]'
                  : disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-panel')
              }
              style={{ gridTemplateColumns: '32px 48px 1fr auto' }}
            >
              <span
                aria-hidden
                className={
                  'w-5 h-5 rounded border flex items-center justify-center ' +
                  (checked ? 'border-red bg-red text-white' : 'border-border2')
                }
              >
                {checked ? '✓' : ''}
              </span>
              <span
                className="font-display font-bold leading-none tracking-[-0.04em] font-vary-[opsz_72,wght_700] text-muted2"
                style={{ fontSize: 24 }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="text-base">{flag}</span>
                <span className="font-display text-[18px] font-medium tracking-[-0.01em] font-vary-[opsz_36]">
                  {d.name}
                </span>
                <span className="text-[11px] text-muted font-mono">
                  {d.firstYear}–{d.lastYear}
                </span>
              </span>
              <span className="font-mono text-[18px] font-bold text-white">
                {d.score.toFixed(1)}
              </span>
            </button>
          )
        })}
      </section>
    </div>
  )
}
