import { isEraId, type EraId } from '@/lib/f1db/types'
import { METRIC_KEYS } from '@/lib/scoring/constants'
import { DEFAULT_PRESET_ID, PRESETS, getPreset } from '@/lib/scoring/presets'
import type { Formula, Weights } from '@/lib/scoring/types'

const DEFAULT_ERA: EraId = 'all'

type Decoded = {
  formula: Formula
  era: EraId
  isCustom: boolean
}

/**
 * Parses URL params into a formula + era. Never throws — invalid input
 * silently falls back to defaults so the page always renders something.
 *
 * If p="custom" with malformed weights, returns the default preset's weights
 * but keeps isCustom=true so the UI can still show the sliders panel.
 */
export function decodeFormula(params: URLSearchParams): Decoded {
  const era = readEra(params)
  const presetParam = params.get('p')

  if (presetParam === 'custom') {
    const weights = readCustomWeights(params.get('w'))
    return {
      formula: { id: 'custom', label: 'Custom Formula', blurb: '', weights },
      era,
      isCustom: true,
    }
  }

  if (presetParam) {
    const preset = getPreset(presetParam)
    if (preset) return { formula: preset, era, isCustom: false }
  }

  return { formula: defaultPreset(), era, isCustom: false }
}

function readEra(params: URLSearchParams): EraId {
  const raw = params.get('era')
  return raw && isEraId(raw) ? raw : DEFAULT_ERA
}

function readCustomWeights(raw: string | null): Weights {
  if (!raw) return defaultPreset().weights
  const parsed = parseWeights(raw)
  return parsed ?? defaultPreset().weights
}

function parseWeights(raw: string): Weights | null {
  // Expected: "c10-w20-p5-q0-f5-r10-h15-l5-d5". Order must match METRIC_KEYS.
  const parts = raw.split('-')
  if (parts.length !== METRIC_KEYS.length) return null

  const out: Partial<Weights> = {}
  for (let i = 0; i < METRIC_KEYS.length; i++) {
    const expected = METRIC_KEYS[i]
    const part = parts[i]
    if (!expected || !part) return null
    if (!part.startsWith(expected)) return null
    const numStr = part.slice(1)
    if (!/^\d{1,3}$/.test(numStr)) return null
    const n = parseInt(numStr, 10)
    if (!Number.isFinite(n) || n < 0 || n > 99) return null
    out[expected] = n
  }
  return out as Weights
}

function defaultPreset(): Formula {
  return getPreset(DEFAULT_PRESET_ID) ?? PRESETS[0]!
}

export const DEFAULTS = { era: DEFAULT_ERA, presetId: DEFAULT_PRESET_ID }
export type { Decoded }
