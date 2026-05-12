'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import type { EraId } from '@/lib/f1db/types'
import type { Formula, ScoredDriver } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { flagOf } from '@/lib/flags'
import { initialsFromName, raceNumberFor } from '@/lib/race-numbers'
import { SectionMarker } from '@/components/atoms/SectionMarker'
import { RaceNumberBox } from '@/components/atoms/RaceNumberBox'

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
        <SectionMarker code="B" label="Versus Picker" className="mb-4" />
        <h1 className="t-headline m-0">
          Pick Two.{' '}
          <span className="text-sector-purple">
            <span aria-hidden="true">[ </span>Settle It<span aria-hidden="true"> ]</span>
          </span>
        </h1>
        <p className="t-body-muted max-w-[620px] mt-3">
          Choose any two drivers and we&rsquo;ll lay them out side-by-side under your current
          formula.
        </p>
      </section>

      <div
        className="sticky top-0 z-10 -mx-4 md:mx-0 px-4 md:px-5 py-3 backdrop-blur border-y border-border-strong flex items-center justify-between gap-4"
        style={{ background: 'color-mix(in srgb, var(--color-panel) 92%, transparent)' }}
      >
        <div className="font-mono uppercase text-[11px] tracking-[0.1em] min-w-0">
          {canCompare && a && b ? (
            <span className="flex items-center gap-2 flex-wrap text-text">
              <span className="text-muted-2">Selected —</span>
              <span className="truncate">{a.name}</span>
              <span className="text-sector-purple font-black">VS</span>
              <span className="truncate">{b.name}</span>
            </span>
          ) : picks.length === 1 ? (
            <span className="text-muted">Pick 1 more driver</span>
          ) : (
            <span className="text-muted">Pick 2 drivers</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCompare}
          disabled={!canCompare}
          className={
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-mono uppercase text-[11px] tracking-[0.1em] transition-colors ' +
            (canCompare
              ? 'bg-curb-red text-curb-white hover:opacity-90'
              : 'border border-border-strong text-muted-2 cursor-not-allowed')
          }
        >
          <ArrowLeftRight size={12} />
          Compare
        </button>
      </div>

      <section className="border-y border-border-strong bg-panel">
        {ranked.slice(0, 50).map((d, idx) => {
          const checked = picks.includes(d.driverId)
          const flag = flagOf(d.countryCode)
          const number = raceNumberFor(d.driverId)
          return (
            <button
              key={d.driverId}
              type="button"
              onClick={() => togglePick(d.driverId)}
              className={
                'w-full grid items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3 border-b border-border text-left transition-colors ' +
                '[grid-template-columns:36px_32px_1fr_auto_24px] sm:[grid-template-columns:48px_36px_1fr_auto_24px] ' +
                (checked ? 'bg-panel-raised' : 'hover:bg-panel-2')
              }
            >
              <span className="t-rank text-muted text-right" style={{ fontSize: 22 }}>
                {String(idx + 1).padStart(2, '0')}
              </span>
              <RaceNumberBox
                number={number}
                initials={number ? null : initialsFromName(d.name)}
                accent={checked ? 'sector-purple' : 'muted'}
              />
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0" aria-hidden="true">{flag}</span>
                <span className="font-display font-bold uppercase tracking-[-0.02em] text-[14px] sm:text-[16px] truncate">
                  {d.name}
                </span>
                <span className="hidden sm:inline font-mono uppercase text-[10px] tracking-[0.1em] text-muted-2">
                  {d.firstYear}–{d.lastYear}
                </span>
              </span>
              <span className="t-value text-text text-[14px] sm:text-[16px] tabular">
                {d.score.toFixed(1)}
              </span>
              <span
                aria-hidden
                className={
                  'w-5 h-5 border flex items-center justify-center justify-self-end transition-colors ' +
                  (checked
                    ? 'border-curb-red bg-curb-red text-curb-white'
                    : 'border-border-strong')
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
