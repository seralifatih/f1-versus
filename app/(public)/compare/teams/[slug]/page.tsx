import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { getTeamColor, buildTeamSlug } from "@/lib/data/types";
import { getOrComputeTeamComparison, buildTeamRadarMetrics } from "@/lib/comparison/team-compute";
import type { TeamStats, TeamComparisonResult, TeamSeasonStats } from "@/lib/data/types";
import { getSiteUrl } from "@/lib/site-url";
import { AdBanner } from "@/components/ui/AdBanner";
import { DriverRadarChart } from "@/components/charts/DriverRadarChart";

export const dynamic = "force-static";

// ─── Top 20 historical rivalries ──────────────────────────────────────────

const RIVALRY_PAIRS: [string, string][] = [
  ["ferrari", "mclaren"],
  ["mercedes", "red_bull"],
  ["ferrari", "williams"],
  ["ferrari", "renault"],
  ["mclaren", "williams"],
  ["ferrari", "red_bull"],
  ["mercedes", "ferrari"],
  ["mclaren", "red_bull"],
  ["williams", "renault"],
  ["benetton", "williams"],
  ["ferrari", "benetton"],
  ["mclaren", "renault"],
  ["lotus_f1", "ferrari"],
  ["mercedes", "mclaren"],
  ["ferrari", "mercedes"],
  ["red_bull", "renault"],
  ["williams", "mercedes"],
  ["lotus_f1", "mclaren"],
  ["ferrari", "lotus_f1"],
  ["mclaren", "mercedes"],
];

// ─── Static params ─────────────────────────────────────────────────────────

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  if (!hasPublicSupabaseConfig()) return [];
  const supabase = createServerClient();

  // Current teams (appeared in last 3 seasons)
  const currentYear = new Date().getFullYear();
  const { data: recentRaces } = await supabase
    .from("races")
    .select("id")
    .gte("season", currentYear - 2);

  const recentRaceIds = (recentRaces ?? []).map((r: { id: string }) => r.id);

  let currentRefs: string[] = [];
  if (recentRaceIds.length > 0) {
    const { data: currentResults } = await supabase
      .from("results")
      .select("constructor_id, constructors!inner(constructor_ref)")
      .in("race_id", recentRaceIds)
      .eq("is_sprint", false);

    const refSet = new Set<string>();
    for (const r of (currentResults ?? []) as unknown as { constructors: { constructor_ref: string } }[]) {
      refSet.add(r.constructors.constructor_ref);
    }
    currentRefs = Array.from(refSet);
  }

  const slugSet = new Set<string>();

  // All current-team pairs
  for (let i = 0; i < currentRefs.length; i++) {
    for (let j = i + 1; j < currentRefs.length; j++) {
      slugSet.add(buildTeamSlug(currentRefs[i], currentRefs[j]));
    }
  }

  // Top 20 historical rivalries
  for (const [a, b] of RIVALRY_PAIRS) {
    slugSet.add(buildTeamSlug(a, b));
  }

  return Array.from(slugSet).map((slug) => ({ slug }));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const parsed = parseTeamSlug(params.slug);
  if (!parsed) return { title: "Team Comparison" };

  const supabase = createServerClient();
  const { data: cons } = await supabase
    .from("constructors")
    .select("constructor_ref, name")
    .in("constructor_ref", [parsed.refA, parsed.refB]);

  if (!cons || cons.length < 2) return { title: "Team Comparison" };

  const nameA = (cons as { constructor_ref: string; name: string }[]).find((c) => c.constructor_ref === parsed.refA)?.name ?? parsed.refA;
  const nameB = (cons as { constructor_ref: string; name: string }[]).find((c) => c.constructor_ref === parsed.refB)?.name ?? parsed.refB;

  const BASE = getSiteUrl();
  const canonicalSlug = buildTeamSlug(parsed.refA, parsed.refB);
  const title = `${nameA} vs ${nameB} — F1 Team Comparison`;
  const description = `All-time Formula 1 head-to-head: ${nameA} vs ${nameB}. Wins, championships, podiums, 1-2 finishes, season-by-season battles, and complete historical record.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/compare/teams/${canonicalSlug}` },
    openGraph: {
      title,
      description,
      url: `${BASE}/compare/teams/${canonicalSlug}`,
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

// ─── Parse slug ────────────────────────────────────────────────────────────

function parseTeamSlug(slug: string): { refA: string; refB: string } | null {
  const match = slug.match(/^(.+)-vs-(.+)$/);
  if (!match) return null;
  return { refA: match[1], refB: match[2] };
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 16, color: "#fafafa" }}>
      {children}
    </h2>
  );
}

