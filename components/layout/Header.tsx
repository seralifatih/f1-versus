import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV = [
  { href: '/', label: 'Ranking' },
  { href: '/vs', label: 'Battle' },
  { href: '/methodology', label: 'Methodology' },
] as const

export function Header() {
  return (
    <header className="border-b border-border px-4 sm:px-8 py-5 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-baseline gap-3 no-underline">
        <span className="font-display text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] font-vary-[opsz_96]">
          f1<span className="text-red">·</span>versus
        </span>
        <span className="hidden sm:inline text-xs text-muted uppercase tracking-[0.1em]">
          GOAT Calculator
        </span>
      </Link>
      <div className="flex items-center gap-3 sm:gap-6">
        <nav className="flex gap-3 sm:gap-6 text-[13px]">
          {NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={i === 0 ? '' : 'text-muted hover:text-current transition-colors'}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  )
}
