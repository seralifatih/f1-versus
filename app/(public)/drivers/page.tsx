import type { Metadata } from "next";
import { getDB, hasDB } from "@/lib/db/client";
import { DriverGrid } from "@/components/drivers/DriverGrid";

export const metadata: Metadata = {
  title: "F1 Drivers — Browse & Compare All Drivers | F1-Versus",
  description:
    "Browse all Formula 1 drivers. Select any two to generate a head-to-head comparison with career stats, radar charts, and teammate records.",
};

export const dynamic = "force-static";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DriverWithStats {
  id: number;
  driver_ref: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  nationality: string | null;
  headshot_url: string | null;
  win_count: number;
  race_count: number;
  podium_count: number;
  teamName: string | null;
  teamColor: string | null;
  is_current: boolean;
}

// ─── Data fetching ─────────────────────────────────────────────────────────

async function getDriversWithStats(): Promise<DriverWithStats[]> {
  if (!hasDB()) return [];

  const db = getDB();
  const currentYear = new Date().getFullYear();

  const { results: drivers } = await db
    .prepare(`SELECT id, driver_ref, first_name, last_name, dob, nationality, headshot_url FROM drivers ORDER BY last_name`)
    .all<{ id: string; driver_ref: string; first_name: string; last_name: string; dob: string | null; nationality: string | null; headshot_url: string | null }>();

  if (drivers.length === 0) return [];

  const [
    { results: currentSeasonResults },
    { results: wins },
    { results: races },
    { results: podiums },
    { results: latestResults },
  ] = await Promise.all([
    db.prepare(
      `SELECT DISTINCT r.driver_id FROM results r
       JOIN races rc ON rc.id = r.race_id
       WHERE rc.season = ? AND r.is_sprint = 0`
    ).bind(currentYear).all<{ driver_id: string }>(),

    db.prepare(`SELECT driver_id FROM results WHERE position = 1 AND is_sprint = 0`)
      .all<{ driver_id: string }>(),

    db.prepare(`SELECT driver_id FROM results WHERE is_sprint = 0 AND position IS NOT NULL`)
      .all<{ driver_id: string }>(),

    db.prepare(`SELECT driver_id FROM results WHERE position IN (1,2,3) AND is_sprint = 0`)
      .all<{ driver_id: string }>(),

    db.prepare(
      `SELECT r.driver_id, c.name AS team_name, c.color_hex AS team_color
       FROM results r
       JOIN constructors c ON c.id = r.constructor_id
       JOIN races rc ON rc.id = r.race_id
       WHERE r.is_sprint = 0
       ORDER BY rc.season DESC, rc.round DESC`
    ).all<{ driver_id: string; team_name: string | null; team_color: string | null }>(),
  ]);

  const currentDriverIds = new Set(currentSeasonResults.map((r) => r.driver_id));

  const winMap = new Map<string, number>();
  for (const w of wins) winMap.set(w.driver_id, (winMap.get(w.driver_id) ?? 0) + 1);

  const raceMap = new Map<string, number>();
  for (const r of races) raceMap.set(r.driver_id, (raceMap.get(r.driver_id) ?? 0) + 1);

  const podiumMap = new Map<string, number>();
  for (const p of podiums) podiumMap.set(p.driver_id, (podiumMap.get(p.driver_id) ?? 0) + 1);

  const teamMap = new Map<string, { teamName: string | null; teamColor: string | null }>();
  for (const r of latestResults) {
    if (!teamMap.has(r.driver_id)) teamMap.set(r.driver_id, { teamName: r.team_name, teamColor: r.team_color });
  }

  const result: DriverWithStats[] = drivers.map((d) => ({
    id: d.id as unknown as number,
    driver_ref: d.driver_ref,
    first_name: d.first_name,
    last_name: d.last_name,
    dob: d.dob,
    nationality: d.nationality,
    headshot_url: d.headshot_url,
    win_count: winMap.get(d.id) ?? 0,
    race_count: raceMap.get(d.id) ?? 0,
    podium_count: podiumMap.get(d.id) ?? 0,
    teamName: teamMap.get(d.id)?.teamName ?? null,
    teamColor: teamMap.get(d.id)?.teamColor ?? null,
    is_current: currentDriverIds.has(d.id),
  }));

  result.sort((a, b) => {
    if (a.is_current && !b.is_current) return -1;
    if (!a.is_current && b.is_current) return 1;
    return a.last_name.localeCompare(b.last_name);
  });

  return result;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function DriversPage() {
  const currentYear = new Date().getFullYear();
  const drivers = await getDriversWithStats();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "40px 24px 80px",
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: 40 }}>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              marginBottom: 8,
            }}
          >
            F1 Drivers
          </h1>
          <p style={{ fontSize: 15, color: "#666", lineHeight: 1.5 }}>
            {drivers.filter((d) => d.is_current).length} current drivers ·{" "}
            {drivers.length} total. Select two drivers to compare.
          </p>
        </div>

        {/* Interactive grid (client component) */}
        <DriverGrid drivers={drivers} currentYear={currentYear} />
      </div>
    </div>
  );
}
