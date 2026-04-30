import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getDB, hasDB } from "@/lib/db/client";
import { buildComparisonSlug, buildTeamSlug, getTeamColor } from "@/lib/data/types";
import { DriverSearchBar } from "@/components/home/DriverSearchBar";
import { AdBanner } from "@/components/ui/AdBanner";

export const metadata: Metadata = {
  title: "F1-Versus — Settle F1 Arguments with Data",
  description:
    "Head-to-head Formula 1 driver comparisons powered by real race data. Wins, poles, podiums, consistency — settle the debate with stats.",
};

export const dynamic = "force-static";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TrendingComparison {
  slug: string;
  nameA: string;
  nameB: string;
  lastNameA: string;
  lastNameB: string;
  headshotA: string | null;
  headshotB: string | null;
  colorA: string | null;
  colorB: string | null;
  voteCount: number;
}

interface DriverSearchOption {
  driver_ref: string;
  first_name: string;
  last_name: string;
  nationality: string | null;
  headshot_url: string | null;
  teamName: string | null;
  teamColor: string | null;
  is_current: boolean;
}

interface LatestRace {
  name: string;
  season: number;
  date: string;
  topFinishers: { position: number; firstName: string; lastName: string; teamName: string | null; teamColor: string | null }[];
}

interface SiteStats {
  comparisons: number;
  votes: number;
  drivers: number;
}

// ─── Evergreen popular matchups ────────────────────────────────────────────
// Hardcoded pairs — classic debates that always draw traffic.

const POPULAR_MATCHUPS = [
  { a: "hamilton", b: "verstappen", label: "The Modern Rivalry" },
  { a: "senna", b: "prost", label: "The Greatest Rivalry" },
  { a: "schumacher", b: "hamilton", label: "Record Breakers" },
  { a: "vettel", b: "hamilton", label: "Dual Era Dominance" },
  { a: "alonso", b: "hamilton", label: "2007 Teammates" },
  { a: "leclerc", b: "sainz", label: "Ferrari Showdown" },
];

// ─── Team rivalry cards ────────────────────────────────────────────────────
// Six iconic constructor battles that anchor the new keyword cluster.

const TEAM_RIVALRIES = [
  { a: "ferrari",   b: "mclaren",  label: "The Greatest Team Rivalry" },
  { a: "mercedes",  b: "red_bull", label: "Hybrid Era Dominance" },
  { a: "ferrari",   b: "williams", label: "1990s Powerhouse Clash" },
  { a: "ferrari",   b: "renault",  label: "Schumacher vs Alonso Era" },
  { a: "mclaren",   b: "williams", label: "British Giants" },
  { a: "lotus_f1",  b: "ferrari",  label: "Classic 60s Rivalry" },
];

// ─── Data fetchers ─────────────────────────────────────────────────────────

