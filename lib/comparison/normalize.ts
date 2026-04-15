/**
 * Normalization helpers for radar chart metrics.
 *
 * Two normalization paths:
 *
 * 1. Global-distribution path (preferred)
 *    When `distributions` (Map<metric_name, MetricDistribution>) is supplied,
 *    each raw value is mapped through piecewise interpolation anchored at
 *    global p10/p50/p90/max percentiles.  Hamilton's win rate reads ~9/10;
 *    a rookie's reads ~1/10.  Percentile labels ("Top 3%") are also emitted.
 *
 * 2. Hardcoded-benchmark fallback
 *    Used when distributions are unavailable (first run, filtered comparisons
 *    that bypass the precompute pipeline, local dev without DB).
 *    Uses historical career-level min/max ranges for a simple 0–10 linear map.
 */

import type { DriverStats, RadarMetric, MetricDistribution } from "../data/types";
import {
  interpolateScore,
  percentileLabel,
  METRIC_DISTRIBUTION_KEYS,
} from "./distributions";

// ─── Hardcoded benchmarks (fallback) ──────────────────────────────────────

const BENCHMARKS = {
  winRate:             { min: 0,  max: 0.45 },
  poleRate:            { min: 0,  max: 0.40 },
  podiumRate:          { min: 0,  max: 0.65 },
  dnfRate:             { min: 0,  max: 0.35 },
  pointsPerRace:       { min: 0,  max: 20   },
  avgFinish:           { min: 1,  max: 20   },
  consistencyScore:    { min: 0,  max: 1    },
  avgPositionsGained:  { min: -5, max: 8    },
};

