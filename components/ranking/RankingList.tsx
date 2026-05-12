'use client'

import { useMemo, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { ScoredDriver } from '@/lib/scoring/types'
import { RankingRow } from './RankingRow'

type Props = {
  ranked: ScoredDriver[]
  limit?: number
}

export function RankingList({ ranked, limit = 20 }: Props) {
  const rows = ranked.slice(0, limit)

  // Track rank positions across renders so RankingRow can flash on delta.
  // Ref instead of state: we don't want the comparison itself to trigger
  // a re-render, just to be available during the next paint.
  const prevRanksRef = useRef<Map<string, number>>(new Map())

  // Compute previous-rank lookup from the previous render, then update
  // the ref with the current snapshot. Memo on `rows` so React.StrictMode
  // double-invoke doesn't immediately overwrite the snapshot before the
  // children read it.
  const prevRanks = useMemo(() => {
    const snapshot = new Map(prevRanksRef.current)
    const next = new Map<string, number>()
    rows.forEach((d, idx) => next.set(d.driverId, idx + 1))
    prevRanksRef.current = next
    return snapshot
  }, [rows])

  return (
    <section className="border-y border-border-strong bg-panel">
      <AnimatePresence mode="popLayout" initial={false}>
        {rows.map((d, idx) => {
          const rank = idx + 1
          const prev = prevRanks.get(d.driverId)
          // First-seen drivers (no prev entry) get no flash — that includes
          // the initial render where the start-lights are still playing.
          const delta = prev !== undefined ? prev - rank : 0
          const aboveRow = rows[idx - 1]
          const belowRow = rows[idx + 1]
          return (
            <RankingRow
              key={d.driverId}
              driver={d}
              rank={rank}
              staggerIndex={idx}
              delta={delta}
              above={aboveRow ? { driverId: aboveRow.driverId, name: aboveRow.name } : null}
              below={belowRow ? { driverId: belowRow.driverId, name: belowRow.name } : null}
            />
          )
        })}
      </AnimatePresence>
    </section>
  )
}
