import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { buildComparisonSlug } from "@/lib/data/types";
import { DriverSearchBar } from "@/components/home/DriverSearchBar";
import { AdBanner } from "@/components/ui/AdBanner";

export const metadata: Metadata = {
  title: "GridRival — Settle F1 Arguments with Data",
  description:
    "Head-to-head Formula 1 driver comparisons powered by real race data. Wins, poles, podiums, consistency — settle the debate with stats.",
};

// Revalidate every hour so trending + stats stay fresh
export const revalidate = 3600;

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

// ─── Data fetchers ─────────────────────────────────────────────────────────

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getTrendingComparisons(): Promise<TrendingComparison[]> {
  if (!hasPublicSupabaseConfig()) {
    return [];
  }

  const supabase = getServiceClient(); // service role needed to read votes
  if (!supabase) {
    return getFallbackComparisons();
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get vote counts per slug in the last 7 days
  const { data: voteCounts } = await supabase
    .from("votes")
    .select("comparison_slug")
    .gte("created_at", oneWeekAgo);

  if (!voteCounts || voteCounts.length === 0) {
    // Fallback: return most recently computed comparisons
    return getFallbackComparisons();
  }

  // Aggregate
  const countMap = new Map<string, number>();
  for (const row of voteCounts) {
    countMap.set(
      row.comparison_slug,
      (countMap.get(row.comparison_slug) ?? 0) + 1
    );
  }

  // Top 10 slugs by vote count
  const topSlugs = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug]) => slug);

  if (topSlugs.length === 0) return getFallbackComparisons();

  // Fetch comparison records + driver data + team colors
  const publicClient = createServerClient();
  const { data: comps } = await publicClient
    .from("driver_comparisons")
    .select(
      `slug,
       driver_a:drivers!driver_comparisons_driver_a_id_fkey(driver_ref, first_name, last_name, headshot_url),
       driver_b:drivers!driver_comparisons_driver_b_id_fkey(driver_ref, first_name, last_name, headshot_url)`
    )
    .in("slug", topSlugs)
    .is("season", null);

  if (!comps) return getFallbackComparisons();

  // Fetch team colors for these drivers
  type DriverRow = { driver_ref: string; first_name: string; last_name: string; headshot_url: string | null };
  const driverRefs = comps.flatMap((c) => [
    (c.driver_a as unknown as DriverRow).driver_ref,
    (c.driver_b as unknown as DriverRow).driver_ref,
  ]);

  const { data: colorRows } = await publicClient
    .from("results")
    .select(
      `drivers!inner(driver_ref),
       constructors!inner(color_hex)`
    )
    .in("drivers.driver_ref", driverRefs)
    .eq("is_sprint", false)
    .order("race_id", { ascending: false });

  const colorByDriver = new Map<string, string>();
  for (const row of colorRows ?? []) {
    const ref = (row.drivers as unknown as { driver_ref: string }).driver_ref;
    const color = (row.constructors as unknown as { color_hex: string }).color_hex;
    if (!colorByDriver.has(ref) && color) colorByDriver.set(ref, color);
  }

  return topSlugs
    .map((slug) => {
      const comp = comps.find((c) => c.slug === slug);
      if (!comp) return null;
      const dA = comp.driver_a as unknown as DriverRow;
      const dB = comp.driver_b as unknown as DriverRow;
      return {
        slug,
        nameA: `${dA.first_name} ${dA.last_name}`,
        nameB: `${dB.first_name} ${dB.last_name}`,
        lastNameA: dA.last_name,
        lastNameB: dB.last_name,
        headshotA: dA.headshot_url,
        headshotB: dB.headshot_url,
        colorA: colorByDriver.get(dA.driver_ref) ?? null,
        colorB: colorByDriver.get(dB.driver_ref) ?? null,
        voteCount: countMap.get(slug) ?? 0,
      };
    })
    .filter(Boolean) as TrendingComparison[];
}

