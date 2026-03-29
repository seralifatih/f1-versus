/**
 * Normalization helpers for radar chart metrics.
 *
 * All metrics are scaled to 0–10 using min-max normalization
 * relative to historical F1 benchmarks (career-level stats).
 */

import type { DriverStats, RadarMetric } from "../data/types";

// ─── Historical Benchmarks ─────────────────────────────────────────────────
// These represent approximate career-level ranges across all F1 drivers.
// Used to normalize stats into the 0–10 radar scale.

const BENCHMARKS = {
  winRate: { min: 0, max: 0.45 },          // 0% – 45% of races
  poleRate: { min: 0, max: 0.40 },
  podiumRate: { min: 0, max: 0.65 },
  dnfRate: { min: 0, max: 0.35 },          // lower is better
  pointsPerRace: { min: 0, max: 20 },      // post-2010 scale, max ~18.5
  avgFinish: { min: 1, max: 20 },          // lower finish pos = better → invert
  consistencyScore: { min: 0, max: 1 },    // 0–100%
  avgPositionsGained: { min: -5, max: 8 }, // positions gained (can be negative)
};

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Min-max normalize a value into the 0–10 scale.
 * If higherIsBetter is false, the scale is inverted.
 */
export function normalizeMetric(
  value: number,
  min: number,
  max: number,
  higherIsBetter = true
): number {
  if (max === min) return 5; // avoid division by zero
  const clamped = clamp(value, min, max);
  const normalized = ((clamped - min) / (max - min)) * 10;
  return higherIsBetter ? normalized : 10 - normalized;
}

/**
 * Round to one decimal place.
 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Build the full set of radar metrics from two DriverStats objects.
 * Returns an array of RadarMetric with values normalized 0–10.
 */
export function buildRadarMetrics(
  statsA: DriverStats,
  statsB: DriverStats
): RadarMetric[] {
  const safe = (n: number): number => (isFinite(n) ? n : 0);

  const winRateA = safe(statsA.totalRaces > 0 ? statsA.wins / statsA.totalRaces : 0);
  const winRateB = safe(statsB.totalRaces > 0 ? statsB.wins / statsB.totalRaces : 0);
  const poleRateA = safe(statsA.totalRaces > 0 ? statsA.poles / statsA.totalRaces : 0);
  const poleRateB = safe(statsB.totalRaces > 0 ? statsB.poles / statsB.totalRaces : 0);
  const podiumRateA = safe(statsA.totalRaces > 0 ? statsA.podiums / statsA.totalRaces : 0);
  const podiumRateB = safe(statsB.totalRaces > 0 ? statsB.podiums / statsB.totalRaces : 0);
  const dnfRateA = safe(statsA.totalRaces > 0 ? statsA.dnfs / statsA.totalRaces : 0);
  const dnfRateB = safe(statsB.totalRaces > 0 ? statsB.dnfs / statsB.totalRaces : 0);

  return [
    {
      metric: "winRate",
      label: "Win Rate",
      driverA: round1(
        normalizeMetric(winRateA, BENCHMARKS.winRate.min, BENCHMARKS.winRate.max)
      ),
      driverB: round1(
        normalizeMetric(winRateB, BENCHMARKS.winRate.min, BENCHMARKS.winRate.max)
      ),
      higherIsBetter: true,
    },
    {
      metric: "poleRate",
      label: "Pole Rate",
      driverA: round1(
        normalizeMetric(poleRateA, BENCHMARKS.poleRate.min, BENCHMARKS.poleRate.max)
      ),
      driverB: round1(
        normalizeMetric(poleRateB, BENCHMARKS.poleRate.min, BENCHMARKS.poleRate.max)
      ),
      higherIsBetter: true,
    },
    {
      metric: "podiumRate",
      label: "Podium Rate",
      driverA: round1(
        normalizeMetric(podiumRateA, BENCHMARKS.podiumRate.min, BENCHMARKS.podiumRate.max)
      ),
      driverB: round1(
        normalizeMetric(podiumRateB, BENCHMARKS.podiumRate.min, BENCHMARKS.podiumRate.max)
      ),
      higherIsBetter: true,
    },
    {
      metric: "reliability",
      label: "Reliability",
      driverA: round1(
        normalizeMetric(dnfRateA, BENCHMARKS.dnfRate.min, BENCHMARKS.dnfRate.max, false)
      ),
      driverB: round1(
        normalizeMetric(dnfRateB, BENCHMARKS.dnfRate.min, BENCHMARKS.dnfRate.max, false)
      ),
      higherIsBetter: false, // lower DNF rate is better (but display is already inverted)
    },
    {
      metric: "pointsPerRace",
      label: "Points/Race",
      driverA: round1(
        normalizeMetric(
          safe(statsA.pointsPerRace),
          BENCHMARKS.pointsPerRace.min,
          BENCHMARKS.pointsPerRace.max
        )
      ),
      driverB: round1(
        normalizeMetric(
          safe(statsB.pointsPerRace),
          BENCHMARKS.pointsPerRace.min,
          BENCHMARKS.pointsPerRace.max
        )
      ),
      higherIsBetter: true,
    },
    {
      metric: "consistency",
      label: "Consistency",
      driverA: round1(
        normalizeMetric(
          safe(statsA.consistencyScore),
          BENCHMARKS.consistencyScore.min,
          BENCHMARKS.consistencyScore.max
        )
      ),
      driverB: round1(
        normalizeMetric(
          safe(statsB.consistencyScore),
          BENCHMARKS.consistencyScore.min,
          BENCHMARKS.consistencyScore.max
        )
      ),
      higherIsBetter: true,
    },
    {
      metric: "avgFinish",
      label: "Avg. Finish",
      driverA: round1(
        normalizeMetric(
          safe(statsA.avgFinishPosition),
          BENCHMARKS.avgFinish.min,
          BENCHMARKS.avgFinish.max,
          false // lower position number = better
        )
      ),
      driverB: round1(
        normalizeMetric(
          safe(statsB.avgFinishPosition),
          BENCHMARKS.avgFinish.min,
          BENCHMARKS.avgFinish.max,
          false
        )
      ),
      higherIsBetter: false,
    },
    {
      metric: "positionsGained",
      label: "Grid->Finish",
      driverA: round1(
        normalizeMetric(
          safe(statsA.avgPositionsGained),
          BENCHMARKS.avgPositionsGained.min,
          BENCHMARKS.avgPositionsGained.max
        )
      ),
      driverB: round1(
        normalizeMetric(
          safe(statsB.avgPositionsGained),
          BENCHMARKS.avgPositionsGained.min,
          BENCHMARKS.avgPositionsGained.max
        )
      ),
      higherIsBetter: true,
    },
  ];
}

/**
 * Compute a single composite "overall" score from radar metrics.
 * Weights can be tuned; wins and consistency matter most.
 */
export function computeOverallScore(metrics: RadarMetric[], useDriverA: boolean): number {
  const weights: Record<string, number> = {
    winRate: 2.5,
    poleRate: 1.5,
    podiumRate: 1.5,
    reliability: 1.0,
    pointsPerRace: 2.0,
    consistency: 1.5,
    avgFinish: 1.5,
    positionsGained: 1.0,
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
