import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { buildComparisonSlug, getTeamColor } from "@/lib/data/types";
import type { SeasonStats, AllTimeTeammateRecord } from "@/lib/data/types";
import { getSiteUrl } from "@/lib/site-url";
import { AdBanner } from "@/components/ui/AdBanner";
import { DriverSeasonChart } from "@/components/drivers/DriverSeasonChart";

export const dynamic = "force-static";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DriverProfile {
  id: string;
  driver_ref: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  nationality: string | null;
  headshot_url: string | null;
}

interface DriverCareerStats {
  totalRaces: number;
  wins: number;
  poles: number;
  podiums: number;
  dnfs: number;
  championships: number;
  totalPoints: number;
  firstSeason: number | null;
  lastSeason: number | null;
  teamColor: string;
  teamName: string | null;
  seasonBreakdown: SeasonStats[];
}

interface TopCircuit {
  circuitRef: string;
  circuitName: string;
  country: string | null;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  avgFinish: number | null;
}

interface Rival {
  driver_ref: string;
  first_name: string;
  last_name: string;
  headshot_url: string | null;
  teamColor: string | null;
  comparisonSlug: string;
  sharedRaces: number;
}

// ─── generateStaticParams ──────────────────────────────────────────────────

export async function generateStaticParams(): Promise<{ ref: string }[]> {
  if (!hasPublicSupabaseConfig()) return [];

  const supabase = createServerClient();

  // Count race starts per driver
  const { data: raceCounts } = await supabase
    .from("results")
    .select("driver_id")
    .eq("is_sprint", false);

  if (!raceCounts) return [];

  const countMap = new Map<string, number>();
  for (const r of raceCounts) {
    countMap.set(r.driver_id, (countMap.get(r.driver_id) ?? 0) + 1);
  }

  // Drivers with ≥20 starts
  const eligibleIds = Array.from(countMap.entries())
    .filter(([, n]) => n >= 20)
    .map(([id]) => id);

  if (eligibleIds.length === 0) return [];

  // Fetch refs in chunks
  const refs: string[] = [];
  for (let i = 0; i < eligibleIds.length; i += 200) {
    const { data } = await supabase
      .from("drivers")
      .select("driver_ref")
      .in("id", eligibleIds.slice(i, i + 200));
    for (const d of data ?? []) {
      if (d.driver_ref) refs.push(d.driver_ref);
    }
  }

  return refs.map((ref) => ({ ref }));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { ref: string };
}): Promise<Metadata> {
  if (!hasPublicSupabaseConfig()) return { title: "F1 Driver" };

  const supabase = createServerClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("first_name, last_name, nationality")
    .eq("driver_ref", params.ref)
    .single();

  if (!driver) return { title: "F1 Driver Not Found" };

  const name = `${driver.first_name} ${driver.last_name}`;
  const title = `${name} — F1 Career Stats, Wins, Poles, Teammate Record | F1-Versus`;
  const description =
    `${name} Formula 1 career stats: wins, poles, podiums, championship positions, ` +
    `teammate battle record, circuit breakdown and season-by-season history.` +
    (driver.nationality ? ` ${driver.nationality} driver.` : "");

  const canonicalUrl = `${getSiteUrl()}/drivers/${params.ref}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonicalUrl,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// ─── Data fetching ─────────────────────────────────────────────────────────

async function getDriverProfile(ref: string): Promise<DriverProfile | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("drivers")
    .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
    .eq("driver_ref", ref)
    .single();
  return (data as DriverProfile | null) ?? null;
}

async function getCareerStats(driverId: string): Promise<DriverCareerStats> {
  const supabase = createServerClient();

  // All non-sprint results with race season + circuit info
  const { data: results } = await supabase
    .from("results")
    .select(
      `position, grid, points, status,
       race:races!inner(season, circuit_id)`
    )
    .eq("driver_id", driverId)
    .eq("is_sprint", false);

  // All qualifying results
  const { data: qualifying } = await supabase
    .from("qualifying")
    .select("position, race_id, race:races!inner(season)")
    .eq("driver_id", driverId);

  type ResultRow = {
    position: number | null;
    grid: number | null;
    points: number;
    status: string | null;
    race: { season: number; circuit_id: string };
  };
  type QualiRow = { position: number | null; race_id: string; race: { season: number } };

  const rows = (results ?? []) as unknown as ResultRow[];
  const qualiRows = (qualifying ?? []) as unknown as QualiRow[];

  // Deduplicate: one pole per race
  const polesBySeason = new Map<number, number>();
  for (const q of qualiRows) {
    if (q.position === 1) {
      const s = q.race.season;
      polesBySeason.set(s, (polesBySeason.get(s) ?? 0) + 1);
    }
  }

  // Season breakdown
  const bySeason = new Map<
    number,
    { races: number; wins: number; podiums: number; points: number }
  >();
  let totalPoints = 0;
  let wins = 0;
  let podiums = 0;
  let dnfs = 0;

  for (const r of rows) {
    const s = r.race.season;
    if (!bySeason.has(s)) bySeason.set(s, { races: 0, wins: 0, podiums: 0, points: 0 });
    const acc = bySeason.get(s)!;
    acc.races++;
    acc.points += r.points;
    totalPoints += r.points;

    if (r.position === 1) { wins++; acc.wins++; }
    if (r.position !== null && r.position <= 3) { podiums++; acc.podiums++; }

    const isDNF =
      r.position === null ||
      (r.status && /accident|collision|engine|gearbox|hydraulics|electrical|suspension|brake|clutch|transmission|mechanical|retired|dnf|disqualified|withdraw|power unit|exhaust|steering|tyres|wheel|fire|spin|overheating|vibration|puncture|damage/i.test(r.status));
    if (isDNF) dnfs++;
  }

  // Championship positions from all-results query
  const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);

  // Season breakdown with poles + championship position (fetched in one go)
  const { data: champData } = await supabase
    .from("results")
    .select("driver_id, points, race:races!inner(season)")
    .in("race.season", seasons)
    .eq("is_sprint", false);

  type ChampRow = { driver_id: string; points: number; race: { season: number } };
  const champRows = (champData ?? []) as unknown as ChampRow[];

  // Aggregate all-driver points per season to rank
  const seasonDriverPoints = new Map<number, Map<string, number>>();
  for (const r of champRows) {
    if (!seasonDriverPoints.has(r.race.season))
      seasonDriverPoints.set(r.race.season, new Map());
    const m = seasonDriverPoints.get(r.race.season)!;
    m.set(r.driver_id, (m.get(r.driver_id) ?? 0) + r.points);
  }

  const champPositions = new Map<number, number>();
  for (const [season, driverMap] of seasonDriverPoints) {
    const ranked = Array.from(driverMap.entries()).sort(([, a], [, b]) => b - a);
    const idx = ranked.findIndex(([id]) => id === driverId);
    if (idx !== -1) champPositions.set(season, idx + 1);
  }

  const championships = Array.from(champPositions.values()).filter((p) => p === 1).length;

  const seasonBreakdown: SeasonStats[] = seasons.map((s) => {
    const acc = bySeason.get(s)!;
    return {
      season: s,
      races: acc.races,
      wins: acc.wins,
      podiums: acc.podiums,
      poles: polesBySeason.get(s) ?? 0,
      points: acc.points,
      normalizedPoints: acc.points,
      championship_position: champPositions.get(s) ?? null,
    };
  });

  const totalPoles = Array.from(polesBySeason.values()).reduce((a, b) => a + b, 0);

  // Most recent team color
  const { data: lastResult } = await supabase
    .from("results")
    .select("constructor:constructors(name, color_hex, constructor_ref)")
    .eq("driver_id", driverId)
    .eq("is_sprint", false)
    .order("race_id", { ascending: false })
    .limit(1)
    .single();

  type ConRow = { name: string; color_hex: string | null; constructor_ref: string };
  const con = lastResult?.constructor as unknown as ConRow | null;
  const teamColor =
    con?.color_hex ?? getTeamColor(con?.constructor_ref ?? "") ?? "#e10600";
  const teamName = con?.name ?? null;

  return {
    totalRaces: rows.length,
    wins,
    poles: totalPoles,
    podiums,
    dnfs,
    championships,
    totalPoints,
    firstSeason: seasons[0] ?? null,
    lastSeason: seasons[seasons.length - 1] ?? null,
    teamColor,
    teamName,
    seasonBreakdown,
  };
}

async function getTopCircuits(driverId: string): Promise<TopCircuit[]> {
  const supabase = createServerClient();

  const { data: results } = await supabase
    .from("results")
    .select(
      `position, grid, points, status,
       race:races!inner(id,
         circuit:circuits(circuit_ref, name, country))`
    )
    .eq("driver_id", driverId)
    .eq("is_sprint", false);

  const { data: qualiRows } = await supabase
    .from("qualifying")
    .select("position, race:races!inner(circuit:circuits(circuit_ref))")
    .eq("driver_id", driverId);

  type Res = {
    position: number | null;
    grid: number | null;
    points: number;
    status: string | null;
    race: { id: string; circuit: { circuit_ref: string; name: string; country: string | null } | null };
  };
  type Quali = { position: number | null; race: { circuit: { circuit_ref: string } | null } };

  const rows = (results ?? []) as unknown as Res[];
  const qrows = (qualiRows ?? []) as unknown as Quali[];

  // Poles per circuit
  const polesByCircuit = new Map<string, number>();
  for (const q of qrows) {
    if (q.position === 1 && q.race?.circuit?.circuit_ref) {
      const ref = q.race.circuit.circuit_ref;
      polesByCircuit.set(ref, (polesByCircuit.get(ref) ?? 0) + 1);
    }
  }

  type Acc = {
    circuitName: string;
    country: string | null;
    races: number;
    wins: number;
    podiums: number;
    finishes: number;
    finishSum: number;
  };
  const byCircuit = new Map<string, Acc>();

  for (const r of rows) {
    const c = r.race.circuit;
    if (!c) continue;
    if (!byCircuit.has(c.circuit_ref)) {
      byCircuit.set(c.circuit_ref, {
        circuitName: c.name,
        country: c.country,
        races: 0,
        wins: 0,
        podiums: 0,
        finishes: 0,
        finishSum: 0,
      });
    }
    const acc = byCircuit.get(c.circuit_ref)!;
    acc.races++;
    if (r.position === 1) acc.wins++;
    if (r.position !== null && r.position <= 3) acc.podiums++;
    if (r.position !== null) { acc.finishes++; acc.finishSum += r.position; }
  }

  return Array.from(byCircuit.entries())
    .map(([ref, acc]) => ({
      circuitRef: ref,
      circuitName: acc.circuitName,
      country: acc.country,
      races: acc.races,
      wins: acc.wins,
      podiums: acc.podiums,
      poles: polesByCircuit.get(ref) ?? 0,
      avgFinish: acc.finishes > 0 ? acc.finishSum / acc.finishes : null,
    }))
    .filter((c) => c.races >= 2)
    .sort((a, b) => {
      // Sort by wins desc, then podiums, then races
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.podiums !== a.podiums) return b.podiums - a.podiums;
      return b.races - a.races;
    })
    .slice(0, 10);
}

async function getTeammateRecords(driverId: string): Promise<AllTimeTeammateRecord[]> {
  const supabase = createServerClient();

  // Get this driver's results (race_id + constructor_id + position)
  const { data: myResults } = await supabase
    .from("results")
    .select("race_id, constructor_id, position")
    .eq("driver_id", driverId)
    .eq("is_sprint", false);

  if (!myResults?.length) return [];

  const myByRace = new Map(
    (myResults as { race_id: string; constructor_id: string; position: number | null }[]).map(
      (r) => [r.race_id, r]
    )
  );
  const myConstructorIds = new Set(myResults.map((r: { constructor_id: string }) => r.constructor_id));
  const raceIds = myResults.map((r: { race_id: string }) => r.race_id);

  // Co-drivers in same races + same constructor
  const { data: tmResults } = await supabase
    .from("results")
    .select(
      `race_id, driver_id, constructor_id, position,
       driver:drivers(driver_ref, first_name, last_name),
       constructor:constructors(name)`
    )
    .in("race_id", raceIds)
    .in("constructor_id", Array.from(myConstructorIds))
    .neq("driver_id", driverId)
    .eq("is_sprint", false);

  const { data: tmQuali } = await supabase
    .from("qualifying")
    .select("race_id, driver_id, constructor_id, position")
    .in("race_id", raceIds)
    .in("constructor_id", Array.from(myConstructorIds))
    .neq("driver_id", driverId);

  const { data: myQuali } = await supabase
    .from("qualifying")
    .select("race_id, position")
    .eq("driver_id", driverId)
    .in("race_id", raceIds);

  const myQualiByRace = new Map(
    (myQuali ?? []).map((q: { race_id: string; position: number | null }) => [q.race_id, q.position])
  );
  const tmQualiByKey = new Map(
    (tmQuali ?? []).map((q: { race_id: string; driver_id: string; position: number | null }) => [
      `${q.race_id}:${q.driver_id}`,
      q.position,
    ])
  );

  type TmRow = {
    race_id: string;
    driver_id: string;
    constructor_id: string;
    position: number | null;
    driver: { driver_ref: string; first_name: string; last_name: string } | null;
    constructor: { name: string } | null;
  };

  type TmAccum = {
    teammateRef: string;
    teammateName: string;
    constructorNames: Set<string>;
    racesCompared: number;
    driverAheadCount: number;
    driverBehindCount: number;
    qualiAheadCount: number;
    qualiBehindCount: number;
  };

  const byTeammate = new Map<string, TmAccum>();

  for (const tr of (tmResults ?? []) as unknown as TmRow[]) {
    const myR = myByRace.get(tr.race_id);
    if (!myR) continue;
    if (myR.constructor_id !== tr.constructor_id) continue;
    if (myR.position === null || tr.position === null) continue;

    const driverData = tr.driver;
    if (!driverData) continue;

    if (!byTeammate.has(tr.driver_id)) {
      byTeammate.set(tr.driver_id, {
        teammateRef: driverData.driver_ref,
        teammateName: `${driverData.first_name} ${driverData.last_name}`,
        constructorNames: new Set(),
        racesCompared: 0,
        driverAheadCount: 0,
        driverBehindCount: 0,
        qualiAheadCount: 0,
        qualiBehindCount: 0,
      });
    }

    const acc = byTeammate.get(tr.driver_id)!;
    acc.constructorNames.add(tr.constructor?.name ?? "");
    acc.racesCompared++;
    if (myR.position < tr.position) acc.driverAheadCount++;
    else if (myR.position > tr.position) acc.driverBehindCount++;

    const myQ = myQualiByRace.get(tr.race_id);
    const tmQ = tmQualiByKey.get(`${tr.race_id}:${tr.driver_id}`);
    if (myQ != null && tmQ != null) {
      if (myQ < tmQ) acc.qualiAheadCount++;
      else if (myQ > tmQ) acc.qualiBehindCount++;
    }
  }

  return Array.from(byTeammate.values())
    .sort((a, b) => b.racesCompared - a.racesCompared)
    .map((acc) => ({
      teammateRef: acc.teammateRef,
      teammateName: acc.teammateName,
      constructorNames: Array.from(acc.constructorNames).filter(Boolean),
      racesCompared: acc.racesCompared,
      driverAheadCount: acc.driverAheadCount,
      driverBehindCount: acc.driverBehindCount,
      qualiAheadCount: acc.qualiAheadCount,
      qualiBehindCount: acc.qualiBehindCount,
    }));
}

async function getRivals(
  driverId: string,
  driverRef: string,
  firstSeason: number | null,
  lastSeason: number | null
): Promise<Rival[]> {
  if (!firstSeason || !lastSeason) return [];

  const supabase = createServerClient();

  // Drivers who raced in overlapping era (seasons within ±5 of this driver's range)
  const seasonWindow = 5;
  const eraMin = firstSeason - seasonWindow;
  const eraMax = lastSeason + seasonWindow;

  // Get driver_ids who raced in this era
  const { data: eraResults } = await supabase
    .from("results")
    .select("driver_id, races!inner(season)")
    .gte("races.season", eraMin)
    .lte("races.season", eraMax)
    .eq("is_sprint", false)
    .neq("driver_id", driverId);

  if (!eraResults?.length) return [];

  // Count shared race entries per rival driver
  const sharedRaceCount = new Map<string, number>();
  for (const r of eraResults as { driver_id: string }[]) {
    sharedRaceCount.set(r.driver_id, (sharedRaceCount.get(r.driver_id) ?? 0) + 1);
  }

  // Also boost teammates (same constructor, same race)
  const { data: myResults } = await supabase
    .from("results")
    .select("race_id, constructor_id")
    .eq("driver_id", driverId)
    .eq("is_sprint", false);

  const myConstructorIds = new Set((myResults ?? []).map((r: { constructor_id: string }) => r.constructor_id));
  const myRaceIds = new Set((myResults ?? []).map((r: { race_id: string }) => r.race_id));

  const { data: teammateRows } = await supabase
    .from("results")
    .select("driver_id, constructor_id, race_id")
    .in("constructor_id", Array.from(myConstructorIds))
    .in("race_id", Array.from(myRaceIds))
    .neq("driver_id", driverId)
    .eq("is_sprint", false);

  const teammateBonus = new Map<string, number>();
  for (const r of (teammateRows ?? []) as { driver_id: string }[]) {
    teammateBonus.set(r.driver_id, (teammateBonus.get(r.driver_id) ?? 0) + 3);
  }

  // Score: shared races + teammate bonus
  const scored = Array.from(sharedRaceCount.entries()).map(([id, count]) => ({
    id,
    score: count + (teammateBonus.get(id) ?? 0),
    sharedRaces: count,
  }));

  scored.sort((a, b) => b.score - a.score);
  const top12 = scored.slice(0, 12);
  if (!top12.length) return [];

  // Fetch driver details
  const { data: rivalDrivers } = await supabase
    .from("drivers")
    .select("id, driver_ref, first_name, last_name, headshot_url")
    .in("id", top12.map((r) => r.id));

  if (!rivalDrivers?.length) return [];

  // Team color for each rival
  const { data: colorRows } = await supabase
    .from("results")
    .select("driver_id, constructors!inner(color_hex, constructor_ref)")
    .in("driver_id", top12.map((r) => r.id))
    .eq("is_sprint", false)
    .order("race_id", { ascending: false });

  const colorMap = new Map<string, string>();
  for (const r of (colorRows ?? []) as unknown as { driver_id: string; constructors: { color_hex: string | null; constructor_ref: string } }[]) {
    if (!colorMap.has(r.driver_id)) {
      colorMap.set(r.driver_id, r.constructors.color_hex ?? getTeamColor(r.constructors.constructor_ref));
    }
  }

  type RivalDriver = { id: string; driver_ref: string; first_name: string; last_name: string; headshot_url: string | null };

  return top12
    .map(({ id, sharedRaces }) => {
      const d = (rivalDrivers as unknown as RivalDriver[]).find((dr) => dr.id === id);
      if (!d) return null;
      return {
        driver_ref: d.driver_ref,
        first_name: d.first_name,
        last_name: d.last_name,
        headshot_url: d.headshot_url,
        teamColor: colorMap.get(id) ?? null,
        comparisonSlug: buildComparisonSlug(driverRef, d.driver_ref),
        sharedRaces,
      };
    })
    .filter((r): r is Rival => r !== null);
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────

function PersonJsonLd({
  driver,
  stats,
}: {
  driver: DriverProfile;
  stats: DriverCareerStats;
}) {
  const siteUrl = getSiteUrl();
  const name = `${driver.first_name} ${driver.last_name}`;

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url: `${siteUrl}/drivers/${driver.driver_ref}`,
    ...(driver.nationality ? { nationality: driver.nationality } : {}),
    ...(driver.dob ? { birthDate: driver.dob } : {}),
    description:
      `Formula 1 driver. ${stats.wins} wins, ${stats.poles} poles, ` +
      `${stats.podiums} podiums across ${stats.totalRaces} races.` +
      (stats.championships > 0
        ? ` ${stats.championships}-time World Champion.`
        : ""),
    knowsAbout: "Formula 1",
    sport: "Formula 1",
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "F1-Versus", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Drivers", item: `${siteUrl}/drivers` },
      { "@type": "ListItem", position: 3, name, item: `${siteUrl}/drivers/${driver.driver_ref}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-4 text-sm font-bold uppercase tracking-widest"
      style={{ color: "var(--muted-foreground)" }}
    >
      {children}
    </h2>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        minWidth: 80,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          color: color ?? "var(--foreground)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#555",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────

function CareerSummaryCard({
  driver,
  stats,
}: {
  driver: DriverProfile;
  stats: DriverCareerStats;
}) {
  const name = `${driver.first_name} ${driver.last_name}`;
  const era =
    stats.firstSeason && stats.lastSeason
      ? stats.firstSeason === stats.lastSeason
        ? String(stats.firstSeason)
        : `${stats.firstSeason}–${stats.lastSeason}`
      : null;

  return (
    <header className="mb-10">
      <div
        className="overflow-hidden rounded-2xl"
        style={{ border: "1px solid var(--border)", borderLeft: `4px solid ${stats.teamColor}` }}
      >
        <div className="flex flex-col sm:flex-row gap-6 px-6 py-8">
          {/* Avatar */}
          <div className="flex-shrink-0 flex justify-center sm:justify-start">
            {driver.headshot_url ? (
              <Image
                src={driver.headshot_url}
                alt={name}
                width={96}
                height={96}
                className="rounded-full object-cover"
                style={{ border: `3px solid ${stats.teamColor}` }}
                priority
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full font-black"
                style={{
                  width: 96,
                  height: 96,
                  border: `3px solid ${stats.teamColor}`,
                  backgroundColor: "var(--surface-elevated)",
                  color: stats.teamColor,
                  fontSize: 34,
                }}
              >
                {driver.last_name[0]}
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-sm font-medium mb-0.5" style={{ color: stats.teamColor }}>
              {driver.first_name}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">
              {driver.last_name}
            </h1>
            <div className="flex flex-wrap gap-3 text-sm" style={{ color: "#666" }}>
              {driver.nationality && <span>{driver.nationality}</span>}
              {era && <span>·</span>}
              {era && <span>{era}</span>}
              {stats.teamName && (
                <>
                  <span>·</span>
                  <span style={{ color: stats.teamColor }}>{stats.teamName}</span>
                </>
              )}
              {stats.championships > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: "#ffd700", fontWeight: 700 }}>
                    {stats.championships}× World Champion
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div
          className="px-6 pb-6 flex flex-wrap gap-3"
        >
          <StatPill label="Races" value={stats.totalRaces} />
          <StatPill label="Wins" value={stats.wins} color={stats.wins > 0 ? stats.teamColor : undefined} />
          <StatPill label="Poles" value={stats.poles} />
          <StatPill label="Podiums" value={stats.podiums} />
          <StatPill label="DNFs" value={stats.dnfs} />
          <StatPill label="Points" value={stats.totalPoints.toFixed(0)} />
          {stats.championships > 0 && (
            <StatPill label="Titles" value={stats.championships} color="#ffd700" />
          )}
        </div>
      </div>
    </header>
  );
}

function TeammateTable({
  records,
  driverRef,
}: {
  records: AllTimeTeammateRecord[];
  driverRef: string;
}) {
  if (records.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "var(--surface-elevated)" }}>
            <th style={{ padding: "10px 14px", textAlign: "left", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Teammate
            </th>
            <th style={{ padding: "10px 8px", textAlign: "center", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Races
            </th>
            <th style={{ padding: "10px 8px", textAlign: "center", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Race H2H
            </th>
            <th style={{ padding: "10px 8px", textAlign: "center", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Quali H2H
            </th>
            <th style={{ padding: "10px 8px", textAlign: "center", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Compare
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((tm, i) => {
            const raceTotal = tm.driverAheadCount + tm.driverBehindCount;
            const qualiTotal = tm.qualiAheadCount + tm.qualiBehindCount;
            const raceWinPct = raceTotal > 0 ? tm.driverAheadCount / raceTotal : 0.5;
            const compSlug = buildComparisonSlug(driverRef, tm.teammateRef);

            return (
              <tr
                key={tm.teammateRef}
                style={{
                  backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "10px 14px" }}>
                  <Link
                    href={`/drivers/${tm.teammateRef}`}
                    style={{ fontWeight: 700, color: "var(--foreground)", textDecoration: "none" }}
                    className="hover:underline"
                  >
                    {tm.teammateName}
                  </Link>
                  {tm.constructorNames.length > 0 && (
                    <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
                      {tm.constructorNames.join(", ")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "#aaa" }}>
                  {tm.racesCompared}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: raceWinPct > 0.5 ? "#4ade80" : raceWinPct < 0.5 ? "#f87171" : "#aaa",
                    }}
                  >
                    {tm.driverAheadCount}–{tm.driverBehindCount}
                  </span>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: qualiTotal > 0
                        ? tm.qualiAheadCount > tm.qualiBehindCount ? "#4ade80"
                        : tm.qualiAheadCount < tm.qualiBehindCount ? "#f87171"
                        : "#aaa"
                        : "#555",
                    }}
                  >
                    {qualiTotal > 0 ? `${tm.qualiAheadCount}–${tm.qualiBehindCount}` : "—"}
                  </span>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <Link
                    href={`/compare/${compSlug}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#aaa",
                      textDecoration: "none",
                      padding: "3px 8px",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                    }}
                    className="hover:border-white hover:text-white"
                  >
                    vs →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CircuitTable({ circuits }: { circuits: TopCircuit[] }) {
  if (circuits.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "var(--surface-elevated)" }}>
            {["Circuit", "Races", "Wins", "Podiums", "Poles", "Avg Finish"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "10px 12px",
                  textAlign: h === "Circuit" ? "left" : "center",
                  color: "#666",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {circuits.map((c, i) => (
            <tr
              key={c.circuitRef}
              style={{
                backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <td style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{c.circuitName}</div>
                {c.country && <div style={{ fontSize: 11, color: "#555" }}>{c.country}</div>}
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{c.races}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: c.wins > 0 ? 700 : 400, color: c.wins > 0 ? "#4ade80" : "#555" }}>{c.wins}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: c.podiums > 0 ? "#fafafa" : "#555" }}>{c.podiums}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: c.poles > 0 ? "#fafafa" : "#555" }}>{c.poles}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "#aaa" }}>
                {c.avgFinish != null ? c.avgFinish.toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RivalsGrid({
  rivals,
  driverLastName,
}: {
  rivals: Rival[];
  driverLastName: string;
}) {
  if (rivals.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 10,
      }}
    >
      {rivals.map((rival) => (
        <Link
          key={rival.driver_ref}
          href={`/compare/${rival.comparisonSlug}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "14px 12px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            textAlign: "center",
            transition: "border-color 0.15s",
          }}
          className="hover:border-white"
        >
          {rival.headshot_url ? (
            <Image
              src={rival.headshot_url}
              alt={`${rival.first_name} ${rival.last_name}`}
              width={52}
              height={52}
              className="rounded-full object-cover"
              style={{ border: `2px solid ${rival.teamColor ?? "var(--border)"}` }}
              loading="lazy"
            />
          ) : (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                backgroundColor: "var(--surface-elevated)",
                border: `2px solid ${rival.teamColor ?? "var(--border)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 20,
                color: rival.teamColor ?? "#aaa",
              }}
            >
              {rival.last_name[0]}
            </div>
          )}
          <div>
            <p style={{ fontSize: 11, color: "#666" }}>{rival.first_name}</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)" }}>
              {rival.last_name}
            </p>
          </div>
          <p style={{ fontSize: 10, color: "#444" }}>
            {driverLastName} vs {rival.last_name} →
          </p>
        </Link>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function DriverPage({
  params,
}: {
  params: { ref: string };
}) {
  if (!hasPublicSupabaseConfig()) notFound();

  const driver = await getDriverProfile(params.ref);
  if (!driver) notFound();

  const [stats, teammates, circuits] = await Promise.all([
    getCareerStats(driver.id),
    getTeammateRecords(driver.id),
    getTopCircuits(driver.id),
  ]);

  const rivals = await getRivals(
    driver.id,
    driver.driver_ref,
    stats.firstSeason,
    stats.lastSeason
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <PersonJsonLd driver={driver} stats={stats} />

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: "#555" }}>
        <Link href="/" className="hover:text-white">Home</Link>
        <span>›</span>
        <Link href="/drivers" className="hover:text-white">Drivers</Link>
        <span>›</span>
        <span style={{ color: "var(--foreground)" }}>
          {driver.first_name} {driver.last_name}
        </span>
      </nav>

      {/* 1. Career summary card */}
      <CareerSummaryCard driver={driver} stats={stats} />

      {/* 2. Season-by-season chart */}
      {stats.seasonBreakdown.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Season by Season</SectionTitle>
          <DriverSeasonChart
            name={`${driver.first_name} ${driver.last_name}`}
            color={stats.teamColor}
            seasons={stats.seasonBreakdown}
          />
        </section>
      )}

      {/* Ad */}
      <div className="mb-10 flex justify-center">
        <AdBanner slot="rectangle" />
      </div>

      {/* 3. Teammate record */}
      {teammates.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Teammate Record</SectionTitle>
          <TeammateTable records={teammates} driverRef={driver.driver_ref} />
        </section>
      )}

      {/* 4. Top 10 circuits */}
      {circuits.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Top Circuits</SectionTitle>
          <CircuitTable circuits={circuits} />
        </section>
      )}

      {/* Ad */}
      <div className="mb-10">
        <AdBanner slot="in-feed" />
      </div>

      {/* 5. Compare with rivals */}
      {rivals.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Compare With…</SectionTitle>
          <p className="mb-4 text-sm" style={{ color: "#555" }}>
            Most relevant rivals from the same era and teams
          </p>
          <RivalsGrid rivals={rivals} driverLastName={driver.last_name} />
        </section>
      )}
    </main>
  );
}
