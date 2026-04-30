import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getDB, hasDB } from "@/lib/db/client";
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
  if (!hasDB()) return [];
  const db = getDB();
  const { results } = await db
    .prepare(
      `SELECT d.driver_ref
       FROM drivers d
       JOIN (SELECT driver_id, COUNT(*) AS n FROM results WHERE is_sprint = 0 GROUP BY driver_id HAVING n >= 20) rc
         ON rc.driver_id = d.id`
    )
    .all<{ driver_ref: string }>();
  return results.map((r) => ({ ref: r.driver_ref }));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { ref: string };
}): Promise<Metadata> {
  if (!hasDB()) return { title: "F1 Driver" };
  const db = getDB();
  const driver = await db
    .prepare(`SELECT first_name, last_name, nationality FROM drivers WHERE driver_ref = ?`)
    .bind(params.ref)
    .first<{ first_name: string; last_name: string; nationality: string | null }>();

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
  const db = getDB();
  return db
    .prepare(`SELECT id, driver_ref, first_name, last_name, dob, nationality, headshot_url FROM drivers WHERE driver_ref = ?`)
    .bind(ref)
    .first<DriverProfile>();
}

async function getCareerStats(driverId: string): Promise<DriverCareerStats> {
  const db = getDB();

  const [{ results: rows }, { results: qualiRows }] = await Promise.all([
    db.prepare(
      `SELECT r.position, r.grid, r.points, r.status, rc.season
       FROM results r JOIN races rc ON rc.id = r.race_id
       WHERE r.driver_id = ? AND r.is_sprint = 0`
    ).bind(driverId).all<{ position: number | null; grid: number | null; points: number; status: string | null; season: number }>(),

    db.prepare(
      `SELECT q.position, q.race_id, rc.season
       FROM qualifying q JOIN races rc ON rc.id = q.race_id
       WHERE q.driver_id = ?`
    ).bind(driverId).all<{ position: number | null; race_id: string; season: number }>(),
  ]);

  const polesBySeason = new Map<number, number>();
  for (const q of qualiRows) {
    if (q.position === 1) polesBySeason.set(q.season, (polesBySeason.get(q.season) ?? 0) + 1);
  }

  const bySeason = new Map<number, { races: number; wins: number; podiums: number; points: number }>();
  let totalPoints = 0, wins = 0, podiums = 0, dnfs = 0;

  for (const r of rows) {
    const s = r.season;
    if (!bySeason.has(s)) bySeason.set(s, { races: 0, wins: 0, podiums: 0, points: 0 });
    const acc = bySeason.get(s)!;
    acc.races++;
    acc.points += r.points;
    totalPoints += r.points;
    if (r.position === 1) { wins++; acc.wins++; }
    if (r.position !== null && r.position <= 3) { podiums++; acc.podiums++; }
    const isDNF = r.position === null || (r.status && /accident|collision|engine|gearbox|hydraulics|electrical|suspension|brake|clutch|transmission|mechanical|retired|dnf|disqualified|withdraw|power unit|exhaust|steering|tyres|wheel|fire|spin|overheating|vibration|puncture|damage/i.test(r.status));
    if (isDNF) dnfs++;
  }

  const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);

  let champPositions = new Map<number, number>();
  if (seasons.length > 0) {
    const seasonPlaceholders = seasons.map(() => "?").join(", ");
    const { results: champRows } = await db
      .prepare(`SELECT r.driver_id, r.points, rc.season FROM results r JOIN races rc ON rc.id = r.race_id WHERE rc.season IN (${seasonPlaceholders}) AND r.is_sprint = 0`)
      .bind(...seasons)
      .all<{ driver_id: string; points: number; season: number }>();

    const seasonDriverPoints = new Map<number, Map<string, number>>();
    for (const r of champRows) {
      if (!seasonDriverPoints.has(r.season)) seasonDriverPoints.set(r.season, new Map());
      const m = seasonDriverPoints.get(r.season)!;
      m.set(r.driver_id, (m.get(r.driver_id) ?? 0) + r.points);
    }
    for (const [season, driverMap] of seasonDriverPoints) {
      const ranked = Array.from(driverMap.entries()).sort(([, a], [, b]) => b - a);
      const idx = ranked.findIndex(([id]) => id === driverId);
      if (idx !== -1) champPositions.set(season, idx + 1);
    }
  }

  const championships = Array.from(champPositions.values()).filter((p) => p === 1).length;
  const seasonBreakdown: SeasonStats[] = seasons.map((s) => {
    const acc = bySeason.get(s)!;
    return { season: s, races: acc.races, wins: acc.wins, podiums: acc.podiums, poles: polesBySeason.get(s) ?? 0, points: acc.points, normalizedPoints: acc.points, championship_position: champPositions.get(s) ?? null };
  });

  const lastResult = await db
    .prepare(`SELECT c.name AS team_name, c.color_hex, c.constructor_ref FROM results r JOIN constructors c ON c.id = r.constructor_id WHERE r.driver_id = ? AND r.is_sprint = 0 ORDER BY r.race_id DESC LIMIT 1`)
    .bind(driverId)
    .first<{ team_name: string | null; color_hex: string | null; constructor_ref: string }>();

  return {
    totalRaces: rows.length,
    wins,
    poles: Array.from(polesBySeason.values()).reduce((a, b) => a + b, 0),
    podiums,
    dnfs,
    championships,
    totalPoints,
    firstSeason: seasons[0] ?? null,
    lastSeason: seasons[seasons.length - 1] ?? null,
    teamColor: lastResult?.color_hex ?? getTeamColor(lastResult?.constructor_ref ?? "") ?? "#e10600",
    teamName: lastResult?.team_name ?? null,
    seasonBreakdown,
  };
}

