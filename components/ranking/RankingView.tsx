'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Trophy } from 'lucide-react'
import type { EraId } from '@/lib/f1db/types'
import { rank } from '@/lib/scoring/engine'
import { getPreset } from '@/lib/scoring/presets'
import type { Formula, MetricKey, ScoredDriver } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { EraFilter } from '@/components/formula/EraFilter'
import { PresetChips } from '@/components/formula/PresetChips'
import { CustomSliders } from '@/components/formula/CustomSliders'
import { RankingList } from './RankingList'

type Props = {
  initialRanked: ScoredDriver[]
  initialFormula: Formula
  initialEra: EraId
  isCustom: boolean
}

export function RankingView({ initialRanked, initialFormula, initialEra, isCustom }: Props) {
  const router = useRouter()
  const [formula, setFormula] = useState<Formula>(initialFormula)
  const [custom, setCustom] = useState<boolean>(isCustom)
  const [toastVisible, setToastVisible] = useState(false)

  // Sync local state when the server re-renders with new props (e.g. after
  // an era change navigation). Without this, the client state would stay
  // stuck on the old formula even though the URL/server moved on.
  useEffect(() => setFormula(initialFormula), [initialFormula])
  useEffect(() => setCustom(isCustom), [isCustom])

  const ranked = useMemo(() => rank(initialRanked, formula.weights), [initialRanked, formula.weights])

  // Same-era URL updates: skip Next's router so we don't refetch from D1.
  // window.history.replaceState changes the URL bar only, no re-render.
  const writeUrl = useCallback((next: Formula, era: EraId) => {
    const params = encodeFormula(next, era)
    const url = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', url)
  }, [])

  const handlePreset = useCallback(
    (id: string) => {
      const preset = getPreset(id)
      if (!preset) return
      setFormula(preset)
      setCustom(false)
      writeUrl(preset, initialEra)
    },
    [initialEra, writeUrl],
  )

  const handleToggleCustom = useCallback(() => {
    setCustom((prev) => {
      const next = !prev
      // Entering custom mode: seed sliders from current formula. Leaving
      // custom mode: snap back to the most recently selected preset (or
      // the default if we can't find one).
      if (next) {
        const customFormula: Formula = { ...formula, id: 'custom', label: 'Custom Formula', blurb: '' }
        setFormula(customFormula)
        writeUrl(customFormula, initialEra)
      } else {
        // Best-effort: find a preset whose weights match the current formula.
        // Otherwise fall back to era-adjusted default.
        const matched = getPreset(formula.id) ?? getPreset('era-adjusted')
        if (matched) {
          setFormula(matched)
          writeUrl(matched, initialEra)
        }
      }
      return next
    })
  }, [formula, initialEra, writeUrl])

  const handleWeightChange = useCallback(
    (key: MetricKey, value: number) => {
      const customFormula: Formula = {
        id: 'custom',
        label: 'Custom Formula',
        blurb: '',
        weights: { ...formula.weights, [key]: value },
      }
      setFormula(customFormula)
      setCustom(true)
      writeUrl(customFormula, initialEra)
    },
    [formula, initialEra, writeUrl],
  )

  // Era change DOES need a server refetch (different driver set per era).
  const handleEraChange = useCallback(
    (nextEra: EraId) => {
      if (nextEra === initialEra) return
      const params = encodeFormula(formula, nextEra)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [formula, initialEra, router],
  )

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2000)
    } catch {
      // Clipboard blocked — silent. The URL is still in the address bar.
    }
  }, [])

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="mb-4">
        <h1
          className="font-display font-normal leading-[0.95] tracking-[-0.03em] font-vary-[opsz_144,wght_400] m-0"
          style={{ fontSize: 'clamp(40px, 6vw, 72px)', maxWidth: 900 }}
        >
          Settle the{' '}
          <em className="italic text-red font-vary-[opsz_144,wght_500]">GOAT</em> debate.
          <br />
          Your formula, your ranking.
        </h1>
        <p className="text-[17px] text-muted max-w-[620px] leading-snug mt-4">
          75 years of Formula 1 data. Six definitions of greatness, or build your own. Then
          start the argument.
        </p>
      </section>

      <EraFilter value={initialEra} onChange={handleEraChange} />

      <PresetChips
        activePresetId={custom ? null : formula.id}
        isCustom={custom}
        onPresetChange={handlePreset}
        onToggleCustom={handleToggleCustom}
      />

      {custom && <CustomSliders weights={formula.weights} onWeightChange={handleWeightChange} />}

      <section className="flex items-center justify-between">
        <div className="text-[11px] text-muted uppercase tracking-[0.12em]">
          <Trophy size={11} className="inline mr-1.5 align-[-1px]" />
          Top 20 — {custom ? 'Custom Formula' : formula.label}
        </div>
        <div className="relative">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border2 bg-panel2 text-xs font-medium hover:border-red transition-colors"
          >
            <Share2 size={13} />
            Share ranking
          </button>
          {toastVisible && (
            <span className="absolute right-0 top-full mt-2 text-[11px] text-muted2 font-mono whitespace-nowrap">
              Link copied
            </span>
          )}
        </div>
      </section>

      <RankingList ranked={ranked} />
    </div>
  )
}
