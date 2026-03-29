import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog | GridRival",
  description:
    "Data-driven analysis of Formula 1 history. Driver comparisons, historical rankings, and deep dives into F1 statistics.",
  openGraph: {
    title: "GridRival Blog",
    description:
      "Data-driven analysis of Formula 1 history. Driver comparisons, historical rankings, and deep dives into F1 statistics.",
  },
};

// ─── Post registry ──────────────────────────────────────────────────────────
// Add new posts here — they appear on the index page automatically.

export const posts = [
  {
    slug: "best-f1-teammates-ranked-by-data",
    title: "The All-Time Best F1 Teammates Ranked by Data",
    date: "2025-07-01",
    description:
      "We pitted every legendary teammate pairing head-to-head — qualifying gap, race win ratio, and points delta — to settle the greatest intra-team battles in F1 history.",
    tag: "Analysis",
  },
  {
    slug: "wet-weather-kings-f1",
    title: "Wet Weather Kings: Who Really Is the Best in Rain?",
    date: "2025-07-01",
    description:
      "Wet races are where legends are made. We crunched positions-gained, win rates, and DNF avoidance across every rain-affected race since 1950 to crown the true wet-weather king.",
    tag: "Deep Dive",
  },
  {
    slug: "2026-regulations-driver-comparison",
    title: "New Regs, New Era: How 2026 Drivers Compare So Far",
    date: "2025-07-01",
    description:
      "The 2026 regulation reset reshuffled the grid. Here's what the early data says about who's adapting fastest — and which driver stats are already pulling ahead.",
    tag: "2026 Season",
  },
] as const;

type Post = (typeof posts)[number];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BlogPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1
        style={{
          fontSize: "clamp(26px, 5vw, 36px)",
          fontWeight: 900,
          letterSpacing: "-0.03em",
          color: "var(--foreground)",
          marginBottom: 8,
        }}
      >
        Blog
      </h1>
      <p style={{ color: "var(--muted-foreground)", fontSize: 15, marginBottom: 48 }}>
        Data-driven analysis of Formula 1 history.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {posts.map((post: Post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </main>
  );
}

function PostCard({ post }: { post: Post }) {
  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{ textDecoration: "none" }}
    >
      <article
        style={{
          padding: 24,
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--accent)",
              backgroundColor: "rgba(225,6,0,0.12)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {post.tag}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {formattedDate}
          </span>
        </div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--foreground)",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          {post.title}
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          {post.description}
        </p>
      </article>
    </Link>
  );
}
