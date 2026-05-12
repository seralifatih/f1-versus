import type { DriverStats, MetricKey } from '@/lib/f1db/types'
import { METRIC_KEYS, METRIC_LABELS } from './constants'
import type { ScoredDriver, Weights } from './types'

/**
 * Weighted average of the driver's 0-100 metric values, rounded to 1 decimal.
 * If every weight is 0, returns 0 (no division by zero, no NaN).
 */
export function score(metrics: DriverStats['metrics'], weights: Weights): number {
  let total = 0
  let sum = 0
  for (const key of METRIC_KEYS) {
    const w = weights[key]
    total += w
    sum += metrics[key] * w
  }
  if (total === 0) return 0
  return Math.round((sum / total) * 10) / 10
}

/**
 * Scores every driver, sorts by score descending, attaches a "why" string
 * to the top 5. Returns the full list — the caller decides how many to render.
 */
export function rank(drivers: DriverStats[], weights: Weights): ScoredDriver[] {
  const scored: ScoredDriver[] = drivers.map((d) => ({
    ...d,
    score: score(d.metrics, weights),
    why: '',
  }))

  scored.sort((a, b) => b.score - a.score)

  const TOP_N = 5
  for (let i = 0; i < Math.min(TOP_N, scored.length); i++) {
    const entry = scored[i]
    if (entry) entry.why = buildWhy(entry.metrics, weights)
  }
  return scored
}

/**
 * Picks the 1-2 metrics where the user's weight is high AND this driver's
 * own value is high — i.e. what's actually pushing them up the ranking.
 * Falls back to a generic note if nothing stands out.
 */
function buildWhy(metrics: DriverStats['metrics'], weights: Weights): string {
  type Contribution = { key: MetricKey; product: number }
  const contribs: Contribution[] = METRIC_KEYS.map((key) => ({
    key,
    product: metrics[key] * weights[key],
  })).filter((c) => c.product > 0)

  if (contribs.length === 0) return 'balanced across the metrics that count'

  contribs.sort((a, b) => b.product - a.product)
  const topTwo = contribs.slice(0, 2).map((c) => METRIC_LABELS[c.key].toLowerCase())

  if (topTwo.length === 1) return `dominates ${topTwo[0]}`
  return `dominates ${topTwo[0]} and ${topTwo[1]}`
}
