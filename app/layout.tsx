import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

// Viewport: responsive scaling + allow pinch-to-zoom (accessibility best practice)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respect notch safe areas on iOS
};

export const metadata: Metadata = {
  title: {
    default: "F1-Versus — F1 Driver Comparison Engine",
    template: "%s | F1-Versus",
  },
  description:
    "Head-to-head Formula 1 driver comparisons. Stats, charts, and analysis for every driver pairing in F1 history.",
  metadataBase: new URL(getSiteUrl()),
  openGraph: {
    type: "website",
    siteName: "F1-Versus",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@f1-versus",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "";
// Set in Cloudflare Pages dashboard → Settings → Environment variables
// Get your token from dash.cloudflare.com → Web Analytics → Sites
const CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? "";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {ADSENSE_CLIENT_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        {/* Cloudflare Web Analytics — privacy-friendly, no cookies */}
        {CF_ANALYTICS_TOKEN && (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_ANALYTICS_TOKEN })}
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight"
          aria-label="F1-Versus home"
        >
          <span style={{ color: "var(--accent)" }}>Grid</span>
          <span>Rival</span>
        </a>
        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-1 text-sm font-medium">
            <li>
              <a
                href="/drivers"
                className="transition-colors hover:text-white flex items-center"
                style={{ color: "var(--muted-foreground)", padding: "10px 12px", minHeight: 44 }}
              >
                Drivers
              </a>
            </li>
            <li>
              <a
                href="/rankings"
                className="transition-colors hover:text-white flex items-center"
                style={{ color: "var(--muted-foreground)", padding: "10px 12px", minHeight: 44 }}
              >
                Rankings
              </a>
            </li>
            <li>
              <a
                href="/blog"
                className="transition-colors hover:text-white flex items-center"
                style={{ color: "var(--muted-foreground)", padding: "10px 12px", minHeight: 44 }}
              >
                Blog
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer
      className="mt-24 border-t py-10"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            © {new Date().getFullYear()} F1-Versus by Nokta Studio. F1 data via{" "}
            <a
              href="https://api.jolpi.ca/ergast/f1/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              Jolpica API
            </a>
            .
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
            <a
              href="/changelog"
              className="text-xs hover:text-white transition-colors"
              style={{ color: "#444" }}
            >
              Changelog
            </a>
            <a
              href="https://github.com/noktastudio/f1-versus/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs hover:text-white transition-colors"
              style={{ color: "#444" }}
            >
              Feedback
            </a>
            <a
              href="/pro"
              className="text-xs hover:text-white transition-colors"
              style={{ color: "#444" }}
            >
              Remove ads
            </a>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Not affiliated with Formula 1 or the FIA.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
