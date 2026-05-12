'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Share2 } from 'lucide-react'
import type { EraId } from '@/lib/f1db/types'
import { rank } from '@/lib/scoring/engine'
import { getPreset } from '@/lib/scoring/presets'
import type { Formula, MetricKey, ScoredDriver } from '@/lib/scoring/types'
import { encodeFormula } from '@/lib/url-state/encode'
import { SectionMarker } from '@/components/atoms/SectionMarker'
import { LiveStats } from '@/components/layout/LiveStats'
import { EraFilter } from '@/components/formula/EraFilter'
import { PresetChips } from '@/components/formula/PresetChips'
import { CustomSliders } from '@/components/formula/CustomSliders'
import { RankingList } from './RankingList'
import { StartLights } from './StartLights'

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

  useEffect(() => setFormula(initialFormula), [initialFormula])
  useEffect(() => setCustom(isCustom), [isCustom])

  const ranked = useMemo(() => rank(initialRanked, formula.weights), [initialRanked, formula.weights])

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
      if (next) {
        const customFormula: Formula = {
          ...formula,
          id: 'custom',
          label: 'Custom Formula',
          blurb: '',
        }
        setFormula(customFormula)
        writeUrl(customFormula, initialEra)
      } else {
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
    <div>
      {/* HERO */}
      <section className="pb-10">
        <SectionMarker code="00" label="Driver GOAT Index" className="mb-6" />
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="t-display m-0">
              <span className="block">The F1 GOAT</span>
              <span className="block">Question</span>
              <span className="block text-sector-purple">
                <span aria-hidden="true">[ </span>
                Solved Your Way
                <span aria-hidden="true"> ]</span>
              </span>
            </h1>
            <p className="t-body-muted mt-6 max-w-[640px]">
              Six pre-built formulas. Nine metrics. Seventy-five years. Move a slider, settle a
              debate.
            </p>
          </div>
          <div className="hidden lg:block">
            <LiveStats />
          </div>
        </div>
      </section>

      <hr className="border-0 border-t border-border-strong" />

      {/* ERA FILTER */}
      <section className="py-8 space-y-4">
        <SectionMarker code="01.A" label="Era Filter" />
        <EraFilter value={initialEra} onChange={handleEraChange} />
      </section>

      <hr className="border-0 border-t border-border-strong" />

      {/* FORMULA */}
      <section className="py-8 space-y-4">
        <SectionMarker code="01.B" label="Formula" />
        <PresetChips
          activePresetId={custom ? null : formula.id}
          isCustom={custom}
          onPresetChange={handlePreset}
          onToggleCustom={handleToggleCustom}
        />
        {custom && (
          <div className="mt-6">
            <CustomSliders weights={formula.weights} onWeightChange={handleWeightChange} />
          </div>
        )}
      </section>

      <hr className="border-0 border-t border-border-strong" />

      {/* RANKING */}
      <section className="pt-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <SectionMarker
            code="01.C"
            label={`Top 20 — ${custom ? 'Custom Formula' : formula.label}`}
          />
          <ShareButton onShare={handleShare} copied={toastVisible} />
        </div>
        <StartLights>
          <RankingList ranked={ranked} />
        </StartLights>
      </section>
    </div>
  )
}

function ShareButton({ onShare, copied }: { onShare: () => void; copied: boolean }) {
  return (
    <button
      onClick={onShare}
      aria-live="polite"
      className={
        'relative flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-mono uppercase tracking-[0.1em] transition-colors overflow-hidden ' +
        (copied
          ? 'border-sector-green text-sector-green'
          : 'border-border-strong text-muted hover:text-curb-red hover:border-curb-red')
      }
    >
      {/* Green background flash sits behind the label and fades out. Pointer
          events disabled so the underlying button keeps catching clicks. */}
      {copied && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none animate-[shareflash_2s_ease-out_forwards]"
          style={{ background: 'color-mix(in srgb, var(--color-sector-green) 20%, transparent)' }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {copied ? <Check size={12} /> : <Share2 size={12} />}
        {copied ? 'URL Copied' : 'Share Ranking'}
      </span>
    </button>
  )
}
