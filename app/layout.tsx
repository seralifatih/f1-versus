import type { Metadata } from 'next'
import Script from 'next/script'
import { Fraunces, Inter_Tight, JetBrains_Mono } from 'next/font/google'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SITE_URL } from '@/lib/config'
import './globals.css'

// Runs synchronously in <head> before first paint. Reads localStorage
// (or prefers-color-scheme on first visit) and sets data-theme on <html>
// so the page paints with the correct palette — no flash of dark before
// light for light-preference users.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('f1versus-theme');var t=s||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`

const CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['opsz'],
})

const interTight = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  weight: ['400', '500', '600'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '700'],
})

function safeMetadataBase(): URL | undefined {
  try {
    return new URL(SITE_URL)
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: 'f1·versus — GOAT Calculator',
  description:
    'Settle the GOAT debate. Build your own formula and rank every F1 driver of all time.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'f1·versus — GOAT Calculator',
    description:
      'Your formula, your ranking. 75 years of Formula 1 data, weighted your way.',
    type: 'website',
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'f1·versus — GOAT Calculator',
    description: 'Your formula, your ranking.',
    images: ['/api/og'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-ink font-body antialiased">
        <ThemeProvider>
          <Header />
          <main className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-12 pb-24">
            {children}
            <Footer />
          </main>
        </ThemeProvider>
        {CF_ANALYTICS_TOKEN && (
          <Script
            id="cf-web-analytics"
            strategy="afterInteractive"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token":"${CF_ANALYTICS_TOKEN}"}`}
          />
        )}
      </body>
    </html>
  )
}
