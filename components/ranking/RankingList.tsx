'use client'

import { AnimatePresence } from 'framer-motion'
import type { ScoredDriver } from '@/lib/scoring/types'
import { RankingRow } from './RankingRow'

type Props = {
  ranked: ScoredDriver[]
  limit?: number
}

export function RankingList({ ranked, limit = 20 }: Props) {
  const rows = ranked.slice(0, limit)
  return (
    <section>
      <AnimatePresence mode="popLayout" initial={false}>
        {rows.map((d, idx) => (
          <RankingRow key={d.driverId} driver={d} rank={idx + 1} staggerIndex={idx} />
        ))}
      </AnimatePresence>
    </section>
  )
}
