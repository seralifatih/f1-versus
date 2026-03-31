import type { Metadata } from "next";
import Link from "next/link";
import { posts, type Post } from "./posts";

export const metadata: Metadata = {
  title: "Blog | F1-Versus",
  description:
    "Data-driven analysis of Formula 1 history. Driver comparisons, historical rankings, and deep dives into F1 statistics.",
  openGraph: {
    title: "F1-Versus Blog",
    description:
      "Data-driven analysis of Formula 1 history. Driver comparisons, historical rankings, and deep dives into F1 statistics.",
  },
};

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
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: "none" }}>
      <article
        style={{
          padding: 24,
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          transition: "border-color 0.15s",
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
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{formattedDate}</span>
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
