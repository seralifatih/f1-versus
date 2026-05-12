import type { MetricKey } from './types'

export const METRIC_LABELS: Record<MetricKey, string> = {
  c: 'Championships',
  w: 'Wins',
  p: 'Podiums',
  q: 'Poles',
  f: 'Fastest Laps',
  r: 'Win Rate',
  h: 'Teammate H2H',
  l: 'Longevity',
  d: 'Peak Dominance',
}

// Hover-tooltip copy. Kept short — one sentence each. Read the methodology
// page for the full explanation of each metric.
export const METRIC_TOOLTIPS: Record<MetricKey, string> = {
  c: 'Year-end World Championship titles.',
  w: 'Grand Prix race victories. Sprint races excluded.',
  p: 'Top-3 race finishes.',
  q: 'Pole positions — finishing first in qualifying.',
  f: 'Races where the driver set the fastest lap.',
  r: 'Wins divided by races started. Corrects for career length.',
  h: 'Average teammate beat rate in races and qualifying. The fairest like-for-like comparison F1 offers.',
  l: 'Career length in seasons.',
  d: "Sum of championship points share across the driver's best 3 consecutive seasons.",
}

export const METRIC_KEYS: readonly MetricKey[] = [
  'c',
  'w',
  'p',
  'q',
  'f',
  'r',
  'h',
  'l',
  'd',
]
