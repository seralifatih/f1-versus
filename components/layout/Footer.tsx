import {
  APP_VERSION,
  BUILD_DATA_SYNC,
  BUILD_DATA_VERSION,
  TOTAL_DRIVERS,
} from '@/lib/build-info'

export function Footer() {
  return (
    <footer className="mt-16 pt-4 border-t border-border-strong font-mono uppercase text-[12px] tracking-[0.12em] text-muted-2 flex flex-wrap items-start justify-between gap-y-1 gap-x-6">
      <div className="space-y-1">
        <div>
          DATA{' '}
          <a
            href="https://github.com/f1db/f1db"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-curb-red transition-colors"
          >
            {BUILD_DATA_VERSION}
          </a>{' '}
          · {TOTAL_DRIVERS.toLocaleString()} Drivers · Last Sync {BUILD_DATA_SYNC}
        </div>
        <div>
          Unofficial · Built by{' '}
          <a
            href="https://noktastudio.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-curb-red hover:underline"
          >
            Nokta Studio
          </a>{' '}
          · MIT Licensed
        </div>
        <div>
          Not affiliated with or endorsed by Formula 1, FIA, or FOM. F1, Formula
          One, and related marks are trademarks of Formula One Licensing BV.
        </div>
      </div>
      <div className="text-right md:text-right">
        {APP_VERSION} · § End of Document
      </div>
    </footer>
  )
}
