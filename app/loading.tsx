export default function Loading() {
  return (
    <div className="space-y-10 animate-pulse" aria-hidden="true">
      {/* Hero */}
      <div className="space-y-3 pb-8">
        <div className="h-3 w-32 bg-panel-2" />
        <div className="h-16 w-3/4 max-w-[700px] bg-panel" />
        <div className="h-16 w-2/3 max-w-[600px] bg-panel" />
        <div className="h-4 w-1/2 max-w-[420px] bg-panel mt-4" />
      </div>

      {/* Era chips row */}
      <div className="space-y-3">
        <div className="h-3 w-16 bg-panel-2" />
        <div className="flex gap-px bg-border-strong">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-32 bg-panel" />
          ))}
        </div>
      </div>

      {/* Preset grid */}
      <div className="space-y-3">
        <div className="h-3 w-20 bg-panel-2" />
        <div
          className="grid gap-px bg-border-strong"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[148px] bg-panel" />
          ))}
        </div>
      </div>

      {/* Ranking list */}
      <section className="border-y border-border-strong bg-panel">
        {Array.from({ length: 20 }).map((_, idx) => (
          <RowSkeleton key={idx} />
        ))}
      </section>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div
      className="grid items-center gap-5 px-5 py-4 border-b border-border"
      style={{ gridTemplateColumns: '72px 44px 1fr auto 88px auto' }}
    >
      <div className="h-10 w-12 bg-panel-2 ml-auto" />
      <div className="h-8 w-8 bg-panel-2" />
      <div className="space-y-2">
        <div className="h-5 w-48 bg-panel-2" />
        <div className="h-3 w-24 bg-panel-2" />
      </div>
      <div className="h-7 w-16 bg-panel-2 ml-auto" />
      <div className="h-1 w-full bg-panel-2" />
      <div className="h-8 w-8 bg-panel-2" />
    </div>
  )
}
