'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV = [
  { href: '/', label: 'Ranking', match: (p: string) => p === '/' || p.startsWith('/driver') },
  { href: '/vs', label: 'Battle', match: (p: string) => p === '/vs' || p.startsWith('/vs/') },
  { href: '/methodology', label: 'Methodology', match: (p: string) => p === '/methodology' },
] as const

export function Header() {
  const pathname = usePathname() ?? '/'

  return (
    <header className="bg-panel border-y border-border-strong h-12 md:h-14 flex items-stretch px-4 md:px-6">
      <Link
        href="/"
        className="flex items-center gap-0 no-underline text-current"
        aria-label="f1-versus home"
      >
        <span
          aria-hidden="true"
          className="t-label mr-3 hidden sm:inline-flex items-center text-muted-2"
        >
          §
        </span>
        <span className="font-display font-extrabold text-[18px] uppercase leading-none tracking-[-0.02em]">
          f1<span className="text-curb-red">·</span>versus
        </span>
      </Link>

      <div className="hidden sm:flex items-center mx-3 md:mx-4 h-full">
        <span className="border-l border-border-strong h-5 mx-0" aria-hidden="true" />
        <span className="t-label pl-3 md:pl-4">GOAT Calculator</span>
      </div>

      <nav className="ml-auto flex items-stretch gap-4 md:gap-6">
        {NAV.map((item) => {
          const active = item.match(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'flex items-center font-mono uppercase text-[11px] tracking-[0.1em] transition-colors relative ' +
                (active
                  ? 'text-curb-red after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-curb-red'
                  : 'text-muted hover:text-curb-red')
              }
            >
              {item.label}
            </Link>
          )
        })}
        <ThemeToggle />
      </nav>
    </header>
  )
}
