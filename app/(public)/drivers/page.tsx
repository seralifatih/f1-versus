import type { Metadata } from "next";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { DriverGrid } from "@/components/drivers/DriverGrid";

export const metadata: Metadata = {
  title: "F1 Drivers — Browse & Compare All Drivers | GridRival",
  description:
    "Browse all Formula 1 drivers. Select any two to generate a head-to-head comparison with career stats, radar charts, and teammate records.",
};

export const revalidate = 86400;

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
  if (!hasPublicSupabaseConfig()) {
    return [];
  }

  const supabase = createServerClient();

  // Get current season year
  const currentYear = new Date().getFullYear();

  // Fetch all drivers
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
    .order("last_name");

  if (driversError || !drivers) return [];

  // Get current season driver IDs (races in currentYear)
  const { data: currentSeasonResults } = await supabase
    .from("results")
    .select("driver_id, races!inner(season)")
    .eq("races.season", currentYear)
    .eq("is_sprint", false);

  const currentDriverIds = new Set(
    (currentSeasonResults ?? []).map((r: { driver_id: number }) => r.driver_id)
  );

  // Get career win counts (position = 1)
  const { data: wins } = await supabase
    .from("results")
    .select("driver_id")
    .eq("position", 1)
    .eq("is_sprint", false);

  const winMap = new Map<number, number>();
  for (const w of wins ?? []) {
    winMap.set(w.driver_id, (winMap.get(w.driver_id) ?? 0) + 1);
  }

  // Get career race counts
  const { data: races } = await supabase
    .from("results")
    .select("driver_id")
    .eq("is_sprint", false)
    .not("position", "is", null);

  const raceMap = new Map<number, number>();
  for (const r of races ?? []) {
    raceMap.set(r.driver_id, (raceMap.get(r.driver_id) ?? 0) + 1);
  }

  // Get podium counts (position in 1,2,3)
  const { data: podiums } = await supabase
    .from("results")
    .select("driver_id")
    .in("position", [1, 2, 3])
    .eq("is_sprint", false);

  const podiumMap = new Map<number, number>();
  for (const p of podiums ?? []) {
    podiumMap.set(p.driver_id, (podiumMap.get(p.driver_id) ?? 0) + 1);
  }

  // Get most recent constructor per driver (latest race)
  const { data: latestResults } = await supabase
    .from("results")
    .select(
      `
      driver_id,
      constructor_id,
      races!inner(season),
      constructors(name, color_hex)
    `
    )
    .eq("is_sprint", false)
    .order("races.season", { ascending: false });

  // Build map: driver_id → { teamName, teamColor }
  const teamMap = new Map<number, { teamName: string | null; teamColor: string | null }>();
  for (const r of latestResults ?? []) {
    if (!teamMap.has(r.driver_id)) {
      const constructor = Array.isArray(r.constructors) ? r.constructors[0] : r.constructors;
      teamMap.set(r.driver_id, {
        teamName: constructor?.name ?? null,
        teamColor: constructor?.color_hex ?? null,
      });
    }
  }

  // Compose result
  const result: DriverWithStats[] = drivers.map((d) => ({
    id: d.id,
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

  // Sort: current drivers first, then by last name
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
