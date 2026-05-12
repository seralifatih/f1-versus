export interface SectionMarkerProps {
  code: string
  label: string
  className?: string
}

export function SectionMarker({ code, label, className }: SectionMarkerProps) {
  return (
    <div className={`t-label flex items-center gap-2 ${className ?? ''}`}>
      <span aria-hidden="true">§</span>
      <span>{code}</span>
      <span aria-hidden="true">—</span>
      <span>{label}</span>
    </div>
  )
}
