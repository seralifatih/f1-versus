'use client'

import { useMemo, useState } from 'react'
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
  // FIFO queue — oldest selection drops out when a 3rd is clicked.
  const [picks, setPicks] = useState<string[]>(seedDriverId ? [seedDriverId] : [])

  const driverById = useMemo(() => {
    const m = new Map<string, ScoredDriver>()
    for (const d of ranked) m.set(d.driverId, d)
    return m
  }, [ranked])

  const togglePick = (driverId: string) => {
    setPicks((prev) => {
      if (prev.includes(driverId)) return prev.filter((id) => id !== driverId)
      if (prev.length < MAX_PICKS) return [...prev, driverId]
      // Already at MAX. Drop the oldest, append the new one.
      return [...prev.slice(1), driverId]
    })
  }

  const canCompare = picks.length === MAX_PICKS
  const onCompare = () => {
    if (!canCompare) return
    const [a, b] = picks
    if (!a || !b) return
    const params = encodeFormula(formula, era).toString()
    router.push(`/vs/${a}/${b}?${params}`)
  }

  const a = picks[0] ? driverById.get(picks[0]) : null
  const b = picks[1] ? driverById.get(picks[1]) : null

  return (
    <div className="space-y-8">
      <section>
        <h1
          className="font-display font-normal leading-[0.95] tracking-[-0.03em] font-vary-[opsz_144,wght_400] m-0"
          style={{ fontSize: 'clamp(36px, 5vw, 60px)', maxWidth: 900 }}
        >
          Pick two.{' '}
          <em className="italic text-red font-vary-[opsz_144,wght_500]">Settle it.</em>
        </h1>
        <p className="text-[15px] text-muted max-w-[620px] leading-[1.5] mt-3">
          Choose any two drivers and we&rsquo;ll lay them out side-by-side under your current
          formula.
        </p>
      </section>

      {/* Sticky banner — always present, but content shifts as picks change. */}
      <div
        className="sticky top-0 z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 backdrop-blur border-b border-border flex items-center justify-between gap-4"
        style={{ background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)' }}
      >
        <div className="text-[11px] sm:text-xs text-muted2 min-w-0">
          {canCompare && a && b ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-muted uppercase tracking-[0.12em]">Selected:</span>
              <span className="truncate" style={{ color: 'var(--color-text)' }}>{a.name}</span>
              <span className="text-red font-display italic font-vary-[opsz_36,wght_500]">vs</span>
              <span className="truncate" style={{ color: 'var(--color-text)' }}>{b.name}</span>
            </span>
          ) : picks.length === 1 ? (
            <span className="uppercase tracking-[0.12em] text-muted">Pick 1 more driver</span>
          ) : (
            <span className="uppercase tracking-[0.12em] text-muted">Pick 2 drivers</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCompare}
          disabled={!canCompare}
          className={
            'shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors ' +
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
          return (
            <button
              key={d.driverId}
              type="button"
              onClick={() => togglePick(d.driverId)}
              className={
                'w-full grid items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3 border-b border-row-divider text-left transition-colors [grid-template-columns:44px_1fr_auto_24px] sm:[grid-template-columns:56px_1fr_auto_28px] ' +
                (checked ? 'bg-[rgba(239,51,64,0.06)]' : 'hover:bg-panel')
              }
            >
              <span
                className="font-display font-bold leading-none tracking-[-0.04em] font-vary-[opsz_72,wght_700] text-muted2"
                style={{ fontSize: 22 }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">{flag}</span>
                <span className="font-display text-[16px] sm:text-[18px] font-medium tracking-[-0.01em] font-vary-[opsz_36] truncate">
                  {d.name}
                </span>
                <span className="hidden sm:inline text-[11px] text-muted font-mono">
                  {d.firstYear}–{d.lastYear}
                </span>
              </span>
              <span className="font-mono text-[16px] sm:text-[18px] font-bold tabular-nums">
                {d.score.toFixed(1)}
              </span>
              <span
                aria-hidden
                className={
                  'w-5 h-5 rounded border flex items-center justify-center justify-self-end transition-colors ' +
                  (checked ? 'border-red bg-red text-white' : 'border-border2')
                }
              >
                {checked ? '✓' : ''}
              </span>
            </button>
          )
        })}
      </section>
    </div>
  )
}