async function getTopCircuits(driverId: string): Promise<TopCircuit[]> {
  const db = getDB();

  const [{ results: rows }, { results: qrows }] = await Promise.all([
    db.prepare(
      `SELECT r.position, c.circuit_ref, c.name AS circuit_name, c.country
       FROM results r
       JOIN races rc ON rc.id = r.race_id
       LEFT JOIN circuits c ON c.id = rc.circuit_id
       WHERE r.driver_id = ? AND r.is_sprint = 0`
    ).bind(driverId).all<{ position: number | null; circuit_ref: string | null; circuit_name: string; country: string | null }>(),

    db.prepare(
      `SELECT q.position, c.circuit_ref
       FROM qualifying q
       JOIN races rc ON rc.id = q.race_id
       LEFT JOIN circuits c ON c.id = rc.circuit_id
       WHERE q.driver_id = ?`
    ).bind(driverId).all<{ position: number | null; circuit_ref: string | null }>(),
  ]);

  const polesByCircuit = new Map<string, number>();
  for (const q of qrows) {
    if (q.position === 1 && q.circuit_ref)
      polesByCircuit.set(q.circuit_ref, (polesByCircuit.get(q.circuit_ref) ?? 0) + 1);
  }

  type Acc = { circuitName: string; country: string | null; races: number; wins: number; podiums: number; finishes: number; finishSum: number };
  const byCircuit = new Map<string, Acc>();

  for (const r of rows) {
    if (!r.circuit_ref) continue;
    if (!byCircuit.has(r.circuit_ref)) byCircuit.set(r.circuit_ref, { circuitName: r.circuit_name, country: r.country, races: 0, wins: 0, podiums: 0, finishes: 0, finishSum: 0 });
    const acc = byCircuit.get(r.circuit_ref)!;
    acc.races++;
    if (r.position === 1) acc.wins++;
    if (r.position !== null && r.position <= 3) acc.podiums++;
    if (r.position !== null) { acc.finishes++; acc.finishSum += r.position; }
  }

  return Array.from(byCircuit.entries())
    .map(([ref, acc]) => ({ circuitRef: ref, circuitName: acc.circuitName, country: acc.country, races: acc.races, wins: acc.wins, podiums: acc.podiums, poles: polesByCircuit.get(ref) ?? 0, avgFinish: acc.finishes > 0 ? acc.finishSum / acc.finishes : null }))
    .filter((c) => c.races >= 2)
    .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.races - a.races)
    .slice(0, 10);
}

