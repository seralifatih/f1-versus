'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Best-effort logging. In production this lands in the Workers tail logs.
    console.error(error)
  }, [error])

  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <div
        className="font-display font-black uppercase leading-none tracking-[-0.06em] text-curb-red"
        style={{ fontSize: 'clamp(80px, 12vw, 140px)' }}
      >
        SPIN
      </div>
      <h1
        className="font-display font-extrabold uppercase tracking-[-0.03em] mt-4"
        style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        Something Went Off-Track
      </h1>
      <p className="t-body-muted max-w-[440px] mt-4">
        An error broke the page. The most common cause is the driver data not being loaded yet —
        try again in a moment.
      </p>
      {error.digest && (
        <p className="t-label mt-3">ref: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={reset}
          className="px-3 py-1.5 bg-curb-red text-curb-white font-mono uppercase text-[11px] tracking-[0.1em] hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-3 py-1.5 border border-border-strong font-mono uppercase text-[11px] tracking-[0.1em] hover:text-curb-red hover:border-curb-red transition-colors"
        >
          Back to ranking
        </Link>
      </div>
    </section>
  )
}
