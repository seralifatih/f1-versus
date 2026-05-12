'use client'

import { Sliders } from 'lucide-react'
import { PRESETS } from '@/lib/scoring/presets'

type Props = {
  activePresetId: string | null
  isCustom: boolean
  onPresetChange: (id: string) => void
  onToggleCustom: () => void
}

export function PresetChips({ activePresetId, isCustom, onPresetChange, onToggleCustom }: Props) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted uppercase tracking-[0.12em] mb-2.5">
        <span>Formula</span>
        <button
          onClick={onToggleCustom}
          className={
            'flex items-center gap-1.5 transition-colors ' +
            (isCustom ? 'text-red' : 'text-muted2 hover:text-current')
          }
        >
          <Sliders size={12} />
          Custom mode
        </button>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {PRESETS.map((p) => {
          const active = !isCustom && p.id === activePresetId
          return (
            <button
              key={p.id}
              onClick={() => onPresetChange(p.id)}
              className={
                'text-left px-4 py-3.5 rounded-[10px] border transition-colors duration-150 ' +
                (active ? 'border-red' : 'border-border bg-panel hover:border-border2')
              }
              style={
                active
                  ? {
                      background:
                        'linear-gradient(135deg, var(--color-accent-gradient), transparent)',
                    }
                  : undefined
              }
            >
              <div className="font-display text-[17px] font-semibold tracking-[-0.01em] font-vary-[opsz_36] mb-1">
                {p.label}
              </div>
              <div className="text-xs text-muted2 leading-[1.4]">{p.blurb}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
