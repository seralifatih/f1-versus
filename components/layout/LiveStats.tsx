import {
  BUILD_DATA_SYNC,
  TOTAL_DRIVERS,
  TOTAL_RACES,
  TOTAL_SEASONS,
} from '@/lib/build-info'

interface Row {
  label: string
  value: string
}

const ROWS: Row[] = [
  { label: 'Drivers', value: TOTAL_DRIVERS.toLocaleString() },
  { label: 'Seasons', value: TOTAL_SEASONS.toString() },
  { label: 'Races', value: TOTAL_RACES.toLocaleString() },
  { label: 'Last Sync', value: BUILD_DATA_SYNC },
]

// Race-control style stat block. Bordered card, each row separated by a
// hairline. Mono numerics. Rendered in the hero's right column on desktop
// to anchor the page in data from the first second.
export function LiveStats() {
  return (
    <aside
      className="border border-border-strong divide-y divide-border-strong w-full max-w-[260px] bg-panel"
      aria-label="Site totals"
    >
      {ROWS.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="t-label">{r.label}</span>
          <span className="t-value text-text text-[18px]">{r.value}</span>
        </div>
      ))}
    </aside>
  )
}
