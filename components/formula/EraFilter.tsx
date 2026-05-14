'use client'

import type { EraId } from '@/lib/f1db/types'

const ERAS: Array<{ id: EraId; label: string; range: string }> = [
  { id: 'all', label: 'All Time', range: '1950–now' },
  { id: 'golden', label: 'Golden Era', range: '1950–1979' },
  { id: 'turbo', label: 'Turbo & Tobacco', range: '1980–2005' },
  { id: 'modern', label: 'Modern', range: '2006–now' },
]

type Props = {
  value: EraId
  onChange: (era: EraId) => void
}

// Connected-toolbar style: 1px gap between squared chips. Active = curb-red
// fill + white text; inactive = transparent with border-strong outline.
export function EraFilter({ value, onChange }: Props) {
  return (
    <div className="inline-flex flex-wrap gap-px bg-border-strong">
      {ERAS.map((e) => {
        const active = e.id === value
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onChange(e.id)}
            aria-pressed={active}
            className={
              'px-3.5 py-2 font-mono uppercase text-[13px] tracking-[0.1em] flex items-baseline gap-2 transition-colors ' +
              (active
                ? 'bg-curb-red text-curb-white'
                : 'bg-bg text-muted hover:text-text')
            }
          >
            <span>{e.label}</span>
            <span
              className={
                'text-[12px] tracking-[0.08em] ' +
                (active ? 'opacity-80' : 'text-muted-2')
              }
            >
              · {e.range}
            </span>
          </button>
        )
      })}
    </div>
  )
}