function StatPill({ label, vA, vB, colorA, colorB, highlight }: {
  label: string;
  vA: string | number;
  vB: string | number;
  colorA: string;
  colorB: string;
  highlight?: "A" | "B" | "tie";
}) {
  return (
    <div style={{ backgroundColor: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 14px" }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#555", marginBottom: 8 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: highlight === "A" ? colorA : "#fafafa", fontVariantNumeric: "tabular-nums" }}>{vA}</span>
        <span style={{ fontSize: 11, color: "#333", fontWeight: 700 }}>vs</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: highlight === "B" ? colorB : "#fafafa", fontVariantNumeric: "tabular-nums" }}>{vB}</span>
      </div>
    </div>
  );
}

function HeadlineHero({
  result,
  colorA,
  colorB,
}: {
  result: TeamComparisonResult;
  colorA: string;
  colorB: string;
}) {
  const { statsA, statsB, constructorA, constructorB, headToHead, sharedSeasons } = result;

  return (
    <header style={{ marginBottom: 40 }}>
      {/* Team name hero */}
      <div
        style={{
          backgroundColor: "#0d0d0d",
          border: "1px solid #1a1a1a",
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch" }}>
          {/* Team A */}
          <Link
            href={`/teams/${constructorA.constructor_ref}`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "28px 20px",
              borderLeft: `5px solid ${colorA}`,
              textDecoration: "none",
            }}
          >
            <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: colorA }} />
            <p style={{ fontSize: "clamp(18px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.03em", color: "#fafafa", textAlign: "center" }}>
              {constructorA.name}
            </p>
            <p style={{ fontSize: 12, color: colorA, fontWeight: 700 }}>
              {statsA.championships > 0 ? `${statsA.championships}× WCC` : `${statsA.wins} wins`}
            </p>
          </Link>

          {/* VS badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 4,
              padding: "0 20px",
              backgroundColor: "#111",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color: "#444" }}>VS</span>
            {sharedSeasons.length > 0 && (
              <span style={{ fontSize: 10, color: "#333", textAlign: "center", maxWidth: 70 }}>
                {sharedSeasons.length} shared seasons
              </span>
            )}
          </div>

          {/* Team B */}
          <Link
            href={`/teams/${constructorB.constructor_ref}`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "28px 20px",
              borderRight: `5px solid ${colorB}`,
              textDecoration: "none",
            }}
          >
            <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: colorB }} />
            <p style={{ fontSize: "clamp(18px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.03em", color: "#fafafa", textAlign: "center" }}>
              {constructorB.name}
            </p>
            <p style={{ fontSize: 12, color: colorB, fontWeight: 700 }}>
              {statsB.championships > 0 ? `${statsB.championships}× WCC` : `${statsB.wins} wins`}
            </p>
          </Link>
        </div>

        {/* Head-to-head bar */}
        {headToHead.totalSharedSeasons > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #1a1a1a", backgroundColor: "#0a0a0a" }}>
            <p style={{ fontSize: 11, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, textAlign: "center" }}>
              Season battles ({headToHead.totalSharedSeasons} seasons)
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: colorA, fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>
                {headToHead.seasonWinsA}
              </span>
              <div style={{ flex: 1, height: 8, backgroundColor: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
                {headToHead.seasonWinsA + headToHead.seasonWinsB > 0 && (
                  <div
                    style={{
                      height: "100%",
                      width: `${(headToHead.seasonWinsA / (headToHead.seasonWinsA + headToHead.seasonWinsB)) * 100}%`,
                      backgroundColor: colorA,
                      borderRadius: 4,
                    }}
                  />
                )}
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: colorB, fontVariantNumeric: "tabular-nums", minWidth: 28 }}>
                {headToHead.seasonWinsB}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function StatGrid({
  statsA,
  statsB,
  colorA,
  colorB,
}: {
  statsA: TeamStats;
  statsB: TeamStats;
  colorA: string;
  colorB: string;
}) {
  const rows: { label: string; vA: number | string; vB: number | string }[] = [
    { label: "Races", vA: statsA.totalRaces, vB: statsB.totalRaces },
    { label: "Wins", vA: statsA.wins, vB: statsB.wins },
    { label: "Podiums", vA: statsA.podiums, vB: statsB.podiums },
    { label: "Poles", vA: statsA.poles, vB: statsB.poles },
    { label: "1-2 Finishes", vA: statsA.oneTwos, vB: statsB.oneTwos },
    { label: "Championships", vA: statsA.championships, vB: statsB.championships },
    { label: "Points/Race", vA: statsA.pointsPerRace, vB: statsB.pointsPerRace },
    { label: "Podium Rate", vA: `${(statsA.podiumRate * 100).toFixed(1)}%`, vB: `${(statsB.podiumRate * 100).toFixed(1)}%` },
  ];

  function highlight(vA: number | string, vB: number | string): "A" | "B" | "tie" {
    const a = typeof vA === "string" ? parseFloat(vA) : vA;
    const b = typeof vB === "string" ? parseFloat(vB) : vB;
    if (a > b) return "A";
    if (b > a) return "B";
    return "tie";
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {rows.map(({ label, vA, vB }) => (
        <StatPill
          key={label}
          label={label}
          vA={typeof vA === "number" ? vA.toLocaleString() : vA}
          vB={typeof vB === "number" ? vB.toLocaleString() : vB}
          colorA={colorA}
          colorB={colorB}
          highlight={highlight(vA, vB)}
        />
      ))}
    </div>
  );
}

function SharedSeasonsTable({
  statsA,
  statsB,
  sharedSeasons,
  colorA,
  colorB,
  nameA,
  nameB,
}: {
  statsA: TeamStats;
  statsB: TeamStats;
  sharedSeasons: number[];
  colorA: string;
  colorB: string;
  nameA: string;
  nameB: string;
}) {
  if (sharedSeasons.length === 0) return null;

  const rows = sharedSeasons
    .map((season) => {
      const sA = statsA.seasonBreakdown.find((s) => s.season === season);
      const sB = statsB.seasonBreakdown.find((s) => s.season === season);
      if (!sA || !sB) return null;
      const winner = sA.points > sB.points ? "A" : sB.points > sA.points ? "B" : "tie";
      return { season, sA, sB, winner };
    })
    .filter(Boolean) as { season: number; sA: TeamSeasonStats; sB: TeamSeasonStats; winner: "A" | "B" | "tie" }[];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #222" }}>
            <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Season</th>
            <th style={{ padding: "8px 10px", textAlign: "right", color: colorA, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{nameA}</th>
            <th style={{ padding: "8px 10px", textAlign: "center", color: "#333", fontWeight: 600, fontSize: 11 }}>Winner</th>
            <th style={{ padding: "8px 10px", textAlign: "left", color: colorB, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{nameB}</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map(({ season, sA, sB, winner }) => (
            <tr key={season} style={{ borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fafafa", fontVariantNumeric: "tabular-nums" }}>{season}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: winner === "A" ? colorA : "#aaa", fontWeight: winner === "A" ? 700 : 400 }}>
                  {sA.wins}W · {Math.round(sA.normalizedPoints)}pts
                  {sA.championship_position === 1 && <span style={{ color: "#f59e0b", marginLeft: 4 }}>★</span>}
                </span>
              </td>
              <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 16 }}>
                {winner === "A" ? <span style={{ color: colorA }}>◀</span> : winner === "B" ? <span style={{ color: colorB }}>▶</span> : <span style={{ color: "#444" }}>—</span>}
              </td>
              <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: winner === "B" ? colorB : "#aaa", fontWeight: winner === "B" ? 700 : 400 }}>
                  {sB.wins}W · {Math.round(sB.normalizedPoints)}pts
                  {sB.championship_position === 1 && <span style={{ color: "#f59e0b", marginLeft: 4 }}>★</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────

function ComparisonJsonLd({
  nameA,
  nameB,
  slug,
}: {
  nameA: string;
  nameB: string;
  slug: string;
}) {
  const BASE = getSiteUrl();
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${nameA} vs ${nameB} — F1 Team Comparison`,
    url: `${BASE}/compare/teams/${slug}`,
    description: `All-time Formula 1 head-to-head comparison between ${nameA} and ${nameB}.`,
    about: [
      { "@type": "SportsOrganization", name: nameA, sport: "Formula 1" },
      { "@type": "SportsOrganization", name: nameB, sport: "Formula 1" },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function TeamComparePage({ params }: { params: { slug: string } }) {
  if (!hasPublicSupabaseConfig()) notFound();

  const parsed = parseTeamSlug(params.slug);
  if (!parsed) notFound();

  // Canonical redirect
  const canonicalSlug = buildTeamSlug(parsed.refA, parsed.refB);
  if (params.slug !== canonicalSlug) {
    redirect(`/compare/teams/${canonicalSlug}`);
  }

  const result = await getOrComputeTeamComparison(parsed.refA, parsed.refB);
  if (!result) notFound();

  const { statsA, statsB, constructorA, constructorB, sharedSeasons, radarMetrics } = result;
  const colorA = constructorA.color_hex ?? getTeamColor(constructorA.constructor_ref);
  const colorB = constructorB.color_hex ?? getTeamColor(constructorB.constructor_ref);

  // Related rivalries
  const relatedPairs = RIVALRY_PAIRS
    .filter(([a, b]) => (a !== parsed.refA || b !== parsed.refB) && (a !== parsed.refB || b !== parsed.refA))
    .slice(0, 6)
    .map(([a, b]) => ({ slug: buildTeamSlug(a, b), refA: a, refB: b }));

  const relatedRefs = Array.from(new Set(relatedPairs.flatMap((p) => [p.refA, p.refB])));
  const supabase = createServerClient();
  const { data: relatedCons } = await supabase
    .from("constructors")
    .select("constructor_ref, name, color_hex")
    .in("constructor_ref", relatedRefs);

  const conMap = new Map<string, { name: string; color: string }>();
  for (const c of (relatedCons ?? []) as { constructor_ref: string; name: string; color_hex: string | null }[]) {
    conMap.set(c.constructor_ref, { name: c.name, color: c.color_hex ?? getTeamColor(c.constructor_ref) });
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>
        <ComparisonJsonLd nameA={constructorA.name} nameB={constructorB.name} slug={canonicalSlug} />

        {/* Breadcrumb */}
        <nav style={{ paddingTop: 24, marginBottom: 24, fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Home</Link>
          <span>/</span>
          <Link href="/compare" style={{ color: "#555", textDecoration: "none" }}>Compare</Link>
          <span>/</span>
          <span style={{ color: "#aaa" }}>{constructorA.name} vs {constructorB.name}</span>
        </nav>

        {/* Hero */}
        <HeadlineHero result={result} colorA={colorA} colorB={colorB} />

        <AdBanner slot="leaderboard" />

        {/* Stats grid */}
        <section style={{ marginBottom: 40 }}>
          <SectionTitle>Career Statistics</SectionTitle>
          <StatGrid statsA={statsA} statsB={statsB} colorA={colorA} colorB={colorB} />
        </section>

        {/* Radar chart */}
        {radarMetrics.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Performance Radar</SectionTitle>
            <DriverRadarChart
              metrics={radarMetrics}
              nameA={constructorA.name}
              nameB={constructorB.name}
              colorA={colorA}
              colorB={colorB}
              maxAxes={6}
            />
          </section>
        )}

        {/* Season-by-season battles */}
        {sharedSeasons.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Season-by-Season Battles</SectionTitle>
            <div style={{ backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
              <SharedSeasonsTable
                statsA={statsA}
                statsB={statsB}
                sharedSeasons={sharedSeasons}
                colorA={colorA}
                colorB={colorB}
                nameA={constructorA.name}
                nameB={constructorB.name}
              />
            </div>
          </section>
        )}

        {sharedSeasons.length === 0 && (
          <section style={{ marginBottom: 40 }}>
            <div style={{ backgroundColor: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 20px" }}>
              <p style={{ fontSize: 14, color: "#555" }}>
                {constructorA.name} and {constructorB.name} competed in different eras — no shared seasons.
              </p>
            </div>
          </section>
        )}

        <AdBanner slot="in-feed" />

        {/* Best drivers for each team */}
        <section style={{ marginBottom: 40 }}>
          <SectionTitle>Notable Drivers</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { stats: statsA, color: colorA, name: constructorA.name, ref: constructorA.constructor_ref },
              { stats: statsB, color: colorB, name: constructorB.name, ref: constructorB.constructor_ref },
            ].map(({ stats, color, name, ref }) => (
              <div key={ref} style={{ backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: color }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color }}>{name}</p>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {stats.driverLineup.slice(0, 5).map((d) => (
                    <div key={d.driverRef} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px" }}>
                      <Link href={`/drivers/${d.driverRef}`} style={{ fontSize: 13, color: d.wins > 0 ? "#fafafa" : "#666", textDecoration: "none", fontWeight: d.wins > 0 ? 600 : 400 }}>
                        {d.name}
                      </Link>
                      <span style={{ fontSize: 11, color: "#444", fontVariantNumeric: "tabular-nums" }}>
                        {d.wins > 0 ? `${d.wins}W · ` : ""}{d.races}R
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 14px", borderTop: "1px solid #1a1a1a" }}>
                  <Link href={`/teams/${ref}`} style={{ fontSize: 12, color: color, textDecoration: "none", fontWeight: 600 }}>
                    Full team profile →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Related rivalries */}
        {relatedPairs.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>More Rivalries</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {relatedPairs.map((p) => {
                const cA = conMap.get(p.refA);
                const cB = conMap.get(p.refB);
                if (!cA || !cB) return null;
                return (
                  <Link
                    key={p.slug}
                    href={`/compare/teams/${p.slug}`}
                    style={{
                      display: "block",
                      backgroundColor: "#0d0d0d",
                      border: "1px solid #1a1a1a",
                      borderRadius: 10,
                      padding: "12px 14px",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: cA.color }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{cA.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <div style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: cB.color }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{cB.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