// ─── Shared helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMetric(
  value: number,
  min: number,
  max: number,
  higherIsBetter = true
): number {
  if (max === min) return 5;
  const clamped = clamp(value, min, max);
  const normalized = ((clamped - min) / (max - min)) * 10;
  return higherIsBetter ? normalized : 10 - normalized;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ─── Distribution-based normalization helpers ──────────────────────────────

/**
 * Normalize one raw value using a global distribution, returning both the
 * 0–10 score and a human-readable percentile label.
 *
 * `rawForDist` is the value already expressed as higher=better
 * (callers invert dnfRate / avgFinish before passing in).
 */
function scoreFromDist(
  rawForDist: number,
  dist: MetricDistribution
): { score: number; label: string } {
  return {
    score: round1(interpolateScore(rawForDist, dist)),
    label: percentileLabel(rawForDist, dist),
  };
}

// ─── Main entry point ──────────────────────────────────────────────────────

/**
 * Build the full set of radar metrics from two DriverStats objects.
 *
 * @param statsA        - Career stats for driver A
 * @param statsB        - Career stats for driver B
 * @param distributions - Global percentile distributions (optional).
 *                        When present, scores are globally anchored and
 *                        percentile labels are emitted on each metric.
 *                        When absent, falls back to hardcoded benchmarks.
 */
export function buildRadarMetrics(
  statsA: DriverStats,
  statsB: DriverStats,
  distributions?: Map<string, MetricDistribution>
): RadarMetric[] {
  const safe = (n: number): number => (isFinite(n) ? n : 0);

  const winRateA     = safe(statsA.totalRaces > 0 ? statsA.wins    / statsA.totalRaces : 0);
  const winRateB     = safe(statsB.totalRaces > 0 ? statsB.wins    / statsB.totalRaces : 0);
  const poleRateA    = safe(statsA.totalRaces > 0 ? statsA.poles   / statsA.totalRaces : 0);
  const poleRateB    = safe(statsB.totalRaces > 0 ? statsB.poles   / statsB.totalRaces : 0);
  const podiumRateA  = safe(statsA.totalRaces > 0 ? statsA.podiums / statsA.totalRaces : 0);
  const podiumRateB  = safe(statsB.totalRaces > 0 ? statsB.podiums / statsB.totalRaces : 0);
  const dnfRateA     = safe(statsA.totalRaces > 0 ? statsA.dnfs    / statsA.totalRaces : 0);
  const dnfRateB     = safe(statsB.totalRaces > 0 ? statsB.dnfs    / statsB.totalRaces : 0);

  // reliability is stored in distributions as (1 - dnfRate) so higher = better
  const reliabilityA = safe(1 - dnfRateA);
  const reliabilityB = safe(1 - dnfRateB);

  // avgFinish is stored in distributions as (21 - avgFinish) so higher = better
  const avgFinishInvA = safe(21 - statsA.avgFinishPosition);
  const avgFinishInvB = safe(21 - statsB.avgFinishPosition);

  const useDist = distributions && distributions.size > 0;

  /**
   * Resolve a score + optional percentile for one raw value.
   * `metricKey` must match a key in METRIC_DISTRIBUTION_KEYS.
   * `fallbackFn` is called when distributions are unavailable.
   */
  function resolve(
    metricKey: string,
    rawA: number,
    rawB: number,
    fallbackFn: () => { scoreA: number; scoreB: number }
  ): { scoreA: number; scoreB: number; labelA?: string; labelB?: string } {
    if (useDist) {
      const distKey = METRIC_DISTRIBUTION_KEYS[metricKey]?.distributionKey ?? metricKey;
      const dist = distributions!.get(distKey);
      if (dist) {
        const a = scoreFromDist(rawA, dist);
        const b = scoreFromDist(rawB, dist);
        return { scoreA: a.score, scoreB: b.score, labelA: a.label, labelB: b.label };
      }
    }
    return fallbackFn();
  }

  const winRate     = resolve("winRate", winRateA, winRateB, () => ({
    scoreA: round1(normalizeMetric(winRateA, BENCHMARKS.winRate.min, BENCHMARKS.winRate.max)),
    scoreB: round1(normalizeMetric(winRateB, BENCHMARKS.winRate.min, BENCHMARKS.winRate.max)),
  }));
  const poleRate    = resolve("poleRate", poleRateA, poleRateB, () => ({
    scoreA: round1(normalizeMetric(poleRateA, BENCHMARKS.poleRate.min, BENCHMARKS.poleRate.max)),
    scoreB: round1(normalizeMetric(poleRateB, BENCHMARKS.poleRate.min, BENCHMARKS.poleRate.max)),
  }));
  const podiumRate  = resolve("podiumRate", podiumRateA, podiumRateB, () => ({
    scoreA: round1(normalizeMetric(podiumRateA, BENCHMARKS.podiumRate.min, BENCHMARKS.podiumRate.max)),
    scoreB: round1(normalizeMetric(podiumRateB, BENCHMARKS.podiumRate.min, BENCHMARKS.podiumRate.max)),
  }));
  const reliability = resolve("reliability", reliabilityA, reliabilityB, () => ({
    scoreA: round1(normalizeMetric(dnfRateA, BENCHMARKS.dnfRate.min, BENCHMARKS.dnfRate.max, false)),
    scoreB: round1(normalizeMetric(dnfRateB, BENCHMARKS.dnfRate.min, BENCHMARKS.dnfRate.max, false)),
  }));
  const pointsPR    = resolve("pointsPerRace", safe(statsA.pointsPerRace), safe(statsB.pointsPerRace), () => ({
    scoreA: round1(normalizeMetric(safe(statsA.pointsPerRace), BENCHMARKS.pointsPerRace.min, BENCHMARKS.pointsPerRace.max)),
    scoreB: round1(normalizeMetric(safe(statsB.pointsPerRace), BENCHMARKS.pointsPerRace.min, BENCHMARKS.pointsPerRace.max)),
  }));
  const consistency = resolve("consistency", safe(statsA.consistencyScore), safe(statsB.consistencyScore), () => ({
    scoreA: round1(normalizeMetric(safe(statsA.consistencyScore), BENCHMARKS.consistencyScore.min, BENCHMARKS.consistencyScore.max)),
    scoreB: round1(normalizeMetric(safe(statsB.consistencyScore), BENCHMARKS.consistencyScore.min, BENCHMARKS.consistencyScore.max)),
  }));
  const avgFinish   = resolve("avgFinish", avgFinishInvA, avgFinishInvB, () => ({
    scoreA: round1(normalizeMetric(safe(statsA.avgFinishPosition), BENCHMARKS.avgFinish.min, BENCHMARKS.avgFinish.max, false)),
    scoreB: round1(normalizeMetric(safe(statsB.avgFinishPosition), BENCHMARKS.avgFinish.min, BENCHMARKS.avgFinish.max, false)),
  }));
  const posGained   = resolve("positionsGained", safe(statsA.avgPositionsGained), safe(statsB.avgPositionsGained), () => ({
    scoreA: round1(normalizeMetric(safe(statsA.avgPositionsGained), BENCHMARKS.avgPositionsGained.min, BENCHMARKS.avgPositionsGained.max)),
    scoreB: round1(normalizeMetric(safe(statsB.avgPositionsGained), BENCHMARKS.avgPositionsGained.min, BENCHMARKS.avgPositionsGained.max)),
  }));

  return [
    {
      metric: "winRate",
      label: "Win Rate",
      driverA: winRate.scoreA,
      driverB: winRate.scoreB,
      higherIsBetter: true,
      percentileA: winRate.labelA,
      percentileB: winRate.labelB,
    },
    {
      metric: "poleRate",
      label: "Pole Rate",
      driverA: poleRate.scoreA,
      driverB: poleRate.scoreB,
      higherIsBetter: true,
      percentileA: poleRate.labelA,
      percentileB: poleRate.labelB,
    },
    {
      metric: "podiumRate",
      label: "Podium Rate",
      driverA: podiumRate.scoreA,
      driverB: podiumRate.scoreB,
      higherIsBetter: true,
      percentileA: podiumRate.labelA,
      percentileB: podiumRate.labelB,
    },
    {
      metric: "reliability",
      label: "Reliability",
      driverA: reliability.scoreA,
      driverB: reliability.scoreB,
      higherIsBetter: false,
      percentileA: reliability.labelA,
      percentileB: reliability.labelB,
    },
    {
      metric: "pointsPerRace",
      label: "Points/Race",
      driverA: pointsPR.scoreA,
      driverB: pointsPR.scoreB,
      higherIsBetter: true,
      percentileA: pointsPR.labelA,
      percentileB: pointsPR.labelB,
    },
    {
      metric: "consistency",
      label: "Consistency",
      driverA: consistency.scoreA,
      driverB: consistency.scoreB,
      higherIsBetter: true,
      percentileA: consistency.labelA,
      percentileB: consistency.labelB,
    },
    {
      metric: "avgFinish",
      label: "Avg. Finish",
      driverA: avgFinish.scoreA,
      driverB: avgFinish.scoreB,
      higherIsBetter: false,
      percentileA: avgFinish.labelA,
      percentileB: avgFinish.labelB,
    },
    {
      metric: "positionsGained",
      label: "Grid→Finish",
      driverA: posGained.scoreA,
      driverB: posGained.scoreB,
      higherIsBetter: true,
      percentileA: posGained.labelA,
      percentileB: posGained.labelB,
    },
  ];
}

/**
 * Compute a single composite "overall" score from radar metrics.
 */
export function computeOverallScore(metrics: RadarMetric[], useDriverA: boolean): number {
  const weights: Record<string, number> = {
    winRate:          2.5,
    poleRate:         1.5,
    podiumRate:       1.5,
    reliability:      1.0,
    pointsPerRace:    2.0,
    consistency:      1.5,
    avgFinish:        1.5,
    positionsGained:  1.0,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of metrics) {
    const w = weights[m.metric] ?? 1;
    weightedSum += (useDriverA ? m.driverA : m.driverB) * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 0;
  return round1(weightedSum / totalWeight);
}
