import { describe, expect, it } from 'vitest'
import type { DriverStats } from '@/lib/f1db/types'
import type { Weights } from './types'
import { rank, score } from './engine'

function driver(driverId: string, metrics: DriverStats['metrics']): DriverStats {
  return {
    driverId,
    name: driverId,
    countryCode: 'XX',
    firstYear: 2000,
    lastYear: 2010,
    metrics,
  }
}

const ZERO_METRICS: DriverStats['metrics'] = {
  c: 0,
  w: 0,
  p: 0,
  q: 0,
  f: 0,
  r: 0,
  h: 0,
  l: 0,
  d: 0,
}

const EQUAL_WEIGHTS: Weights = { c: 1, w: 1, p: 1, q: 1, f: 1, r: 1, h: 1, l: 1, d: 1 }
const ZERO_WEIGHTS: Weights = { c: 0, w: 0, p: 0, q: 0, f: 0, r: 0, h: 0, l: 0, d: 0 }

describe('score()', () => {
  it('returns 0 when all weights are zero', () => {
    expect(score({ ...ZERO_METRICS, c: 100, w: 100 }, ZERO_WEIGHTS)).toBe(0)
  })

  it('is pure: same inputs always produce same output', () => {
    const m = { ...ZERO_METRICS, c: 80, w: 60, d: 40 }
    const w: Weights = { ...ZERO_WEIGHTS, c: 10, w: 5, d: 2 }
    const first = score(m, w)
    const second = score(m, w)
    const third = score({ ...m }, { ...w })
    expect(first).toBe(second)
    expect(first).toBe(third)
  })

  it('rounds to 1 decimal place', () => {
    // (33 * 1 + 33 * 1 + 34 * 1) / 3 = 33.333... -> 33.3
    const m: DriverStats['metrics'] = { ...ZERO_METRICS, c: 33, w: 33, p: 34 }
    const w: Weights = { ...ZERO_WEIGHTS, c: 1, w: 1, p: 1 }
    expect(score(m, w)).toBe(33.3)
  })

  it('returns the metric value when only one weight is non-zero', () => {
    const m: DriverStats['metrics'] = { ...ZERO_METRICS, c: 73 }
    const w: Weights = { ...ZERO_WEIGHTS, c: 99 }
    expect(score(m, w)).toBe(73)
  })
})

describe('rank()', () => {
  const drivers: DriverStats[] = [
    driver('alice', { ...ZERO_METRICS, c: 90, w: 50, p: 10 }),
    driver('bob', { ...ZERO_METRICS, c: 10, w: 90, p: 50 }),
    driver('carol', { ...ZERO_METRICS, c: 50, w: 10, p: 90 }),
  ]

  it('produces sane ordering with equal weights', () => {
    // Equal weights → equal averages (all (90+50+10)/9, (10+90+50)/9, etc.).
    // All three drivers happen to sum to 150 across c/w/p with the same
    // zeros elsewhere, so they tie. Add asymmetry to make it a real test.
    const asymmetric: DriverStats[] = [
      driver('top', { ...ZERO_METRICS, c: 80, w: 80, p: 80 }),
      driver('mid', { ...ZERO_METRICS, c: 50, w: 50, p: 50 }),
      driver('bot', { ...ZERO_METRICS, c: 10, w: 10, p: 10 }),
    ]
    const result = rank(asymmetric, EQUAL_WEIGHTS)
    expect(result.map((r) => r.driverId)).toEqual(['top', 'mid', 'bot'])
  })

  it('returns 0 score for every driver when all weights are zero', () => {
    const result = rank(drivers, ZERO_WEIGHTS)
    expect(result).toHaveLength(drivers.length)
    for (const r of result) expect(r.score).toBe(0)
  })

  it('ranks by a single metric when only that metric is weighted', () => {
    const wOnly: Weights = { ...ZERO_WEIGHTS, w: 10 }
    const byWins = rank(drivers, wOnly).map((r) => r.driverId)
    expect(byWins).toEqual(['bob', 'alice', 'carol'])

    const cOnly: Weights = { ...ZERO_WEIGHTS, c: 10 }
    const byChamps = rank(drivers, cOnly).map((r) => r.driverId)
    expect(byChamps).toEqual(['alice', 'carol', 'bob'])

    const pOnly: Weights = { ...ZERO_WEIGHTS, p: 10 }
    const byPodiums = rank(drivers, pOnly).map((r) => r.driverId)
    expect(byPodiums).toEqual(['carol', 'bob', 'alice'])
  })

  it('attaches a "why" string for the top 5 only', () => {
    const many: DriverStats[] = Array.from({ length: 10 }, (_, i) =>
      driver(`d${i}`, { ...ZERO_METRICS, c: 100 - i * 10 }),
    )
    const result = rank(many, { ...ZERO_WEIGHTS, c: 10 })
    for (let i = 0; i < 5; i++) expect(result[i]?.why).not.toBe('')
    for (let i = 5; i < result.length; i++) expect(result[i]?.why).toBe('')
  })

  it('"why" names the metric that actually drives the score', () => {
    const drv = driver('hero', { ...ZERO_METRICS, c: 95, l: 95 })
    const w: Weights = { ...ZERO_WEIGHTS, c: 30, l: 5 }
    const [top] = rank([drv], w)
    expect(top?.why.toLowerCase()).toContain('championships')
  })
})
