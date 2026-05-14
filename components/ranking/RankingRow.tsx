'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flagOf } from '@/lib/flags'
import { initialsFromName, raceNumberFor } from '@/lib/race-numbers'
import type { ScoredDriver } from '@/lib/scoring/types'
import { RaceNumberBox, type RaceNumberAccent } from '@/components/atoms/RaceNumberBox'
import { SectorBar, type SectorState } from '@/components/atoms/SectorBar'
import { VsHoverHint } from './VsHoverHint'

type Props = {
  driver: ScoredDriver
  rank: number // 1-based
  staggerIndex: number
  // Positive = moved UP in rank (smaller number), negative = moved DOWN.
  // Zero = unchanged or first appearance.
  delta?: number
  // Neighbors for the VS hover tooltip. Optional — passed from RankingList
  // so the row doesn't have to know the wider ranking list.
  above?: { driverId: string; name: string } | null
  below?: { driverId: string; name: string } | null
  // True if this row shares its score with at least one neighbor.
  // firstOfTie controls whether the "EQUAL SCORE" label is rendered.
  tied?: boolean
  firstOfTie?: boolean
}

function rankBand(rank: number): 'top3' | 'top10' | 'rest' {
  if (rank <= 3) return 'top3'
  if (rank <= 10) return 'top10'
  return 'rest'
}

const RANK_COLOR: Record<ReturnType<typeof rankBand>, string> = {
  top3: 'text-sector-purple',
  top10: 'text-text',
  rest: 'text-muted',
}

const NUMBER_ACCENT: Record<ReturnType<typeof rankBand>, RaceNumberAccent> = {
  top3: 'sector-purple',
  top10: 'curb-red',
  rest: 'muted',
}

const BAR_STATE: Record<ReturnType<typeof rankBand>, SectorState> = {
  top3: 'best',
  top10: 'good',
  rest: 'baseline',
}

export function RankingRow({
  driver,
  rank,
  staggerIndex,
  delta = 0,
  above = null,
  below = null,
  tied = false,
  firstOfTie = false,
}: Props) {
  const router = useRouter()
  const flag = flagOf(driver.countryCode)
  const band = rankBand(rank)
  const isFirst = rank === 1
  const number = raceNumberFor(driver.driverId)

  // Flash overlay: bumps when delta changes. We key on a counter so two
  // consecutive moves in the same direction both visibly flash.
  const [flashTick, setFlashTick] = useState(0)
  const lastDeltaRef = useRef(delta)
  useEffect(() => {
    if (delta !== 0 && delta !== lastDeltaRef.current) {
      setFlashTick((t) => t + 1)
    }
    lastDeltaRef.current = delta
  }, [delta])

  // Direction picks the sector color. Up = purple (good), down = yellow
  // (caution). Zero deltas never trigger the effect at all.
  const flashColor =
    delta > 0
      ? 'rgba(176, 38, 255, 0.08)'
      : delta < 0
        ? 'rgba(255, 204, 0, 0.08)'
        : 'transparent'

  return (
    <motion.div
      // layout="position" animates only translate, never width/height/font.
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.25, delay: staggerIndex * 0.015 },
        y: { duration: 0.25, delay: staggerIndex * 0.015 },
      }}
      data-rank-row={rank}
      className={
        'relative grid items-center gap-3 sm:gap-5 px-3 sm:px-5 py-4 border-b border-border hover:bg-panel-2 transition-colors ' +
        '[grid-template-columns:48px_36px_1fr_auto_auto] sm:[grid-template-columns:72px_44px_1fr_auto_88px_auto]'
      }
    >
      {/* Sector flash overlay. Pointer-events:none so it never eats clicks
          on the row contents. Keyed on flashTick so repeated moves replay. */}
      {flashTick > 0 && (
        <motion.span
          key={flashTick}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          initial={{ backgroundColor: flashColor, opacity: 1 }}
          animate={{ backgroundColor: flashColor, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        />
      )}
      {isFirst && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-sector-purple"
        />
      )}

      {/* CELL 1 — RANK */}
      <div className="text-right">
        <div
          className={`t-rank ${RANK_COLOR[band]}`}
          style={{
            fontSize: 'clamp(36px, 7vw, 56px)',
            // Tied rows desaturate slightly — keeps band hierarchy but
            // signals "this position is shared".
            opacity: tied ? 0.7 : 1,
          }}
        >
          {tied && (
            <span className="font-mono text-muted-2 mr-[0.05em]" aria-hidden="true">
              T
            </span>
          )}
          {String(rank).padStart(2, '0')}
        </div>
        {firstOfTie && (
          <div className="hidden sm:block t-label mt-1" aria-label="Equal score with following rows">
            Equal Score
          </div>
        )}
      </div>

      {/* CELL 2 — RACE NUMBER */}
      <div className="flex justify-center">
        <RaceNumberBox
          number={number}
          initials={number ? null : initialsFromName(driver.name)}
          accent={NUMBER_ACCENT[band]}
        />
      </div>

      {/* CELL 3 — IDENTITY */}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg shrink-0" aria-hidden="true">{flag}</span>
          <Link
            href={`/driver/${driver.driverId}`}
            className="font-display font-bold uppercase tracking-[-0.02em] text-[18px] sm:text-[22px] leading-tight hover:text-curb-red transition-colors truncate"
          >
            {driver.name}
          </Link>
        </div>
        <div className="mt-1 font-mono uppercase text-[12px] tracking-[0.1em] text-muted-2">
          {/* TODO(fatih): expose raw WDC count from DriverStats so we can
              render "· N WDC" here. Today only the normalized 0-100 metric
              is available, which doesn't survive era filters cleanly. */}
          {driver.firstYear}–{driver.lastYear}
        </div>
      </div>

      {/* CELL 4 — SCORE */}
      <div
        className={`t-value text-right tabular ${
          band === 'top3' ? 'text-sector-purple' : 'text-text'
        }`}
        style={{ fontSize: 'clamp(20px, 4vw, 32px)' }}
      >
        {driver.score.toFixed(1)}
      </div>

      {/* CELL 5 — DELTA BAR (desktop only) */}
      <div className="hidden sm:block w-[88px]">
        <SectorBar value={driver.score} state={BAR_STATE[band]} />
      </div>

      {/* CELL 6 — VS BUTTON */}
      <VsHoverHint above={above} below={below}>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(window.location.search)
            params.delete('seed')
            params.set('preselect', driver.driverId)
            router.push(`/vs?${params.toString()}`)
          }}
          title="Versus mode"
          aria-label={`Compare ${driver.name} against another driver`}
          className="h-8 w-8 border border-border-strong text-muted-2 hover:text-curb-red hover:border-curb-red transition-colors flex items-center justify-center"
        >
          <ArrowLeftRight size={14} />
        </button>
      </VsHoverHint>
    </motion.div>
  )
}
