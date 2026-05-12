import type { DriverStats, MetricKey } from '@/lib/f1db/types'

export type { MetricKey }

export type Weights = Record<MetricKey, number>

export type Formula = {
  id: string
  label: string
  blurb: string
  weights: Weights
}

export type ScoredDriver = DriverStats & {
  score: number
  why: string
}
