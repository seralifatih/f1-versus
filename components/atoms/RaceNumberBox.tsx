export type RaceNumberAccent = 'curb-red' | 'sector-purple' | 'sector-green' | 'muted'

export interface RaceNumberBoxProps {
  number?: string | null
  initials?: string | null
  accent?: RaceNumberAccent
  className?: string
}

const ACCENT_BG: Record<RaceNumberAccent, string> = {
  'curb-red': 'bg-curb-red',
  'sector-purple': 'bg-sector-purple',
  'sector-green': 'bg-sector-green',
  muted: 'bg-panel-2',
}

// Square number plate used next to driver names in ranking rows. When a
// driver has no known race number (pre-modern era), pass `initials`
// instead — the box renders the initials on a muted surface.
export function RaceNumberBox({
  number,
  initials,
  accent = 'curb-red',
  className,
}: RaceNumberBoxProps) {
  const hasNumber = number != null && number !== ''
  const bg = hasNumber ? ACCENT_BG[accent] : ACCENT_BG.muted
  const content = hasNumber ? number : (initials ?? '—')

  return (
    <div
      className={`inline-flex items-center justify-center font-mono font-bold text-curb-white border-[1.5px] border-border-strong h-6 w-6 text-[11px] md:h-8 md:w-8 md:text-[13px] tabular ${bg} ${className ?? ''}`}
    >
      {content}
    </div>
  )
}
