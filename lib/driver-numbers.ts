// Hand-picked race numbers for well-known modern drivers. F1DB has number
// data only intermittently and per-season — this small lookup keeps the
// ranking row visually anchored without a schema change. For pre-modern
// drivers (no fixed number era) RaceNumberBox falls back to initials.
const NUMBERS: Record<string, string> = {
  'lewis-hamilton': '44',
  'max-verstappen': '1',
  'michael-schumacher': '5',
  'ayrton-senna': '12',
  'alain-prost': '2',
  'sebastian-vettel': '5',
  'fernando-alonso': '14',
  'nico-rosberg': '6',
  'kimi-raikkonen': '7',
  'jenson-button': '22',
  'mark-webber': '2',
  'felipe-massa': '19',
  'rubens-barrichello': '11',
  'david-coulthard': '14',
  'mika-hakkinen': '1',
  'damon-hill': '5',
  'nigel-mansell': '5',
  'nelson-piquet': '7',
  'niki-lauda': '12',
  'jackie-stewart': '5',
  'jim-clark': '5',
  'juan-manuel-fangio': '2',
  'stirling-moss': '7',
  'jack-brabham': '8',
  'jochen-rindt': '2',
  'graham-hill': '14',
  'emerson-fittipaldi': '5',
  'mario-andretti': '5',
  'gilles-villeneuve': '27',
  'jacques-villeneuve': '3',
  'mika-salo': '17',
  'eddie-irvine': '4',
  'gerhard-berger': '28',
  'jean-alesi': '27',
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
  'logan-sargeant': '2',
  'zhou-guanyu': '24',
}

export function raceNumberFor(driverId: string): string | null {
  return NUMBERS[driverId] ?? null
}

// Two-letter initials from a driver's display name. Skips Jr/Sr suffixes.
// Used as the fallback inside RaceNumberBox when no race number is known.
export function initialsFor(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((p) => p && !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p))
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts[parts.length - 1]?.[0] ?? first
  return (first + last).toUpperCase()
}
