'use client'

export type SectorState = 'best' | 'good' | 'baseline'

export interface SectorBarProps {
  value: number
  state?: SectorState
  showValue?: boolean
  className?: string
}

const FILL_COLOR: Record<SectorState, string> = {
  best: 'var(--color-sector-purple)',
  good: 'var(--color-sector-green)',
  baseline: 'var(--color-border-bright)',
}

const LABEL_COLOR: Record<SectorState, string> = {
  best: 'text-sector-purple',
  good: 'text-sector-green',
  baseline: 'text-muted',
}

// Timing-screen style bar. State decides color: purple = fastest,
// green = personal best, baseline = neutral. Fill animates on value change.
export function SectorBar({
  value,
  state = 'baseline',
  showValue = false,
  className,
}: SectorBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`flex items-center gap-2 w-full ${className ?? ''}`}>
      <div className="relative h-[4px] flex-1 bg-border overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
          style={{ width: `${clamped}%`, background: FILL_COLOR[state] }}
        />
      </div>
      {showValue && (
        <span className={`t-value text-[11px] min-w-[28px] text-right ${LABEL_COLOR[state]}`}>
          {Math.round(clamped)}
        </span>
      )}
    </div>
  )
}
