import type { EraId } from '@/lib/f1db/types'
import { METRIC_KEYS } from '@/lib/scoring/constants'
import type { Formula, Weights } from '@/lib/scoring/types'

/**
 * Builds URL params for a formula+era pair.
 *
 *   p   = preset id, OR the literal string "custom"
 *   w   = compact weights string, only when p=custom
 *         format: "c<n>-w<n>-p<n>-q<n>-f<n>-r<n>-h<n>-l<n>-d<n>"
 *   era = era id
 */
export function encodeFormula(formula: Formula, era: EraId): URLSearchParams {
  const params = new URLSearchParams()
  const isCustom = formula.id === 'custom'

  params.set('p', isCustom ? 'custom' : formula.id)
  if (isCustom) params.set('w', encodeWeights(formula.weights))
  params.set('era', era)
  return params
}

export function encodeWeights(weights: Weights): string {
  return METRIC_KEYS.map((k) => `${k}${clampWeight(weights[k])}`).join('-')
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 0
  const v = Math.round(n)
  if (v < 0) return 0
  if (v > 99) return 99
  return v
}
