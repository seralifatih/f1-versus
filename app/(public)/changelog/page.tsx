import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog | F1-Versus",
  description: "What's new on F1-Versus — feature updates, data improvements, and bug fixes.",
};

// ─── Changelog data ─────────────────────────────────────────────────────────

const entries = [
  {
    version: "1.0.0",
    date: "2025-07-01",
    label: "Launch",
    labelColor: "#e10600",
    changes: [
      "🏎️ Head-to-head comparison engine for 100+ F1 drivers",
      "Radar chart: 6-metric skill fingerprint (race pace, qualifying, consistency, wins, podiums, championships)",
      "Season-by-season timeline chart with points progression",
      "Head-to-head record table across shared seasons and teams",
      "Circuit breakdown — who wins on street circuits, high-speed tracks, and rain",
      "AI-generated narrative summary for every matchup",
      "Fan vote on every comparison page",
      "OG card images for social sharing",
      "Driver rankings leaderboard with sortable columns",
      "All-drivers grid with current grid highlighted",
    ],
  },
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  return (
    <main
      style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "48px 20px 80px",
      }}
    >
      {/* Header */}
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted-foreground)",
          textDecoration: "none",
          marginBottom: 32,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Home
      </Link>

      <h1
        style={{
          fontSize: "clamp(26px, 5vw, 36px)",
          fontWeight: 900,
          letterSpacing: "-0.03em",
          color: "var(--foreground)",
          marginBottom: 8,
        }}
      >
        Changelog
      </h1>
      <p style={{ color: "var(--muted-foreground)", fontSize: 15, marginBottom: 48 }}>
        Updates, improvements, and fixes to F1-Versus.
      </p>

      {/* Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        {entries.map((entry) => (
          <article key={entry.version}>
            {/* Version + date */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#fff",
                  backgroundColor: entry.labelColor,
                  padding: "3px 10px",
                  borderRadius: 4,
                }}
              >
                {entry.label}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--foreground)",
                }}
              >
                v{entry.version}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                {new Date(entry.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            {/* Changes */}
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {entry.changes.map((change) => (
                <li
                  key={change}
                  style={{
                    fontSize: 15,
                    color: "var(--foreground)",
                    paddingLeft: 20,
                    position: "relative",
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "0.45em",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: entry.labelColor,
                      display: "inline-block",
                    }}
                  />
                  {change}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {/* Footer CTA */}
      <div
        style={{
          marginTop: 64,
          padding: "24px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", margin: "0 0 16px" }}>
          Found a bug or have a feature request?
        </p>
        <a
          href="https://github.com/noktastudio/f1-versus/issues"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          Open an Issue on GitHub
        </a>
      </div>
    </main>
  );
}
