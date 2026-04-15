/**
 * Global metric distributions for radar normalization.
 *
 * The metric_distributions table is populated by compute-comparisons.ts after
 * each full run. It stores p10/p50/p90/max for each raw metric across all
 * drivers with ≥20 race starts. These are used to place a driver's value on
 * the global F1 population curve rather than only relative to their opponent.
 *
 * Normalization contract
 * ──────────────────────
 * Raw value → 0–10 score via piecewise linear interpolation:
 *
 *   ≤ p10  →  0–2   (bottom 10 % of the field)
 *   p10–p50 → 2–5   (below median)
 *   p50–p90 → 5–8   (above median)
 *   p90–max → 8–10  (elite tier)
 *   > max   → 10    (clamp)
 *
 * For "lower is better" metrics (avgFinish, dnfRate) the raw value is first
 * inverted relative to a known ceiling before interpolation — see
 * `normalizeWithDistribution`.
 */

import type { MetricDistribution } from "../data/types";
import { createServiceRoleClient } from "../supabase/client";

// ─── Piecewise interpolation ───────────────────────────────────────────────

/**
 * Linear interpolation between two points.
 */
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Map a raw metric value to a 0–10 score using four-segment piecewise
 * interpolation anchored at p10, p50, p90, and max.
 *
 * @param raw          - The raw metric value (always expressed as higher=better)
 * @param dist         - Distribution percentiles for this metric
 * @returns            0–10 score (one decimal, clamped)
 */
export function interpolateScore(raw: number, dist: MetricDistribution): number {
  const { p10, p50, p90, max } = dist;

  let score: number;

  if (raw <= p10) {
    // 0 → 2 segment (clamp at 0 for values below the min of the training set)
    score = lerp(raw, 0, p10, 0, 2);
  } else if (raw <= p50) {
    score = lerp(raw, p10, p50, 2, 5);
  } else if (raw <= p90) {
    score = lerp(raw, p50, p90, 5, 8);
  } else {
    score = lerp(raw, p90, max, 8, 10);
  }

  return Math.min(10, Math.max(0, score));
}

/**
 * Compute the all-time percentile rank of a raw value within the distribution.
 * Returns a human-readable label like "Top 3%" or "Top 50%".
 *
 * Uses a log-linear model anchored at the four known percentile points:
 * p10 = 10th percentile, p50 = 50th, p90 = 90th.
 *
 * @param raw   - Raw metric value (higher=better after any inversion)
 * @param dist  - Distribution for this metric
 */
export function percentileLabel(raw: number, dist: MetricDistribution): string {
  const { p10, p50, p90 } = dist;

  let pct: number; // estimated percentile rank (0–100, higher = better driver)

  if (raw <= p10) {
    // 0th – 10th percentile region
    pct = lerp(raw, 0, p10, 0, 10);
  } else if (raw <= p50) {
    pct = lerp(raw, p10, p50, 10, 50);
  } else if (raw <= p90) {
    pct = lerp(raw, p50, p90, 50, 90);
  } else {
    pct = lerp(raw, p90, dist.max, 90, 100);
  }

  pct = Math.min(100, Math.max(0, pct));

  // "Top N%" = complement: a driver at the 90th percentile is "Top 10%"
  const topPct = Math.max(1, Math.round(100 - pct));
  return `Top ${topPct}%`;
}

// ─── DB fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch all rows from metric_distributions and return as a Map keyed by
 * metric_name. Returns an empty Map if the table doesn't exist yet or is empty.
 */
export async function fetchMetricDistributions(): Promise<Map<string, MetricDistribution>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("metric_distributions")
      .select("metric_name, p10, p50, p90, max");

    if (error || !data || data.length === 0) return new Map();

    const map = new Map<string, MetricDistribution>();
    for (const row of data as MetricDistribution[]) {
      map.set(row.metric_name, row);
    }
    return map;
  } catch {
    // Table may not exist yet on first run; fall back gracefully
    return new Map();
  }
}

// ─── Percentile utility for each radar metric ──────────────────────────────

/**
 * The radar metric keys and how their raw values map to the distributions table.
 *
 * For "lower is better" metrics the raw value needs to be inverted against
 * a known ceiling before looking up the distribution (which stores higher=better
 * percentiles). We store the inverted form in the distributions table.
 */
export const METRIC_DISTRIBUTION_KEYS: Record<
  string,
  { distributionKey: string; higherIsBetter: boolean }
> = {
  winRate:          { distributionKey: "winRate",          higherIsBetter: true  },
  poleRate:         { distributionKey: "poleRate",         higherIsBetter: true  },
  podiumRate:       { distributionKey: "podiumRate",       higherIsBetter: true  },
  reliability:      { distributionKey: "reliability",      higherIsBetter: true  }, // stored as (1 - dnfRate)
  pointsPerRace:    { distributionKey: "pointsPerRace",    higherIsBetter: true  },
  consistency:      { distributionKey: "consistencyScore", higherIsBetter: true  },
  avgFinish:        { distributionKey: "avgFinishInverted", higherIsBetter: true }, // stored as (21 - avgFinish)
  positionsGained:  { distributionKey: "avgPositionsGained", higherIsBetter: true },
};
