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
        className="font-display font-bold italic leading-none tracking-[-0.04em] font-vary-[opsz_144,wght_700] text-red"
        style={{ fontSize: 'clamp(80px, 12vw, 140px)' }}
      >
        SPIN
      </div>
      <h1
        className="font-display font-normal tracking-[-0.03em] font-vary-[opsz_96,wght_400] mt-4"
        style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        Something went off-track
      </h1>
      <p className="text-[16px] text-muted2 max-w-[440px] mt-4 leading-[1.55]">
        An error broke the page. The most common cause is the driver data not being loaded yet —
        try again in a moment.
      </p>
      {error.digest && (
        <p className="text-[11px] text-muted font-mono mt-3">ref: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-full bg-red text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-4 py-2 rounded-full border border-border2 text-sm font-medium hover:border-red transition-colors"
        >
          Back to ranking
        </Link>
      </div>
    </section>
  )
}
