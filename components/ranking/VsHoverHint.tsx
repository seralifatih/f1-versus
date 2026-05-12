'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  above: { name: string } | null
  below: { name: string } | null
  children: ReactNode
}

const HOVER_DELAY_MS = 300

// Tiny tooltip surfaced when the user hovers the row's VS arrow. Shows
// the two ranking neighbors so the user knows who they'd be picking from
// before clicking. Disappears immediately on mouse-leave.
export function VsHoverHint({ above, below, children }: Props) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const onEnter = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
  }
  const onLeave = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOpen(false)
  }

  // No neighbors → nothing useful to show. Render children unwrapped so we
  // don't add an empty span just to host an invisible tooltip.
  if (!above && !below) return <>{children}</>

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-20 whitespace-nowrap bg-bg border border-curb-red px-2.5 py-1.5 font-mono uppercase text-[11px] tracking-[0.1em] text-text shadow-lg"
        >
          <span className="block text-muted-2 mb-1">Compare With:</span>
          {above && (
            <span className="block">
              <span aria-hidden="true" className="text-sector-purple">↑</span>{' '}
              {above.name}
            </span>
          )}
          {below && (
            <span className="block">
              <span aria-hidden="true" className="text-sector-yellow">↓</span>{' '}
              {below.name}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
