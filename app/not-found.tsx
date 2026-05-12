import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <div
        className="font-display font-black uppercase leading-none tracking-[-0.06em] text-curb-red"
        style={{ fontSize: 'clamp(96px, 14vw, 180px)' }}
      >
        DNF
      </div>
      <h1
        className="font-display font-extrabold uppercase tracking-[-0.03em] mt-4"
        style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        Race Retired
      </h1>
      <p className="t-body-muted max-w-[440px] mt-4">
        This page didn&rsquo;t finish the race. Either the URL is wrong, the driver doesn&rsquo;t
        exist in your selected era, or we never built this page in the first place.
      </p>
      <div className="flex gap-3 mt-8">
        <Link
          href="/"
          className="px-3 py-1.5 bg-curb-red text-curb-white font-mono uppercase text-[11px] tracking-[0.1em] hover:opacity-90 transition-opacity"
        >
          Back to ranking
        </Link>
        <Link
          href="/vs"
          className="px-3 py-1.5 border border-border-strong font-mono uppercase text-[11px] tracking-[0.1em] hover:text-curb-red hover:border-curb-red transition-colors"
        >
          Pick a matchup
        </Link>
      </div>
    </section>
  )
}
