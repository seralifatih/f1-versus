import { describe, expect, it } from 'vitest'
import { ERA_IDS, type EraId } from '@/lib/f1db/types'
import { PRESETS } from '@/lib/scoring/presets'
import type { Formula, Weights } from '@/lib/scoring/types'
import { encodeFormula, encodeWeights } from './encode'
import { decodeFormula } from './decode'

const CUSTOM_WEIGHTS: Weights = {
  c: 12,
  w: 34,
  p: 7,
  q: 0,
  f: 50,
  r: 5,
  h: 18,
  l: 9,
  d: 22,
}

describe('encode → decode round-trip', () => {
  for (const preset of PRESETS) {
    for (const era of ERA_IDS) {
      it(`preset ${preset.id} with era ${era}`, () => {
        const params = encodeFormula(preset, era)
        const { formula, era: decodedEra, isCustom } = decodeFormula(params)
        expect(isCustom).toBe(false)
        expect(formula.id).toBe(preset.id)
        expect(formula.weights).toEqual(preset.weights)
        expect(decodedEra).toBe(era)
      })
    }
  }

  it('custom weights survive a round-trip', () => {
    const formula: Formula = {
      id: 'custom',
      label: 'Custom Formula',
      blurb: '',
      weights: CUSTOM_WEIGHTS,
    }
    const params = encodeFormula(formula, 'modern')
    const { formula: out, era, isCustom } = decodeFormula(params)
    expect(isCustom).toBe(true)
    expect(era).toBe('modern')
    expect(out.weights).toEqual(CUSTOM_WEIGHTS)
  })
})

describe('decodeFormula() fallbacks', () => {
  const DEFAULT_PRESET_ID = 'era-adjusted'
  const DEFAULT_ERA: EraId = 'all'

  it('empty params fall back to defaults', () => {
    const { formula, era, isCustom } = decodeFormula(new URLSearchParams())
    expect(formula.id).toBe(DEFAULT_PRESET_ID)
    expect(era).toBe(DEFAULT_ERA)
    expect(isCustom).toBe(false)
  })

  it('unknown preset id falls back to default preset', () => {
    const params = new URLSearchParams({ p: 'definitely-not-real', era: 'turbo' })
    const { formula, era, isCustom } = decodeFormula(params)
    expect(formula.id).toBe(DEFAULT_PRESET_ID)
    expect(era).toBe('turbo')
    expect(isCustom).toBe(false)
  })

  it('unknown era falls back to default era', () => {
    const params = new URLSearchParams({ p: 'stats-geek', era: 'jurassic' })
    expect(decodeFormula(params).era).toBe(DEFAULT_ERA)
  })

  it('p=custom with missing w falls back to default preset weights but stays custom', () => {
    const params = new URLSearchParams({ p: 'custom' })
    const { formula, isCustom } = decodeFormula(params)
    expect(isCustom).toBe(true)
    expect(formula.id).toBe('custom')
    // Should match the default preset's weights — that's the documented fallback.
    const defaultWeights = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.weights
    expect(formula.weights).toEqual(defaultWeights)
  })

  it('p=custom with malformed w falls back to default weights but stays custom', () => {
    const cases = [
      'garbage',
      'c10-w20',
      'x10-w20-p5-q0-f5-r10-h15-l5-d5',
      'c10-w20-p5-q0-f5-r10-h15-l5-dABC',
      'c-w20-p5-q0-f5-r10-h15-l5-d5',
    ]
    for (const w of cases) {
      const params = new URLSearchParams({ p: 'custom', w })
      const { formula, isCustom } = decodeFormula(params)
      expect(isCustom).toBe(true)
      expect(formula.id).toBe('custom')
      const defaultWeights = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.weights
      expect(formula.weights).toEqual(defaultWeights)
    }
  })

  it('completely garbage URL never throws', () => {
    const params = new URLSearchParams({ p: '%', era: '!!', w: '🏎️' })
    expect(() => decodeFormula(params)).not.toThrow()
    const { formula, era, isCustom } = decodeFormula(params)
    expect(formula.id).toBe(DEFAULT_PRESET_ID)
    expect(era).toBe(DEFAULT_ERA)
    expect(isCustom).toBe(false)
  })
})

describe('encodeWeights()', () => {
  it('produces the documented format', () => {
    expect(encodeWeights(CUSTOM_WEIGHTS)).toBe('c12-w34-p7-q0-f50-r5-h18-l9-d22')
  })

  it('clamps out-of-range and non-finite values', () => {
    const weights: Weights = {
      c: -5,
      w: 200,
      p: NaN,
      q: Infinity,
      f: 0,
      r: 0,
      h: 0,
      l: 0,
      d: 0,
    }
    expect(encodeWeights(weights)).toBe('c0-w99-p0-q0-f0-r0-h0-l0-d0')
  })
})
