import type { Formula } from '@/lib/scoring/types'
import type { EraId } from '@/lib/f1db/types'
import { encodeFormula } from './encode'

// Next 15 made searchParams (and params) a Promise. Pages must `await` it
// before passing to toUrlSearchParams.
export type NextSearchParams = Promise<Record<string, string | string[] | undefined>>

export function toUrlSearchParams(sp: Awaited<NextSearchParams>): URLSearchParams {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') out.set(k, v)
    else if (Array.isArray(v) && v.length > 0 && v[0] !== undefined) out.set(k, v[0])
  }
  return out
}

export function ogImageUrl(
  kind: 'ranking' | 'battle' | 'driver',
  formula: Formula,
  era: EraId,
  extra: Record<string, string> = {},
): string {
  const params = encodeFormula(formula, era)
  params.set('type', kind)
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  return `/api/og?${params.toString()}`
}
