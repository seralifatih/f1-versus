'use client'

import { useEffect, useState } from 'react'

const TOTAL_KEY = 'data-rank-row'

// Timing-screen style scroll readout that lives in the layout right gutter.
// Shows the rank closest to viewport center while the user scrolls. Hidden
// until the user has scrolled past the hero so it doesn't compete for
// attention on initial paint.
export function ScrollIndicator() {
  const [current, setCurrent] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    // First scroll past 200px reveals the indicator and never re-hides it
    // during the page lifetime — toggling on every scroll direction would
    // be more distracting than useful.
    const onScroll = () => {
      if (window.scrollY > 200) setShown(true)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // Wait one tick for the ranking list to mount, then attach the observer
    // to every row. We re-run if the ranking re-renders with different rows;
    // a MutationObserver on the list would be cleaner but rows here are a
    // stable v1 dataset (top 20) so we just snapshot once on mount.
    const attach = () => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(`[${TOTAL_KEY}]`),
      )
      if (rows.length === 0) return null
      setTotal(rows.length)

      // Track which rows are currently intersecting the centre band; pick
      // the smallest rank (highest on screen) from that set as "current".
      const visible = new Set<number>()
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const r = parseInt(e.target.getAttribute(TOTAL_KEY) ?? '0', 10)
            if (!r) continue
            if (e.isIntersecting) visible.add(r)
            else visible.delete(r)
          }
          if (visible.size === 0) {
            setCurrent(null)
            return
          }
          setCurrent(Math.min(...visible))
        },
        {
          // Narrow 20%-tall band around the viewport centre. Wider band would
          // keep multiple rows "current" simultaneously and the readout would
          // flicker between them.
          rootMargin: '-40% 0px -40% 0px',
          threshold: 0,
        },
      )
      for (const row of rows) observer.observe(row)
      return observer
    }

    let observer: IntersectionObserver | null = null
    const handle = window.setTimeout(() => {
      observer = attach()
    }, 50)
    return () => {
      window.clearTimeout(handle)
      observer?.disconnect()
    }
  }, [])

  if (!shown || total === 0) return null

  return (
    <div className="flex flex-col items-start gap-1 leading-tight mt-6">
      <span className="text-muted-2">Scroll</span>
      <span className="tabular text-sector-purple text-[12px]">
        {String(current ?? 0).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  )
}
