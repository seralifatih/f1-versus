import type { Metadata } from "next";
import Link from "next/link";
import { getDB, hasDB } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "All F1 Driver Comparisons | F1-Versus",
  description:
    "Browse every head-to-head Formula 1 driver comparison on F1-Versus — from Hamilton vs Verstappen to Senna vs Prost. All eras, all rivalries.",
  alternates: { canonical: "/compare" },
};

export const dynamic = "force-static";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ComparisonRow {
  slug: string;
  lastNameA: string;
  lastNameB: string;
  firstNameA: string;
  firstNameB: string;
  colorA: string | null;
  colorB: string | null;
  isCurrentA: boolean;
  isCurrentB: boolean;
}

// ─── Data ──────────────────────────────────────────────────────────────────

async function getAllComparisons(): Promise<ComparisonRow[]> {
  if (!hasDB()) return [];

  const db = getDB();
  const currentYear = new Date().getFullYear();

  const { results: comps } = await db
    .prepare(
      `SELECT dc.slug,
              da.id AS a_id, da.driver_ref AS a_ref, da.first_name AS a_first, da.last_name AS a_last,
              db.id AS b_id, db.driver_ref AS b_ref, db.first_name AS b_first, db.last_name AS b_last
       FROM driver_comparisons dc
       JOIN drivers da ON da.id = dc.driver_a_id
       JOIN drivers db ON db.id = dc.driver_b_id
       WHERE dc.season IS NULL
       ORDER BY dc.slug`
    )
    .all<{
      slug: string;
      a_id: string; a_ref: string; a_first: string; a_last: string;
      b_id: string; b_ref: string; b_first: string; b_last: string;
    }>();

  if (comps.length === 0) return [];

  const allRefs = comps.flatMap((c) => [c.a_ref, c.b_ref]);
  const allIds  = comps.flatMap((c) => [c.a_id,  c.b_id]);

  const refPlaceholders = allRefs.map(() => "?").join(", ");
  const idPlaceholders  = allIds.map(() => "?").join(", ");

  const [{ results: colorRows }, { results: currentResults }] = await Promise.all([
    db.prepare(
      `SELECT d.driver_ref, c.color_hex
       FROM results r
       JOIN drivers d ON d.id = r.driver_id
       JOIN constructors c ON c.id = r.constructor_id
       WHERE d.driver_ref IN (${refPlaceholders}) AND r.is_sprint = 0
       ORDER BY r.race_id DESC`
    ).bind(...allRefs).all<{ driver_ref: string; color_hex: string }>(),

    db.prepare(
      `SELECT DISTINCT r.driver_id
       FROM results r
       JOIN races rc ON rc.id = r.race_id
       WHERE rc.season = ? AND r.is_sprint = 0 AND r.driver_id IN (${idPlaceholders})`
    ).bind(currentYear, ...allIds).all<{ driver_id: string }>(),
  ]);

  const colorMap = new Map<string, string>();
  for (const row of colorRows) {
    if (!colorMap.has(row.driver_ref) && row.color_hex) colorMap.set(row.driver_ref, row.color_hex);
  }
  const currentSet = new Set(currentResults.map((r) => r.driver_id));

  return comps.map((c) => ({
    slug: c.slug,
    firstNameA: c.a_first,
    lastNameA: c.a_last,
    firstNameB: c.b_first,
    lastNameB: c.b_last,
    colorA: colorMap.get(c.a_ref) ?? null,
    colorB: colorMap.get(c.b_ref) ?? null,
    isCurrentA: currentSet.has(c.a_id),
    isCurrentB: currentSet.has(c.b_id),
  }));
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function CompareHubPage() {
  const currentYear = new Date().getFullYear();
  const comparisons = await getAllComparisons();

  // Separate current-era pairs (both or one driver is current) vs historical
  const currentPairs = comparisons.filter((c) => c.isCurrentA || c.isCurrentB);
  const historicalPairs = comparisons.filter((c) => !c.isCurrentA && !c.isCurrentB);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 16px 80px" }}>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: 24, fontSize: 13, color: "#555" }}>
        <Link href="/" style={{ color: "#555", textDecoration: "none" }}>F1-Versus</Link>
        <span style={{ margin: "0 8px" }}>›</span>
        <span style={{ color: "#888" }}>Compare</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 48px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          All Comparisons
        </h1>
        <p style={{ fontSize: 15, color: "#888" }}>
          {comparisons.length.toLocaleString()} head-to-head matchups — every era of Formula 1
        </p>
      </div>

      {/* Current era */}
      {currentPairs.length > 0 && (
        <ComparisonGroup
          title="Current Era"
          subtitle={`${currentYear} grid drivers`}
          items={currentPairs}
        />
      )}

      {/* Historical */}
      {historicalPairs.length > 0 && (
        <ComparisonGroup title="Historical" subtitle="All-time rivalries" items={historicalPairs} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ComparisonGroup({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ComparisonRow[];
}) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
        <p style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{subtitle}</p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8,
        }}
      >
        {items.map((c) => (
          <ComparisonCard key={c.slug} comp={c} />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({ comp }: { comp: ComparisonRow }) {
  return (
    <Link
      href={`/compare/${comp.slug}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        textDecoration: "none",
        position: "relative",
        overflow: "hidden",
        minHeight: 44,
        transition: "border-color 0.15s",
      }}
    >
      {/* Left accent */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: comp.colorA ?? "var(--accent)",
          borderRadius: "3px 0 0 3px",
        }}
      />
      <div style={{ paddingLeft: 6, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            fontWeight: 700,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              color: comp.colorA ?? "var(--foreground)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "40%",
            }}
          >
            {comp.lastNameA}
          </span>
          <span style={{ fontSize: 8, color: "#444", fontWeight: 900, letterSpacing: "0.06em", flexShrink: 0 }}>
            VS
          </span>
          <span
            style={{
              color: comp.colorB ?? "var(--foreground)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "40%",
            }}
          >
            {comp.lastNameB}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>
          {comp.firstNameA[0]}. {comp.lastNameA} · {comp.firstNameB[0]}. {comp.lastNameB}
        </div>
      </div>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ color: "#333", flexShrink: 0 }}
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}
