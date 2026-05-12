export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse" aria-hidden="true">
      {/* Hero */}
      <div className="space-y-3 mb-4">
        <div className="h-16 w-3/4 max-w-[700px] bg-panel rounded-md" />
        <div className="h-16 w-2/3 max-w-[600px] bg-panel rounded-md" />
        <div className="h-5 w-1/2 max-w-[420px] bg-panel rounded-md mt-4" />
      </div>

      {/* Era chips row */}
      <div className="space-y-2.5">
        <div className="h-3 w-10 bg-panel rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-32 bg-panel rounded-full" />
          ))}
        </div>
      </div>

      {/* Preset grid */}
      <div className="space-y-2.5">
        <div className="h-3 w-16 bg-panel rounded" />
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] bg-panel rounded-[10px]" />
          ))}
        </div>
      </div>

      {/* Share bar */}
      <div className="flex justify-between items-center">
        <div className="h-3 w-32 bg-panel rounded" />
        <div className="h-8 w-32 bg-panel rounded-full" />
      </div>

      {/* Ranking list */}
      <section>
        {Array.from({ length: 20 }).map((_, idx) => (
          <RowSkeleton key={idx} idx={idx} />
        ))}
      </section>
    </div>
  )
}

function RowSkeleton({ idx }: { idx: number }) {
  const big = idx === 0
  return (
    <div
      className="grid items-center gap-5 px-5 py-[18px] border-b border-[#161618]"
      style={{ gridTemplateColumns: '64px 1fr auto auto' }}
    >
      <div
        className="bg-panel rounded-md"
        style={{ height: big ? 56 : 36, width: big ? 64 : 48 }}
      />
      <div className="space-y-2">
        <div className="h-5 w-48 bg-panel rounded" />
        <div className="h-3 w-24 bg-panel rounded" />
      </div>
      <div className="h-8 w-16 bg-panel rounded" />
      <div className="h-8 w-8 bg-panel rounded-lg" />
    </div>
  )
}