async function getTrendingComparisons(): Promise<TrendingComparison[]> {
  if (!hasDB()) return getFallbackComparisons();

  const db = getDB();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { results: voteCounts } = await db
    .prepare(`SELECT comparison_slug FROM votes WHERE created_at >= ?`)
    .bind(oneWeekAgo)
    .all<{ comparison_slug: string }>();

  if (voteCounts.length === 0) return getFallbackComparisons();

  const countMap = new Map<string, number>();
  for (const row of voteCounts) {
    countMap.set(row.comparison_slug, (countMap.get(row.comparison_slug) ?? 0) + 1);
  }

  const topSlugs = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug]) => slug);

  if (topSlugs.length === 0) return getFallbackComparisons();

  const slugPlaceholders = topSlugs.map(() => "?").join(", ");
  const { results: comps } = await db
    .prepare(
      `SELECT dc.slug,
              da.driver_ref AS a_ref, da.first_name AS a_first, da.last_name AS a_last, da.headshot_url AS a_headshot,
              db.driver_ref AS b_ref, db.first_name AS b_first, db.last_name AS b_last, db.headshot_url AS b_headshot
       FROM driver_comparisons dc
       JOIN drivers da ON da.id = dc.driver_a_id
       JOIN drivers db ON db.id = dc.driver_b_id
       WHERE dc.slug IN (${slugPlaceholders}) AND dc.season IS NULL`
    )
    .bind(...topSlugs)
    .all<{
      slug: string;
      a_ref: string; a_first: string; a_last: string; a_headshot: string | null;
      b_ref: string; b_first: string; b_last: string; b_headshot: string | null;
    }>();

  // Fetch last known team color per driver
  const allRefs = comps.flatMap((c) => [c.a_ref, c.b_ref]);
  const colorByDriver = new Map<string, string>();
  if (allRefs.length > 0) {
    const refPlaceholders = allRefs.map(() => "?").join(", ");
    const { results: colorRows } = await db
      .prepare(
        `SELECT d.driver_ref, c.color_hex
         FROM results r
         JOIN drivers d ON d.id = r.driver_id
         JOIN constructors c ON c.id = r.constructor_id
         WHERE d.driver_ref IN (${refPlaceholders}) AND r.is_sprint = 0
         ORDER BY r.race_id DESC`
      )
      .bind(...allRefs)
      .all<{ driver_ref: string; color_hex: string }>();

    for (const row of colorRows) {
      if (!colorByDriver.has(row.driver_ref) && row.color_hex)
        colorByDriver.set(row.driver_ref, row.color_hex);
    }
  }

  return topSlugs
    .map((slug) => {
      const comp = comps.find((c) => c.slug === slug);
      if (!comp) return null;
      return {
        slug,
        nameA: `${comp.a_first} ${comp.a_last}`,
        nameB: `${comp.b_first} ${comp.b_last}`,
        lastNameA: comp.a_last,
        lastNameB: comp.b_last,
        headshotA: comp.a_headshot,
        headshotB: comp.b_headshot,
        colorA: colorByDriver.get(comp.a_ref) ?? null,
        colorB: colorByDriver.get(comp.b_ref) ?? null,
        voteCount: countMap.get(slug) ?? 0,
      };
    })
    .filter(Boolean) as TrendingComparison[];
}

async function getFallbackComparisons(): Promise<TrendingComparison[]> {
  if (!hasDB()) return [];

  const db = getDB();
  const { results } = await db
    .prepare(
      `SELECT dc.slug,
              da.driver_ref AS a_ref, da.first_name AS a_first, da.last_name AS a_last, da.headshot_url AS a_headshot,
              db.driver_ref AS b_ref, db.first_name AS b_first, db.last_name AS b_last, db.headshot_url AS b_headshot
       FROM driver_comparisons dc
       JOIN drivers da ON da.id = dc.driver_a_id
       JOIN drivers db ON db.id = dc.driver_b_id
       WHERE dc.season IS NULL
       ORDER BY dc.last_computed_at DESC
       LIMIT 10`
    )
    .all<{
      slug: string;
      a_ref: string; a_first: string; a_last: string; a_headshot: string | null;
      b_ref: string; b_first: string; b_last: string; b_headshot: string | null;
    }>();

  return results.map((c) => ({
    slug: c.slug,
    nameA: `${c.a_first} ${c.a_last}`,
    nameB: `${c.b_first} ${c.b_last}`,
    lastNameA: c.a_last,
    lastNameB: c.b_last,
    headshotA: c.a_headshot,
    headshotB: c.b_headshot,
    colorA: null,
    colorB: null,
    voteCount: 0,
  }));
}