async function getFallbackComparisons(): Promise<TrendingComparison[]> {
  if (!hasPublicSupabaseConfig()) {
    return [];
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from("driver_comparisons")
    .select(
      `slug,
       driver_a:drivers!driver_comparisons_driver_a_id_fkey(driver_ref, first_name, last_name, headshot_url),
       driver_b:drivers!driver_comparisons_driver_b_id_fkey(driver_ref, first_name, last_name, headshot_url)`
    )
    .is("season", null)
    .order("last_computed_at", { ascending: false })
    .limit(10);

  if (!data) return [];

  type DriverRow = { driver_ref: string; first_name: string; last_name: string; headshot_url: string | null };
  return data.map((c) => {
    const dA = c.driver_a as unknown as DriverRow;
    const dB = c.driver_b as unknown as DriverRow;
    return {
      slug: c.slug as string,
      nameA: `${dA.first_name} ${dA.last_name}`,
      nameB: `${dB.first_name} ${dB.last_name}`,
      lastNameA: dA.last_name,
      lastNameB: dB.last_name,
      headshotA: dA.headshot_url,
      headshotB: dB.headshot_url,
      colorA: null,
      colorB: null,
      voteCount: 0,
    };
  });
}

async function getDriversForSearch(): Promise<DriverSearchOption[]> {
  if (!hasPublicSupabaseConfig()) {
    return [];
  }

  const supabase = createServerClient();
  const currentYear = new Date().getFullYear();

  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, driver_ref, first_name, last_name, nationality, headshot_url")
    .order("last_name");

  if (!drivers) return [];

  // Current season drivers
  const { data: currentResults } = await supabase
    .from("results")
    .select("driver_id, races!inner(season)")
    .eq("races.season", currentYear)
    .eq("is_sprint", false);

  const currentIds = new Set(
    (currentResults ?? []).map((r: { driver_id: number }) => r.driver_id)
  );

  // Most recent team per driver
  const { data: latestResults } = await supabase
    .from("results")
    .select(
      `driver_id,
       races!inner(season),
       constructors(name, color_hex)`
    )
    .eq("is_sprint", false)
    .order("races.season", { ascending: false });

  const teamMap = new Map<number, { name: string | null; color: string | null }>();
  for (const r of latestResults ?? []) {
    if (!teamMap.has(r.driver_id)) {
      const con = Array.isArray(r.constructors) ? r.constructors[0] : r.constructors;
      teamMap.set(r.driver_id, { name: con?.name ?? null, color: con?.color_hex ?? null });
    }
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

  // Current drivers first, then alphabetical
  result.sort((a, b) => {
    if (a.is_current && !b.is_current) return -1;
    if (!a.is_current && b.is_current) return 1;
    return a.last_name.localeCompare(b.last_name);
  });

  return result;
}

async function getLatestRace(): Promise<LatestRace | null> {
  if (!hasPublicSupabaseConfig()) {
    return null;
  }

  const supabase = createServerClient();

  const today = new Date().toISOString().slice(0, 10);
  const { data: race } = await supabase
    .from("races")
    .select("id, name, season, date, circuit_id")
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(1)
    .single();

  if (!race) return null;

  const { data: results } = await supabase
    .from("results")
    .select(
      `position,
       drivers(first_name, last_name),
       constructors(name, color_hex)`
    )
    .eq("race_id", race.id)
    .eq("is_sprint", false)
    .not("position", "is", null)
    .order("position", { ascending: true })
    .limit(5);

  if (!results) return null;

  type RRow = {
    position: number;
    drivers: { first_name: string; last_name: string } | null;
    constructors: { name: string; color_hex: string | null } | null;
  };

  const topFinishers = (results as unknown as RRow[])
    .filter((r) => r.drivers)
    .map((r) => ({
      position: r.position,
      firstName: r.drivers!.first_name,
      lastName: r.drivers!.last_name,
      teamName: r.constructors?.name ?? null,
      teamColor: r.constructors?.color_hex ?? null,
    }));

  return {
    name: race.name,
    season: race.season,
    date: race.date,
    topFinishers,
  };
}

async function getSiteStats(): Promise<SiteStats> {
  if (!hasPublicSupabaseConfig()) {
    return { comparisons: 0, votes: 0, drivers: 0 };
  }

  const supabase = createServerClient();
  const serviceClient = getServiceClient();

  const [
    { count: comparisons },
    votesResult,
    { count: drivers },
  ] = await Promise.all([
    supabase
      .from("driver_comparisons")
      .select("id", { count: "exact", head: true })
      .is("season", null),
    serviceClient
      ? serviceClient.from("votes").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true }),
  ]);

  return {
    comparisons: comparisons ?? 0,
    votes: votesResult.count ?? 0,
    drivers: drivers ?? 0,
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
