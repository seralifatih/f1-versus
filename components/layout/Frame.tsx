import type { ReactNode } from 'react'

export interface FrameProps {
  children: ReactNode
  leftGutter?: ReactNode
  rightGutter?: ReactNode
  className?: string
}

// Full-bleed technical-document frame.
//   ┌──────┬──────────────────────┬──────┐
//   │ 60px │ max-w-[1400px]       │ 60px │
//   │ left │ main content w/ L+R  │ right│
//   │ tags │ border-strong rails  │ tags │
//   └──────┴──────────────────────┴──────┘
// Below 768px, gutters collapse and content goes edge-to-edge with 16px
// of side padding. Consumers use full-width <hr class="border-border-strong"/>
// as section dividers — Frame doesn't impose them.
export function Frame({ children, leftGutter, rightGutter, className }: FrameProps) {
  return (
    <div className={`w-full flex justify-center ${className ?? ''}`}>
      <div className="hidden md:block w-[60px] shrink-0">
        {leftGutter && (
          <div className="t-label sticky top-0 pt-4 pr-3 text-right text-muted-2">
            {leftGutter}
          </div>
        )}
      </div>

      <div className="w-full max-w-[1400px] md:border-x md:border-border-strong px-4 md:px-8">
        {children}
      </div>

      <div className="hidden md:block w-[60px] shrink-0">
        {rightGutter && (
          <div className="t-label sticky top-0 pt-4 pl-3 text-left text-muted-2">
            {rightGutter}
          </div>
        )}
      </div>
    </div>
  )
}
