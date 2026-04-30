import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDB, hasDB } from "@/lib/db/client";
import { getTeamColor, buildTeamSlug } from "@/lib/data/types";
import { computeTeamStats } from "@/lib/comparison/team-compute";
import type { TeamStats, TeamSeasonStats, TeamDriverEntry } from "@/lib/data/types";
import { getSiteUrl } from "@/lib/site-url";
import { AdBanner } from "@/components/ui/AdBanner";

export const dynamic = "force-static";

// ─── Static params ─────────────────────────────────────────────────────────

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  if (!hasDB()) return [];
  const db = getDB();
  const { results } = await db.prepare(`SELECT constructor_ref FROM constructors`).all<{ constructor_ref: string }>();
  return results.map((r) => ({ slug: r.constructor_ref }));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  if (!hasDB()) return { title: "Team Not Found" };
  const db = getDB();
  const con = await db
    .prepare(`SELECT name, constructor_ref FROM constructors WHERE constructor_ref = ?`)
    .bind(params.slug)
    .first<{ name: string; constructor_ref: string }>();

  if (!con) return { title: "Team Not Found" };

  const name = con.name as string;
  const BASE = getSiteUrl();

  return {
    title: `${name} F1 Career Stats — Wins, Championships & Driver History`,
    description: `All-time Formula 1 statistics for ${name}: wins, poles, podiums, 1-2 finishes, constructor championships, and full driver lineup history.`,
    alternates: { canonical: `${BASE}/teams/${params.slug}` },
    openGraph: {
      title: `${name} — F1 Career Stats`,
      description: `Career stats, championship history and driver lineups for ${name} in Formula 1.`,
      url: `${BASE}/teams/${params.slug}`,
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

// ─── Data fetcher ──────────────────────────────────────────────────────────

async function getConstructor(slug: string) {
  const db = getDB();
  return db
    .prepare(`SELECT id, constructor_ref, name, color_hex FROM constructors WHERE constructor_ref = ?`)
    .bind(slug)
    .first<{ id: string; constructor_ref: string; name: string; color_hex: string | null }>();
}

// ─── UI components ─────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 16, color: "#fafafa" }}>
      {children}
    </h2>
  );
}

