// Iconic race numbers, hand-picked. Goal isn't 100% historical accuracy —
// it's that an F1 fan glancing at the row reads "yes, that's the right
// number". Where a driver has multiple plausible numbers (Schumacher's
// Benetton #5 vs Ferrari champion years), pick the one most associated
// with their identity.
//
// Drivers NOT in this map render their initials (e.g. "JF" for Fangio).
// That's preferred over assigning made-up numbers to pre-permanent-number
// era drivers.
export const RACE_NUMBERS: Record<string, string> = {
  // ── 2014+ permanent-number era ──────────────────────────────────────
  'lewis-hamilton': '44',
  'max-verstappen': '1',
  'fernando-alonso': '14',
  'sebastian-vettel': '5',
  'kimi-raikkonen': '7',
  'valtteri-bottas': '77',
  'sergio-perez': '11',
  'daniel-ricciardo': '3',
  'carlos-sainz-jr': '55',
  'charles-leclerc': '16',
  'lando-norris': '4',
  'george-russell': '63',
  'oscar-piastri': '81',
  'pierre-gasly': '10',
  'esteban-ocon': '31',
  'lance-stroll': '18',
  'yuki-tsunoda': '22',
  'kevin-magnussen': '20',
  'nico-hulkenberg': '27',
  'alexander-albon': '23',
  'zhou-guanyu': '24',
  'nico-rosberg': '6',

  // ── Pre-2014, iconic championship-era numbers ───────────────────────
  // Schumacher's Ferrari title years are more iconic than his Benetton #5.
  'michael-schumacher': '1',
  'ayrton-senna': '12', // McLaren era
  'alain-prost': '2', // McLaren era
  'nigel-mansell': '5', // Williams 1992 — championship year
  'niki-lauda': '1', // Ferrari/McLaren champion
  'nelson-piquet': '1', // Brabham champion
  'jackie-stewart': '5', // Tyrrell champion
  'mika-hakkinen': '1', // McLaren champion
  'damon-hill': '5', // Williams 1996 — championship year
  'jenson-button': '22', // 2009 championship + permanent-era pick
  'jacques-villeneuve': '3', // Williams 1997 — championship year
  'gilles-villeneuve': '27', // Ferrari, indelible #27 association
}

export function raceNumberFor(driverId: string): string | null {
  return RACE_NUMBERS[driverId] ?? null
}

// Two-letter initials from a driver's display name. Skips Jr/Sr suffixes
// and Roman ordinals. Used as the fallback inside RaceNumberBox when the
// driver isn't in RACE_NUMBERS.
export function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((p) => p && !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p))
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts[parts.length - 1]?.[0] ?? first
  return (first + last).toUpperCase()
}
