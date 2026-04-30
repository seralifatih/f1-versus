import type { Metadata } from "next";
import Link from "next/link";
import { getDB, hasDB } from "@/lib/db/client";
import { getTeamColor, buildTeamSlug } from "@/lib/data/types";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "F1 Teams — Constructor Profiles & Rivalry Comparisons",
  description:
    "Browse all Formula 1 constructor profiles and compare teams head-to-head. Ferrari vs McLaren, Mercedes vs Red Bull — all-time stats, wins, championships, driver histories.",
  alternates: { canonical: `${getSiteUrl()}/teams` },
};

// ─── Top rivalries on the page ─────────────────────────────────────────────

const FEATURED_RIVALRIES: [string, string][] = [
  ["ferrari", "mclaren"],
  ["mercedes", "red_bull"],
  ["ferrari", "williams"],
  ["ferrari", "renault"],
  ["mclaren", "williams"],
  ["benetton", "williams"],
];

// ─── Data fetcher ──────────────────────────────────────────────────────────

async function getTeams() {
  if (!hasDB()) return [];
  const db = getDB();
  const { results } = await db
    .prepare(`SELECT id, constructor_ref, name, color_hex FROM constructors ORDER BY name`)
    .all<{ id: string; constructor_ref: string; name: string; color_hex: string | null }>();
  return results;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function TeamsPage() {
  const teams = await getTeams();

  let winMap = new Map<string, number>();
  if (hasDB()) {
    const db = getDB();
    const { results: winRows } = await db
      .prepare(`SELECT constructor_id FROM results WHERE position = 1 AND is_sprint = 0`)
      .all<{ constructor_id: string }>();
    for (const r of winRows) winMap.set(r.constructor_id, (winMap.get(r.constructor_id) ?? 0) + 1);
  }

  // Sort teams: most wins first
  const sorted = [...teams].sort((a, b) => (winMap.get(b.id) ?? 0) - (winMap.get(a.id) ?? 0));

  // Rivalry names
  const rivalryRefs = Array.from(new Set(FEATURED_RIVALRIES.flat()));
  const rivalryNames = new Map<string, string>();
  for (const t of teams) {
    if (rivalryRefs.includes(t.constructor_ref)) {
      rivalryNames.set(t.constructor_ref, t.name);
    }
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <nav style={{ marginBottom: 20, fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Home</Link>
            <span>/</span>
            <span style={{ color: "#aaa" }}>Teams</span>
          </nav>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            F1 Constructor Profiles
          </h1>
          <p style={{ fontSize: 15, color: "#666", maxWidth: 560 }}>
            Browse every Formula 1 team — wins, championships, driver histories, and head-to-head rivalry comparisons.
          </p>
        </div>

        {/* Featured rivalries */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fafafa", marginBottom: 14, letterSpacing: "-0.02em" }}>
            Featured Rivalries
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {FEATURED_RIVALRIES.map(([a, b]) => {
              const slug = buildTeamSlug(a, b);
              const nameA = rivalryNames.get(a) ?? a.replace(/_/g, " ");
              const nameB = rivalryNames.get(b) ?? b.replace(/_/g, " ");
              const colorA = teams.find((t) => t.constructor_ref === a)?.color_hex ?? getTeamColor(a);
              const colorB = teams.find((t) => t.constructor_ref === b)?.color_hex ?? getTeamColor(b);
              return (
                <Link
                  key={slug}
                  href={`/compare/teams/${slug}`}
                  style={{
                    display: "block",
                    backgroundColor: "#111",
                    border: "1px solid #1a1a1a",
                    borderRadius: 12,
                    padding: "14px 16px",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colorA }} />
                    <div style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colorB }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colorA }}>{nameA}</span>
                    <span style={{ fontSize: 10, color: "#333", fontWeight: 900, letterSpacing: "0.1em" }}>VS</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colorB }}>{nameB}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#444", marginTop: 8 }}>Head-to-head all time →</p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* All teams grid */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fafafa", marginBottom: 14, letterSpacing: "-0.02em" }}>
            All Constructors
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {sorted.map((team) => {
              const color = team.color_hex ?? getTeamColor(team.constructor_ref);
              const wins = winMap.get(team.id) ?? 0;
              return (
                <Link
                  key={team.id}
                  href={`/teams/${team.constructor_ref}`}
                  style={{
                    display: "block",
                    backgroundColor: "#0d0d0d",
                    border: "1px solid #1a1a1a",
                    borderRadius: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 3, height: 24, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", lineHeight: 1.3 }}>{team.name}</span>
                  </div>
                  {wins > 0 && (
                    <p style={{ fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums" }}>
                      {wins.toLocaleString()} win{wins !== 1 ? "s" : ""}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </main>
  );
}
