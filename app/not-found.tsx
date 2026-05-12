import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <div
        className="font-display font-bold italic leading-none tracking-[-0.04em] font-vary-[opsz_144,wght_700] text-red"
        style={{ fontSize: 'clamp(96px, 14vw, 180px)' }}
      >
        DNF
      </div>
      <h1
        className="font-display font-normal tracking-[-0.03em] font-vary-[opsz_96,wght_400] mt-4"
        style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        Race retired
      </h1>
      <p className="text-[16px] text-muted2 max-w-[440px] mt-4 leading-[1.55]">
        This page didn&rsquo;t finish the race. Either the URL is wrong, the driver doesn&rsquo;t
        exist in your selected era, or we never built this page in the first place.
      </p>
      <div className="flex gap-3 mt-8">
        <Link
          href="/"
          className="px-4 py-2 rounded-full bg-red text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Back to ranking
        </Link>
        <Link
          href="/vs"
          className="px-4 py-2 rounded-full border border-border2 text-sm font-medium hover:border-red transition-colors"
        >
          Pick a matchup
        </Link>
      </div>
    </section>
  )
}
