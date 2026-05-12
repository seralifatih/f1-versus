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

export function EraFilter({ value, onChange }: Props) {
  return (
    <div>
      <div className="text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">Era</div>
      <div className="inline-flex flex-wrap gap-2">
        {ERAS.map((e) => {
          const active = e.id === value
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onChange(e.id)}
              aria-pressed={active}
              className={
                'px-3.5 py-2 rounded-full border text-[13px] font-medium flex items-center gap-1.5 transition-colors duration-150 ' +
                (active
                  ? 'border-red bg-[rgba(239,51,64,0.08)] text-white'
                  : 'border-border2 text-[#aaa] hover:text-white')
              }
            >
              {e.label}
              <span
                className={'text-[11px] font-mono ' + (active ? 'text-white/60' : 'text-[#555]')}
              >
                {e.range}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
