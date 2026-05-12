import type { Formula } from './types'

// Verbatim from prototype/f1-goat-v1.jsx. Do not touch weights — these are
// tuned by hand. Reorder only if the prototype is reordered.
export const PRESETS: readonly Formula[] = [
  {
    // id intentionally stays 'era-adjusted' so old shared URLs still resolve;
    // only the user-visible label changed to remove the misleading "Adjusted"
    // wording (we don't actually rank eras against each other).
    id: 'era-adjusted',
    label: 'Era Normalized',
    blurb:
      'Normalized for season length and grid size within each era. Doesn’t try to rank eras against each other.',
    weights: { c: 25, w: 15, p: 10, q: 10, f: 5, r: 10, h: 15, l: 5, d: 5 },
  },
  {
    id: 'stats-geek',
    label: 'Stats Geek',
    blurb: "Raw career totals. No era adjustment. Numbers don't lie.",
    weights: { c: 30, w: 25, p: 15, q: 10, f: 5, r: 5, h: 5, l: 5, d: 0 },
  },
  {
    id: 'peak',
    label: 'Peak Performance',
    blurb: 'Best 3 consecutive seasons. Brief brilliance over longevity.',
    weights: { c: 15, w: 10, p: 5, q: 5, f: 5, r: 15, h: 10, l: 0, d: 35 },
  },
  {
    id: 'longevity',
    label: 'Longevity',
    blurb: 'Sustained excellence across decades. Stamina matters.',
    weights: { c: 20, w: 15, p: 10, q: 5, f: 5, r: 15, h: 5, l: 20, d: 5 },
  },
  {
    id: 'teammate-slayer',
    label: 'Teammate Slayer',
    blurb: 'How well you beat the only direct comparison: your teammate.',
    weights: { c: 10, w: 10, p: 5, q: 10, f: 5, r: 5, h: 45, l: 5, d: 5 },
  },
  {
    id: 'pure-speed',
    label: 'Pure Speed',
    blurb: 'Poles and fastest laps. One-lap pace over Sunday craft.',
    weights: { c: 10, w: 10, p: 5, q: 25, f: 20, r: 10, h: 15, l: 0, d: 5 },
  },
]

export const DEFAULT_PRESET_ID = 'era-adjusted'

export function getPreset(id: string): Formula | null {
  return PRESETS.find((p) => p.id === id) ?? null
}
