import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/client";

export const metadata: Metadata = {
  title: "All F1 Driver Comparisons | GridRival",
  description:
    "Browse every head-to-head Formula 1 driver comparison on GridRival — from Hamilton vs Verstappen to Senna vs Prost. All eras, all rivalries.",
  alternates: { canonical: "/compare" },
};

export const revalidate = 86400;

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
  const supabase = createServerClient();
  const currentYear = new Date().getFullYear();

  const { data: comps } = await supabase
    .from("driver_comparisons")
    .select(
      `slug,
       driver_a:drivers!driver_comparisons_driver_a_id_fkey(id, driver_ref, first_name, last_name),
       driver_b:drivers!driver_comparisons_driver_b_id_fkey(id, driver_ref, first_name, last_name)`
    )
    .is("season", null)
    .order("slug");

  if (!comps) return [];

  type DRow = { id: number; driver_ref: string; first_name: string; last_name: string };

  const driverRefs = comps.flatMap((c) => [
    (c.driver_a as unknown as DRow).driver_ref,
    (c.driver_b as unknown as DRow).driver_ref,
  ]);

  const driverIds = comps.flatMap((c) => [
    (c.driver_a as unknown as DRow).id,
    (c.driver_b as unknown as DRow).id,
  ]);

  // Team colors
  const { data: colorRows } = await supabase
    .from("results")
    .select("drivers!inner(driver_ref), constructors!inner(color_hex)")
    .in("drivers.driver_ref", driverRefs)
    .eq("is_sprint", false)
    .order("race_id", { ascending: false });

  const colorMap = new Map<string, string>();
  for (const row of colorRows ?? []) {
    const ref = (row.drivers as unknown as { driver_ref: string }).driver_ref;
    const color = (row.constructors as unknown as { color_hex: string }).color_hex;
    if (!colorMap.has(ref) && color) colorMap.set(ref, color);
  }

  // Current-season drivers
  const { data: currentResults } = await supabase
    .from("results")
    .select("driver_id, races!inner(season)")
    .eq("races.season", currentYear)
    .eq("is_sprint", false)
    .in("driver_id", driverIds);

  const currentSet = new Set((currentResults ?? []).map((r: { driver_id: number }) => r.driver_id));

  return comps
    .filter((c) => c.slug)
    .map((c) => {
      const a = c.driver_a as unknown as DRow;
      const b = c.driver_b as unknown as DRow;
      return {
        slug: c.slug as string,
        firstNameA: a.first_name,
        lastNameA: a.last_name,
        firstNameB: b.first_name,
        lastNameB: b.last_name,
        colorA: colorMap.get(a.driver_ref) ?? null,
        colorB: colorMap.get(b.driver_ref) ?? null,
        isCurrentA: currentSet.has(a.id),
        isCurrentB: currentSet.has(b.id),
      };
    });
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
        <Link href="/" style={{ color: "#555", textDecoration: "none" }}>GridRival</Link>
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
