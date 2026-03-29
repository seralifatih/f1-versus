import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GridRival Pro — Ad-Free Experience",
  description: "Remove ads and support GridRival with a Pro subscription.",
  robots: { index: false, follow: false },
};

export default function ProPage() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: "rgba(225,6,0,0.1)",
            border: "1px solid rgba(225,6,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginBottom: 10,
          }}
        >
          GridRival Pro
        </h1>

        <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6, marginBottom: 32 }}>
          An ad-free experience is coming soon. Pro will also include deeper
          stats, season filters, and early access to new features.
        </p>

        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
              marginBottom: 8,
            }}
          >
            Coming Soon
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {[
              "No ads, ever",
              "Season-by-season filter on all comparisons",
              "Export comparison data as CSV",
              "Early access to new features",
            ].map((feature) => (
              <li
                key={feature}
                style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#ccc" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            color: "#555",
            textDecoration: "none",
          }}
        >
          ← Back to GridRival
        </Link>
      </div>
    </div>
  );
}