async function getDriversForSearch(): Promise<DriverSearchOption[]> {
  if (!hasDB()) return [];

  const db = getDB();
  const currentYear = new Date().getFullYear();

  const { results: drivers } = await db
    .prepare(`SELECT id, driver_ref, first_name, last_name, nationality, headshot_url FROM drivers ORDER BY last_name`)
    .all<{ id: string; driver_ref: string; first_name: string; last_name: string; nationality: string | null; headshot_url: string | null }>();

  if (drivers.length === 0) return [];

  const { results: currentResults } = await db
    .prepare(
      `SELECT DISTINCT r.driver_id FROM results r
       JOIN races rc ON rc.id = r.race_id
       WHERE rc.season = ? AND r.is_sprint = 0`
    )
    .bind(currentYear)
    .all<{ driver_id: string }>();

  const currentIds = new Set(currentResults.map((r) => r.driver_id));

  // Most recent team per driver
  const { results: latestResults } = await db
    .prepare(
      `SELECT r.driver_id, c.name AS team_name, c.color_hex AS team_color
       FROM results r
       JOIN constructors c ON c.id = r.constructor_id
       JOIN races rc ON rc.id = r.race_id
       WHERE r.is_sprint = 0
       ORDER BY rc.season DESC, rc.round DESC`
    )
    .all<{ driver_id: string; team_name: string | null; team_color: string | null }>();

  const teamMap = new Map<string, { name: string | null; color: string | null }>();
  for (const r of latestResults) {
    if (!teamMap.has(r.driver_id)) teamMap.set(r.driver_id, { name: r.team_name, color: r.team_color });
  }

  const result: DriverSearchOption[] = drivers.map((d) => ({
    driver_ref: d.driver_ref,
    first_name: d.first_name,
    last_name: d.last_name,
    nationality: d.nationality,
    headshot_url: d.headshot_url,
    teamName: teamMap.get(d.id)?.name ?? null,
    teamColor: teamMap.get(d.id)?.color ?? null,
    is_current: currentIds.has(d.id),
  }));

  result.sort((a, b) => {
    if (a.is_current && !b.is_current) return -1;
    if (!a.is_current && b.is_current) return 1;
    return a.last_name.localeCompare(b.last_name);
  });

  return result;
}

async function getLatestRace(): Promise<LatestRace | null> {
  if (!hasDB()) return null;

  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const race = await db
    .prepare(`SELECT id, name, season, date FROM races WHERE date <= ? ORDER BY date DESC LIMIT 1`)
    .bind(today)
    .first<{ id: string; name: string; season: number; date: string }>();

  if (!race) return null;

  const { results } = await db
    .prepare(
      `SELECT r.position, d.first_name, d.last_name, c.name AS team_name, c.color_hex AS team_color
       FROM results r
       JOIN drivers d ON d.id = r.driver_id
       JOIN constructors c ON c.id = r.constructor_id
       WHERE r.race_id = ? AND r.is_sprint = 0 AND r.position IS NOT NULL
       ORDER BY r.position ASC LIMIT 5`
    )
    .bind(race.id)
    .all<{ position: number; first_name: string; last_name: string; team_name: string | null; team_color: string | null }>();

  const topFinishers = results.map((r) => ({
    position: r.position,
    firstName: r.first_name,
    lastName: r.last_name,
    teamName: r.team_name,
    teamColor: r.team_color,
  }));

  return { name: race.name, season: race.season, date: race.date, topFinishers };
}

