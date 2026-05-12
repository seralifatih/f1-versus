import type { Metadata } from 'next'
import Script from 'next/script'
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Frame } from '@/components/layout/Frame'
import { RightGutter } from '@/components/layout/RightGutter'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SITE_URL } from '@/lib/config'
import './globals.css'

// Runs synchronously in <head> before first paint. Reads localStorage
// (or prefers-color-scheme on first visit) and sets data-theme on <html>
// so the page paints with the correct palette — no flash of dark before
// light for light-preference users.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('f1versus-theme');var t=s||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`

const CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
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
      className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-bg font-body antialiased">
        <ThemeProvider>
          <Header />
          <Frame
            leftGutter={
              <div className="flex flex-col items-end gap-1 leading-tight">
                <span>§ 01</span>
                <span className="text-text">RANKING</span>
              </div>
            }
            rightGutter={<RightGutter />}
          >
            <main className="pt-8 pb-16">
              {children}
              <Footer />
            </main>
          </Frame>
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