async function getTeammateRecords(driverId: string): Promise<AllTimeTeammateRecord[]> {
  const db = getDB();

  const { results: myResults } = await db
    .prepare(`SELECT race_id, constructor_id, position FROM results WHERE driver_id = ? AND is_sprint = 0`)
    .bind(driverId)
    .all<{ race_id: string; constructor_id: string; position: number | null }>();

  if (!myResults.length) return [];

  const myByRace = new Map(myResults.map((r) => [r.race_id, r]));
  const myConstructorIds = new Set(myResults.map((r) => r.constructor_id));
  const raceIds = myResults.map((r) => r.race_id);

  const raceIdPh = raceIds.map(() => "?").join(", ");
  const conIdPh = [...myConstructorIds].map(() => "?").join(", ");

  const [{ results: tmResults }, { results: tmQuali }, { results: myQuali }] = await Promise.all([
    db.prepare(`SELECT r.race_id, r.driver_id, r.constructor_id, r.position, d.driver_ref, d.first_name, d.last_name, c.name AS constructor_name FROM results r JOIN drivers d ON d.id = r.driver_id JOIN constructors c ON c.id = r.constructor_id WHERE r.race_id IN (${raceIdPh}) AND r.constructor_id IN (${conIdPh}) AND r.driver_id != ? AND r.is_sprint = 0`).bind(...raceIds, ...[...myConstructorIds], driverId).all<{ race_id: string; driver_id: string; constructor_id: string; position: number | null; driver_ref: string; first_name: string; last_name: string; constructor_name: string }>(),
    db.prepare(`SELECT race_id, driver_id, position FROM qualifying WHERE race_id IN (${raceIdPh}) AND constructor_id IN (${conIdPh}) AND driver_id != ?`).bind(...raceIds, ...[...myConstructorIds], driverId).all<{ race_id: string; driver_id: string; position: number | null }>(),
    db.prepare(`SELECT race_id, position FROM qualifying WHERE driver_id = ? AND race_id IN (${raceIdPh})`).bind(driverId, ...raceIds).all<{ race_id: string; position: number | null }>(),
  ]);

  const myQualiByRace = new Map(myQuali.map((q) => [q.race_id, q.position]));
  const tmQualiByKey = new Map(tmQuali.map((q) => [`${q.race_id}:${q.driver_id}`, q.position]));

  type TmAccum = { teammateRef: string; teammateName: string; constructorNames: Set<string>; racesCompared: number; driverAheadCount: number; driverBehindCount: number; qualiAheadCount: number; qualiBehindCount: number };
  const byTeammate = new Map<string, TmAccum>();

  for (const tr of tmResults) {
    const myR = myByRace.get(tr.race_id);
    if (!myR || myR.constructor_id !== tr.constructor_id) continue;
    if (myR.position === null || tr.position === null) continue;
    if (!byTeammate.has(tr.driver_id)) byTeammate.set(tr.driver_id, { teammateRef: tr.driver_ref, teammateName: `${tr.first_name} ${tr.last_name}`, constructorNames: new Set(), racesCompared: 0, driverAheadCount: 0, driverBehindCount: 0, qualiAheadCount: 0, qualiBehindCount: 0 });
    const acc = byTeammate.get(tr.driver_id)!;
    acc.constructorNames.add(tr.constructor_name ?? "");
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
    .map((acc) => ({ teammateRef: acc.teammateRef, teammateName: acc.teammateName, constructorNames: Array.from(acc.constructorNames).filter(Boolean), racesCompared: acc.racesCompared, driverAheadCount: acc.driverAheadCount, driverBehindCount: acc.driverBehindCount, qualiAheadCount: acc.qualiAheadCount, qualiBehindCount: acc.qualiBehindCount }));
}

async function getRivals(
  driverId: string,
  driverRef: string,
  firstSeason: number | null,
  lastSeason: number | null
): Promise<Rival[]> {
  if (!firstSeason || !lastSeason) return [];

  const db = getDB();
  const eraMin = firstSeason - 5;
  const eraMax = lastSeason + 5;

  const [{ results: eraResults }, { results: myResults }] = await Promise.all([
    db.prepare(`SELECT DISTINCT r.driver_id FROM results r JOIN races rc ON rc.id = r.race_id WHERE rc.season >= ? AND rc.season <= ? AND r.is_sprint = 0 AND r.driver_id != ?`).bind(eraMin, eraMax, driverId).all<{ driver_id: string }>(),
    db.prepare(`SELECT race_id, constructor_id FROM results WHERE driver_id = ? AND is_sprint = 0`).bind(driverId).all<{ race_id: string; constructor_id: string }>(),
  ]);

  if (!eraResults.length) return [];

  const sharedRaceCount = new Map<string, number>();
  for (const r of eraResults) sharedRaceCount.set(r.driver_id, (sharedRaceCount.get(r.driver_id) ?? 0) + 1);

  const myConstructorIds = new Set(myResults.map((r) => r.constructor_id));
  const myRaceIds = [...new Set(myResults.map((r) => r.race_id))];

  const raceIdPh = myRaceIds.map(() => "?").join(", ");
  const conIdPh = [...myConstructorIds].map(() => "?").join(", ");

  const { results: teammateRows } = myRaceIds.length > 0
    ? await db.prepare(`SELECT DISTINCT driver_id FROM results WHERE constructor_id IN (${conIdPh}) AND race_id IN (${raceIdPh}) AND driver_id != ? AND is_sprint = 0`).bind(...[...myConstructorIds], ...myRaceIds, driverId).all<{ driver_id: string }>()
    : { results: [] as { driver_id: string }[] };

  const teammateBonus = new Map<string, number>();
  for (const r of teammateRows) teammateBonus.set(r.driver_id, (teammateBonus.get(r.driver_id) ?? 0) + 3);

  const scored = Array.from(sharedRaceCount.entries())
    .map(([id, count]) => ({ id, score: count + (teammateBonus.get(id) ?? 0), sharedRaces: count }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (!scored.length) return [];

  const topIds = scored.map((r) => r.id);
  const idPh = topIds.map(() => "?").join(", ");

  const [{ results: rivalDrivers }, { results: colorRows }] = await Promise.all([
    db.prepare(`SELECT id, driver_ref, first_name, last_name, headshot_url FROM drivers WHERE id IN (${idPh})`).bind(...topIds).all<{ id: string; driver_ref: string; first_name: string; last_name: string; headshot_url: string | null }>(),
    db.prepare(`SELECT r.driver_id, c.color_hex, c.constructor_ref FROM results r JOIN constructors c ON c.id = r.constructor_id WHERE r.driver_id IN (${idPh}) AND r.is_sprint = 0 ORDER BY r.race_id DESC`).bind(...topIds).all<{ driver_id: string; color_hex: string | null; constructor_ref: string }>(),
  ]);

  const colorMap = new Map<string, string>();
  for (const r of colorRows) {
    if (!colorMap.has(r.driver_id)) colorMap.set(r.driver_id, r.color_hex ?? getTeamColor(r.constructor_ref));
  }

  return scored
    .map(({ id, sharedRaces }) => {
      const d = rivalDrivers.find((dr) => dr.id === id);
      if (!d) return null;
      return { driver_ref: d.driver_ref, first_name: d.first_name, last_name: d.last_name, headshot_url: d.headshot_url, teamColor: colorMap.get(id) ?? null, comparisonSlug: buildComparisonSlug(driverRef, d.driver_ref), sharedRaces };
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
  if (!hasDB()) notFound();

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