async function getSiteStats(): Promise<SiteStats> {
  if (!hasDB()) return { comparisons: 0, votes: 0, drivers: 0 };

  const db = getDB();
  const [compsRow, votesRow, driversRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM driver_comparisons WHERE season IS NULL`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM votes`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM drivers`).first<{ n: number }>(),
  ]);

  return {
    comparisons: compsRow?.n ?? 0,
    votes: votesRow?.n ?? 0,
    drivers: driversRow?.n ?? 0,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const [trending, drivers, latestRace, stats] = await Promise.all([
    getTrendingComparisons(),
    getDriversForSearch(),
    getLatestRace(),
    getSiteStats(),
  ]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: 48,
            paddingBottom: 48,
            textAlign: "center",
            position: "relative",
          }}
        >
          {/* Background glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 800,
              height: 400,
              background: "radial-gradient(ellipse at 50% 0%, rgba(225,6,0,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Eyebrow */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--accent)",
              backgroundColor: "rgba(225,6,0,0.1)",
              border: "1px solid rgba(225,6,0,0.2)",
              borderRadius: 20,
              padding: "4px 12px",
              marginBottom: 20,
            }}
          >
            {/* Checkered flag */}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="0" y="0" width="5" height="5" />
              <rect x="5" y="5" width="5" height="5" />
            </svg>
            F1 Data · Every Season · 1950–Present
          </div>

          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 72px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginBottom: 16,
            }}
          >
            Settle F1 arguments
            <br />
            <span style={{ color: "var(--accent)" }}>with data.</span>
          </h1>

          <p
            style={{
              fontSize: "clamp(14px, 4vw, 17px)",
              color: "#888",
              maxWidth: 520,
              margin: "0 auto 40px",
              lineHeight: 1.6,
            }}
          >
            Head-to-head comparisons for every Formula 1 driver pairing in
            history. Wins, poles, consistency, teammate records — all in one place.
          </p>

          {/* Search bar */}
          <DriverSearchBar drivers={drivers} />

          {/* Quick stats strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 32,
              marginTop: 28,
              flexWrap: "wrap",
            }}
          >
            {[
              { value: stats.drivers.toLocaleString(), label: "drivers" },
              { value: stats.comparisons.toLocaleString(), label: "comparisons" },
              { value: stats.votes.toLocaleString(), label: "votes cast" },
            ].map(({ value, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Ad: Leaderboard (728×90 / 320×50 on mobile) ──────────────── */}
        <div style={{ marginBottom: 48 }}>
          <AdBanner slot="leaderboard" />
        </div>

        {/* ── Trending Comparisons ──────────────────────────────────────── */}
        {trending.length > 0 && (
          <section style={{ marginBottom: 64 }}>
            <SectionHeader
              title="Trending This Week"
              subtitle="Most-voted comparisons in the last 7 days"
              href="/drivers"
              hrefLabel="See all →"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {trending.map((comp, i) => (
                <TrendingCard key={comp.slug} comp={comp} rank={i + 1} />
              ))}
            </div>
          </section>
        )}

        {/* ── Latest Race Impact ────────────────────────────────────────── */}
        {latestRace && (
          <section style={{ marginBottom: 64 }}>
            <SectionHeader
              title={`${latestRace.name} ${latestRace.season}`}
              subtitle={`Latest race · ${new Date(latestRace.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
            />
            <div
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Top 5 podium */}
              <div style={{ padding: "16px 0" }}>
                {latestRace.topFinishers.map((f, i) => (
                  <RaceResultRow key={i} finisher={f} drivers={drivers} />
                ))}
              </div>
              <div
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid var(--border)",
                  backgroundColor: "var(--surface-elevated)",
                }}
              >
                <p style={{ fontSize: 12, color: "#555" }}>
                  Compare any of these drivers head-to-head →
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {latestRace.topFinishers.slice(0, 3).flatMap((a, i) =>
                    latestRace.topFinishers.slice(i + 1, 3).map((b) => {
                      const refs = [
                        drivers.find((d) => d.last_name === a.lastName)?.driver_ref,
                        drivers.find((d) => d.last_name === b.lastName)?.driver_ref,
                      ].filter(Boolean) as string[];
                      if (refs.length < 2) return null;
                      const slug = buildComparisonSlug(refs[0], refs[1]);
                      return (
                        <Link
                          key={slug}
                          href={`/compare/${slug}`}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--muted-foreground)",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            padding: "4px 10px",
                            textDecoration: "none",
                            transition: "color 0.15s",
                          }}
                        >
                          {a.lastName} vs {b.lastName}
                        </Link>
                      );
                    })
                  ).filter(Boolean)}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Popular Matchups ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <SectionHeader
            title="Popular Matchups"
            subtitle="Classic debates — settled by data"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {POPULAR_MATCHUPS.map(({ a, b, label }) => {
              const dA = drivers.find((d) => d.driver_ref === a || d.driver_ref.includes(a));
              const dB = drivers.find((d) => d.driver_ref === b || d.driver_ref.includes(b));
              if (!dA || !dB) return null;
              const slug = buildComparisonSlug(dA.driver_ref, dB.driver_ref);
              return (
                <MatchupCard
                  key={slug}
                  slug={slug}
                  driverA={dA}
                  driverB={dB}
                  label={label}
                />
              );
            })}
          </div>
        </section>

        {/* ── Team Rivalries ───────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <SectionHeader
            title="Team Rivalries"
            subtitle="Constructor head-to-heads across every season"
            href="/teams"
            hrefLabel="All teams →"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {TEAM_RIVALRIES.map(({ a, b, label }) => {
              const slug = buildTeamSlug(a, b);
              const colorA = getTeamColor(a);
              const colorB = getTeamColor(b);
              return (
                <Link
                  key={slug}
                  href={`/compare/teams/${slug}`}
                  style={{
                    display: "block",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "16px",
                    textDecoration: "none",
                    transition: "border-color 0.15s",
                  }}
                >
                  {/* Colored bars */}
                  <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colorA }} />
                    <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colorB }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: colorA }}>
                      {a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 900, color: "#333", letterSpacing: "0.12em" }}>VS</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: colorB }}>
                      {b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{label}</p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Browse CTA ────────────────────────────────────────────────── */}
        <section>
          <div
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "clamp(24px, 5vw, 48px) clamp(16px, 5vw, 40px)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
            <h2
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                marginBottom: 10,
                position: "relative",
              }}
            >
              {stats.drivers.toLocaleString()} drivers. Every era.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "#666",
                marginBottom: 24,
                position: "relative",
              }}
            >
              From Fangio to Verstappen — browse all drivers and build any matchup.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
              <Link
                href="/drivers"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 24px",
                  backgroundColor: "var(--accent)",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
              >
                Browse All Drivers →
              </Link>
              <Link
                href="/rankings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 24px",
                  backgroundColor: "var(--surface-elevated)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
              >
                All-Time Rankings
              </Link>
              <Link
                href="/teams"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 24px",
                  backgroundColor: "var(--surface-elevated)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
              >
                Browse Teams
              </Link>
            </div>
          </div>
        </section>

      </div>

      {/* ── Sticky footer ad (mobile only, 320×50) ───────────────────────── */}
      <div className="ad-sticky-footer-wrapper">
        <AdBanner slot="sticky-footer" />
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  href,
  hrefLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 16,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 2,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: 13, color: "#555" }}>{subtitle}</p>
        )}
      </div>
      {href && hrefLabel && (
        <Link
          href={href}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

function DriverAvatar({
  headshot,
  name,
  color,
  size = 40,
}: {
  headshot: string | null;
  name: string;
  color: string | null;
  size?: number;
}) {
  const initial = name.split(" ").pop()?.[0] ?? "?";
  return headshot ? (
    <Image
      src={headshot}
      alt={name}
      width={size}
      height={size}
      style={{
        borderRadius: "50%",
        objectFit: "cover",
        border: `2px solid ${color ?? "#333"}`,
        flexShrink: 0,
      }}
      loading="lazy"
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#1a1a1a",
        border: `2px solid ${color ?? "#333"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 800,
        color: color ?? "#666",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function TrendingCard({
  comp,
  rank,
}: {
  comp: TrendingComparison;
  rank: number;
}) {
  return (
    <Link
      href={`/compare/${comp.slug}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        textDecoration: "none",
        transition: "border-color 0.15s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Left accent line */}
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

      {/* Rank */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: rank <= 3 ? "#fff" : "#444",
          backgroundColor: rank <= 3 ? "var(--accent)" : "transparent",
          borderRadius: 4,
          padding: rank <= 3 ? "1px 5px" : "0",
          minWidth: 18,
          textAlign: "center",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rank}
      </span>

      {/* Driver A */}
      <DriverAvatar
        headshot={comp.headshotA}
        name={comp.nameA}
        color={comp.colorA}
        size={36}
      />

      {/* Names */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span style={{ color: comp.colorA ?? "#fff", whiteSpace: "nowrap" }}>
            {comp.lastNameA}
          </span>
          <span style={{ fontSize: 9, color: "#444", fontWeight: 900, letterSpacing: "0.08em" }}>VS</span>
          <span style={{ color: comp.colorB ?? "#fff", whiteSpace: "nowrap" }}>
            {comp.lastNameB}
          </span>
        </div>
        {comp.voteCount > 0 && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            {comp.voteCount.toLocaleString()} vote{comp.voteCount !== 1 ? "s" : ""} this week
          </div>
        )}
      </div>

      {/* Driver B */}
      <DriverAvatar
        headshot={comp.headshotB}
        name={comp.nameB}
        color={comp.colorB}
        size={36}
      />

      {/* Arrow */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#333", flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

function RaceResultRow({
  finisher,
  drivers,
}: {
  finisher: LatestRace["topFinishers"][0];
  drivers: DriverSearchOption[];
}) {
  const driver = drivers.find((d) => d.last_name === finisher.lastName);
  const color = finisher.teamColor ?? "#666";

  const medal =
    finisher.position === 1
      ? "🥇"
      : finisher.position === 2
      ? "🥈"
      : finisher.position === 3
      ? "🥉"
      : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 20px",
        borderBottom: "1px solid #111",
      }}
    >
      {/* Position */}
      <div
        style={{
          width: 28,
          textAlign: "center",
          fontSize: 14,
          fontWeight: 800,
          color: finisher.position <= 3 ? color : "#555",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {medal ?? `P${finisher.position}`}
      </div>

      {/* Avatar */}
      <DriverAvatar
        headshot={driver?.headshot_url ?? null}
        name={`${finisher.firstName} ${finisher.lastName}`}
        color={color}
        size={34}
      />

      {/* Name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: "#888", fontWeight: 400 }}>{finisher.firstName} </span>
          {finisher.lastName}
        </div>
        {finisher.teamName && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#555" }}>{finisher.teamName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchupCard({
  slug,
  driverA,
  driverB,
  label,
}: {
  slug: string;
  driverA: DriverSearchOption;
  driverB: DriverSearchOption;
  label: string;
}) {
  return (
    <Link
      href={`/compare/${slug}`}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        textDecoration: "none",
        transition: "border-color 0.15s, background-color 0.15s",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Split background tint */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${driverA.teamColor ? `${driverA.teamColor}08` : "transparent"} 0%, transparent 50%, ${driverB.teamColor ? `${driverB.teamColor}08` : "transparent"} 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Label */}
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
        {label}
      </span>

      {/* Drivers row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
          <DriverAvatar
            headshot={driverA.headshot_url}
            name={`${driverA.first_name} ${driverA.last_name}`}
            color={driverA.teamColor}
            size={44}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: driverA.teamColor ?? "#fff" }}>
            {driverA.last_name}
          </span>
        </div>

        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid #222",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 900, color: "#444", letterSpacing: "0.06em" }}>VS</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
          <DriverAvatar
            headshot={driverB.headshot_url}
            name={`${driverB.first_name} ${driverB.last_name}`}
            color={driverB.teamColor}
            size={44}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: driverB.teamColor ?? "#fff" }}>
            {driverB.last_name}
          </span>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#555" }}>Compare →</span>
      </div>
    </Link>
  );
}
