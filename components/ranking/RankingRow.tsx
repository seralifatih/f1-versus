'use client'

import { motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flagOf } from '@/lib/flags'
import type { ScoredDriver } from '@/lib/scoring/types'

type Props = {
  driver: ScoredDriver
  rank: number // 1-based
  staggerIndex: number
}

export function RankingRow({ driver, rank, staggerIndex }: Props) {
  const router = useRouter()
  const flag = flagOf(driver.countryCode)
  const isFirst = rank === 1
  const isTopThree = rank <= 3

  return (
    <motion.div
      // layout="position" animates only translate, never width/height/font.
      // That's the key — the rank-number size jump from 56→36 stays instant
      // while the row's y-position slides smoothly.
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.25, delay: staggerIndex * 0.015 },
        y: { duration: 0.25, delay: staggerIndex * 0.015 },
      }}
      className="grid items-center gap-3 sm:gap-5 px-3 sm:px-5 py-[18px] border-b border-[#161618] [grid-template-columns:44px_1fr_auto] sm:[grid-template-columns:64px_1fr_auto_auto]"
      style={{
        background: isFirst
          ? 'linear-gradient(90deg, rgba(239,51,64,0.06), transparent 40%)'
          : undefined,
      }}
    >
      {/* Rank number — wrapped so the surrounding motion.div's layout=position
          never animates its font size. The size jump is intentional and instant. */}
      <div
        className="font-display font-bold leading-none tracking-[-0.04em] font-vary-[opsz_144,wght_700]"
        style={{
          // Two breakpoint sizes per slot (mobile vs desktop). Smaller on
          // mobile keeps the 360px viewport from horizontal-scrolling.
          fontSize: isFirst ? 'clamp(36px, 8vw, 56px)' : 'clamp(24px, 5vw, 36px)',
          color: isFirst ? '#ef3340' : isTopThree ? '#fff' : '#555',
        }}
      >
        {String(rank).padStart(2, '0')}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1 min-w-0">
          <span className="text-lg shrink-0">{flag}</span>
          {/* Driver detail page is v2. For v1, render an anchor so the URL
              exists for SEO/preview but it currently 404s — wire it up in v2. */}
          <Link
            href={`/driver/${driver.driverId}`}
            className="font-display text-[16px] sm:text-[20px] font-medium tracking-[-0.01em] font-vary-[opsz_48] hover:text-red transition-colors truncate"
          >
            {driver.name}
          </Link>
        </div>
        <div className="text-xs text-muted font-mono">
          {driver.firstYear}–{driver.lastYear}
        </div>
        {driver.why && (
          <div className="text-[11px] text-muted2 mt-1 italic">{driver.why}</div>
        )}
      </div>

      <div className="text-right">
        <div className="font-mono text-[20px] sm:text-[28px] font-bold text-white tracking-[-0.02em]">
          {driver.score.toFixed(1)}
        </div>
        <div className="text-[10px] text-[#555] uppercase tracking-[0.1em]">Score</div>
      </div>

      <button
        type="button"
        onClick={() => {
          // Send to the picker with this driver pre-seeded. The picker page
          // (/vs) reads the `seed` param and the existing formula/era
          // params from the URL.
          const params = new URLSearchParams(window.location.search)
          params.set('seed', driver.driverId)
          router.push(`/vs?${params.toString()}`)
        }}
        title="Versus mode"
        aria-label={`Compare ${driver.name} against another driver`}
        // Versus action hidden below sm — at 360px the ranking row is too
        // cramped. Mobile users navigate to /vs directly via the header.
        className="hidden sm:flex p-2 rounded-lg border border-border text-muted2 hover:text-white hover:border-border2 transition-colors items-center justify-center"
      >
        <ArrowLeftRight size={14} />
      </button>
    </motion.div>
  )
}