function StatPill({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 10,
        padding: "14px 16px",
        minWidth: 90,
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          color: color ?? "#fafafa",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SeasonTable({ seasons, color }: { seasons: TeamSeasonStats[]; color: string }) {
  if (seasons.length === 0) return <p style={{ color: "#555", fontSize: 14 }}>No season data.</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #222" }}>
            {["Season", "Races", "Wins", "Podiums", "Poles", "1-2s", "Pts", "WCC"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", textAlign: "right", color: "#555", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...seasons].reverse().map((s) => (
            <tr key={s.season} style={{ borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: s.championship_position === 1 ? color : "#fafafa", fontVariantNumeric: "tabular-nums" }}>
                {s.season}{s.championship_position === 1 ? " ★" : ""}
              </td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{s.races}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: s.wins > 0 ? "#fafafa" : "#444", fontWeight: s.wins > 0 ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{s.wins}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: s.podiums > 0 ? "#aaa" : "#444", fontVariantNumeric: "tabular-nums" }}>{s.podiums}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: s.poles > 0 ? "#aaa" : "#444", fontVariantNumeric: "tabular-nums" }}>{s.poles}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: s.oneTwos > 0 ? color : "#444", fontWeight: s.oneTwos > 0 ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{s.oneTwos}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "#888", fontVariantNumeric: "tabular-nums" }}>{Math.round(s.normalizedPoints)}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: s.championship_position === 1 ? color : s.championship_position != null ? "#888" : "#444" }}>
                {s.championship_position != null ? `P${s.championship_position}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverLineupTable({ lineup, color }: { lineup: TeamDriverEntry[]; color: string }) {
  if (lineup.length === 0) return <p style={{ color: "#555", fontSize: 14 }}>No driver data.</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #222" }}>
            {["Driver", "Seasons", "Races", "Wins", "Podiums"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", textAlign: h === "Driver" ? "left" : "right", color: "#555", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineup.map((d) => {
            const seasonRange = d.seasons.length > 0
              ? d.seasons.length === 1
                ? `${d.seasons[0]}`
                : `${d.seasons[0]}–${d.seasons[d.seasons.length - 1]}`
              : "—";
            return (
              <tr key={d.driverRef} style={{ borderBottom: "1px solid #1a1a1a" }}>
                <td style={{ padding: "8px 10px" }}>
                  <Link
                    href={`/drivers/${d.driverRef}`}
                    style={{ color: d.wins > 0 ? color : "#aaa", fontWeight: d.wins > 0 ? 700 : 400, textDecoration: "none" }}
                  >
                    {d.name}
                  </Link>
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#555", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{seasonRange}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#888", fontVariantNumeric: "tabular-nums" }}>{d.races}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: d.wins > 0 ? "#fafafa" : "#444", fontWeight: d.wins > 0 ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{d.wins}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: d.podiums > 0 ? "#888" : "#444", fontVariantNumeric: "tabular-nums" }}>{d.podiums}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BestWorstSeasons({ stats, color }: { stats: TeamStats; color: string }) {
  if (!stats.bestSeason && !stats.worstSeason) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {stats.bestSeason && (
        <div style={{ backgroundColor: "#111", border: `1px solid ${color}33`, borderRadius: 10, padding: "14px 16px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Best Season</p>
          <p style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: "-0.03em" }}>{stats.bestSeason.season}</p>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {stats.bestSeason.wins}W · {stats.bestSeason.podiums}P · {stats.bestSeason.poles} poles
          </p>
          {stats.bestSeason.championship_position === 1 && (
            <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 4, fontWeight: 700 }}>★ WCC Champion</p>
          )}
        </div>
      )}
      {stats.worstSeason && stats.worstSeason !== stats.bestSeason && (
        <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 10, padding: "14px 16px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Worst Season</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: "#666", letterSpacing: "-0.03em" }}>{stats.worstSeason.season}</p>
          <p style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            {stats.worstSeason.wins}W · {stats.worstSeason.podiums}P · {Math.round(stats.worstSeason.normalizedPoints)} pts
          </p>
        </div>
      )}
    </div>
  );
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────

function TeamJsonLd({ name, slug }: { name: string; slug: string }) {
  const BASE = getSiteUrl();
  const schema = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name,
    sport: "Formula 1",
    url: `${BASE}/teams/${slug}`,
    sameAs: [`https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

// ─── Top rivalries for this team ──────────────────────────────────────────

const RIVALRY_MAP: Record<string, string[]> = {
  ferrari:    ["mclaren", "red_bull", "mercedes", "williams", "renault"],
  mclaren:    ["ferrari", "williams", "mercedes", "red_bull", "renault"],
  red_bull:   ["mercedes", "ferrari", "mclaren", "renault"],
  mercedes:   ["red_bull", "ferrari", "mclaren", "williams"],
  williams:   ["ferrari", "mclaren", "mercedes", "benetton", "renault"],
  renault:    ["ferrari", "mclaren", "williams", "red_bull"],
  lotus_f1:   ["ferrari", "mclaren", "mercedes", "red_bull"],
  benetton:   ["ferrari", "williams", "mclaren"],
  aston_martin: ["mercedes", "red_bull", "ferrari"],
  alpine:     ["mclaren", "ferrari", "aston_martin"],
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function TeamPage({ params }: { params: { slug: string } }) {
  if (!hasDB()) notFound();

  const con = await getConstructor(params.slug);
  if (!con) notFound();

  const color = con.color_hex ?? getTeamColor(con.constructor_ref);
  const stats = await computeTeamStats(con.id, con.constructor_ref, con.name, color);

  const rivalRefs = RIVALRY_MAP[con.constructor_ref] ?? ["ferrari", "mercedes", "mclaren", "red_bull"].filter((r) => r !== con.constructor_ref);
  const rivalSlugs = rivalRefs.slice(0, 4).map((r) => buildTeamSlug(con.constructor_ref, r));

  const db = getDB();
  const rivalRefsPh = rivalRefs.slice(0, 4).map(() => "?").join(", ");
  const { results: rivals } = await db
    .prepare(`SELECT constructor_ref, name FROM constructors WHERE constructor_ref IN (${rivalRefsPh})`)
    .bind(...rivalRefs.slice(0, 4))
    .all<{ constructor_ref: string; name: string }>();

  const rivalMap = new Map<string, string>();
  for (const r of rivals) rivalMap.set(r.constructor_ref, r.name);

  const era = stats.firstSeason && stats.lastSeason
    ? stats.firstSeason === stats.lastSeason
      ? `${stats.firstSeason}`
      : `${stats.firstSeason}–${stats.lastSeason}`
    : "";

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>
        <TeamJsonLd name={con.name} slug={con.constructor_ref} />

        {/* Breadcrumb */}
        <nav style={{ paddingTop: 24, marginBottom: 24, fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Home</Link>
          <span>/</span>
          <Link href="/teams" style={{ color: "#555", textDecoration: "none" }}>Teams</Link>
          <span>/</span>
          <span style={{ color: "#aaa" }}>{con.name}</span>
        </nav>

        {/* Hero */}
        <header style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ width: 8, height: 56, borderRadius: 4, backgroundColor: color, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#555", marginBottom: 4 }}>
                Formula 1 Constructor{era ? ` · ${era}` : ""}
              </p>
              <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {con.name}
              </h1>
            </div>
          </div>
          {stats.championships > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: `${color}15`, border: `1px solid ${color}33`, borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 700, color }}>
              ★ {stats.championships}× World Constructor{stats.championships !== 1 ? "s" : ""} Champion
            </div>
          )}
        </header>

        {/* Career stats pills */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            <StatPill label="Races" value={stats.totalRaces.toLocaleString()} />
            <StatPill label="Wins" value={stats.wins.toLocaleString()} color={color} />
            <StatPill label="Podiums" value={stats.podiums.toLocaleString()} />
            <StatPill label="Poles" value={stats.poles.toLocaleString()} />
            <StatPill label="1-2 Finishes" value={stats.oneTwos.toLocaleString()} color={color} />
            <StatPill label="Championships" value={stats.championships} color={stats.championships > 0 ? "#f59e0b" : undefined} />
            <StatPill label="Points/Race" value={stats.pointsPerRace} />
            <StatPill label="Podium Rate" value={`${(stats.podiumRate * 100).toFixed(1)}%`} />
          </div>
        </section>

        <AdBanner slot="in-feed" />

        {/* Best/Worst seasons */}
        {(stats.bestSeason || stats.worstSeason) && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Season Highlights</SectionTitle>
            <BestWorstSeasons stats={stats} color={color} />
          </section>
        )}

        {/* Season breakdown */}
        {stats.seasonBreakdown.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Season by Season</SectionTitle>
            <div style={{ backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
              <SeasonTable seasons={stats.seasonBreakdown} color={color} />
            </div>
          </section>
        )}

        {/* Driver lineup */}
        {stats.driverLineup.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Driver Lineup History</SectionTitle>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
              {stats.driverLineup.length} drivers have raced for {con.name} in Formula 1.
            </p>
            <div style={{ backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
              <DriverLineupTable lineup={stats.driverLineup} color={color} />
            </div>
          </section>
        )}

        {/* Compare with rivals */}
        {rivalSlugs.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>Compare With Rivals</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {rivalRefs.slice(0, 4).map((ref, i) => {
                const rivalName = rivalMap.get(ref) ?? ref;
                const rivalColor = getTeamColor(ref);
                return (
                  <Link
                    key={ref}
                    href={`/compare/teams/${rivalSlugs[i]}`}
                    style={{
                      display: "block",
                      backgroundColor: "#111",
                      border: "1px solid #222",
                      borderRadius: 10,
                      padding: "14px 16px",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" }}>vs</span>
                      <div style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: rivalColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>{rivalName}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "#555", marginTop: 8 }}>Head-to-head all time →</p>
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
