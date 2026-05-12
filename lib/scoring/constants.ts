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
