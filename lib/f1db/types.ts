export type EraId = 'all' | 'golden' | 'turbo' | 'modern'

export const ERA_IDS: readonly EraId[] = ['all', 'golden', 'turbo', 'modern']

export function isEraId(value: string): value is EraId {
  return (ERA_IDS as readonly string[]).includes(value)
}

export type MetricKey = 'c' | 'w' | 'p' | 'q' | 'f' | 'r' | 'h' | 'l' | 'd'

export type Metrics = Record<MetricKey, number>

export type DriverStats = {
  driverId: string
  name: string
  countryCode: string | null
  firstYear: number
  lastYear: number
  metrics: Metrics
}
