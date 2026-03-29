import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/client";

export const metadata: Metadata = {
  title: "F1 Driver Rankings — All-Time Stats",
  description:
    "All-time Formula 1 driver rankings sorted by wins, poles, podiums, and more. Compare any driver head-to-head.",
};

export const revalidate = 86400;

type SortKey = "wins" | "poles" | "podiums" | "races" | "points";

interface RankedDriver {
  id: string;
  driver_ref: string;
  first_name: string;
  last_name: string;
  nationality: string | null;
  headshot_url: string | null;
  wins: number;
  poles: number;
  podiums: number;
  races: number;
  points: number;
  dnfs: number;
}

async function getDriverRankings(): Promise<RankedDriver[]> {
  const supabase = createServerClient();

  // Aggregate stats from results and qualifying
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, driver_ref, first_name, last_name, nationality, headshot_url");

  if (driversError || !drivers) return [];

  // Get all results in a single query for efficiency
  const { data: results, error: resultsError } = await supabase
    .from("results")
    .select("driver_id, position, points, status")
    .eq("is_sprint", false);

  if (resultsError || !results) return [];

  // Get qualifying for poles
  const { data: qualifying, error: qualifyingError } = await supabase
    .from("qualifying")
    .select("driver_id, position");

  if (qualifyingError || !qualifying) return [];

  // Aggregate per driver
  const statsMap = new Map<
    string,
    { wins: number; podiums: number; races: number; points: number; dnfs: number }
  >();

  for (const r of results) {
    if (!statsMap.has(r.driver_id)) {
      statsMap.set(r.driver_id, { wins: 0, podiums: 0, races: 0, points: 0, dnfs: 0 });
    }
    const s = statsMap.get(r.driver_id)!;
    s.races++;
    s.points += r.points ?? 0;
    if (r.position === 1) s.wins++;
    if (r.position !== null && r.position <= 3) s.podiums++;
    if (r.position === null || isDNF(r.status)) s.dnfs++;
  }

  const polesMap = new Map<string, number>();
  for (const q of qualifying) {
    if (q.position === 1) {
      polesMap.set(q.driver_id, (polesMap.get(q.driver_id) ?? 0) + 1);
    }
  }

  return drivers
    .map((d) => {
      const stats = statsMap.get(d.id) ?? {
        wins: 0,
        podiums: 0,
        races: 0,
        points: 0,
        dnfs: 0,
      };
      return {
        ...d,
        ...stats,
        poles: polesMap.get(d.id) ?? 0,
      };
    })
    .filter((d) => d.races > 0)
    .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.races - a.races);
}

function isDNF(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return !s.startsWith("finished") && !s.startsWith("+") && s !== "lapped";
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: { sort?: string };
}) {
  const rankings = await getDriverRankings();
  const sortKey = (searchParams.sort ?? "wins") as SortKey;

  const sorted = [...rankings].sort((a, b) => {
    switch (sortKey) {
      case "poles":
        return b.poles - a.poles;
      case "podiums":
        return b.podiums - a.podiums;
      case "races":
        return b.races - a.races;
      case "points":
        return b.points - a.points;
      case "wins":
      default:
        return b.wins - a.wins;
    }
  });

  const columns: { key: SortKey; label: string }[] = [
    { key: "wins", label: "Wins" },
    { key: "poles", label: "Poles" },
    { key: "podiums", label: "Podiums" },
    { key: "races", label: "Races" },
    { key: "points", label: "Points" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-black">Driver Rankings</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          All-time Formula 1 driver stats. Click any driver to compare.
        </p>
      </div>

      {/* Sort controls */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
          Sort by:
        </span>
        {columns.map((col) => (
          <Link
            key={col.key}
            href={`/rankings?sort=${col.key}`}
            className="rounded px-3 py-1 text-sm font-medium transition-colors"
            style={
              sortKey === col.key
                ? { backgroundColor: "var(--accent)", color: "#fff" }
                : {
                    backgroundColor: "var(--surface)",
                    color: "var(--muted-foreground)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            {col.label}
          </Link>
        ))}
      </div>

      {/* Rankings table */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--surface)" }}>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  #
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Driver
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                    style={{
                      color:
                        sortKey === col.key ? "var(--accent)" : "var(--muted-foreground)",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  DNFs
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((driver, index) => (
                <tr
                  key={driver.id}
                  style={{
                    backgroundColor:
                      index % 2 === 0 ? "var(--background)" : "var(--surface)",
                    borderTop: "1px solid var(--border)",
                  }}
                  className="hover:brightness-110 transition-all"
                >
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/drivers`}
                      className="flex items-center gap-3 hover:text-white transition-colors"
                    >
                      {driver.headshot_url ? (
                        <Image
                          src={driver.headshot_url}
                          alt={`${driver.first_name} ${driver.last_name}`}
                          width={32}
                          height={32}
                          className="rounded-full object-cover"
                          style={{ border: "1px solid var(--border)" }}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                          style={{
                            backgroundColor: "var(--surface-elevated)",
                            color: "var(--muted)",
                          }}
                        >
                          {driver.last_name[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">
                          {driver.first_name} {driver.last_name}
                        </p>
                        {driver.nationality && (
                          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {driver.nationality}
                          </p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td
                    className="px-4 py-3 text-right font-bold tabular-nums"
                    style={{ color: sortKey === "wins" ? "var(--accent)" : "inherit" }}
                  >
                    {driver.wins}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: sortKey === "poles" ? "var(--accent)" : "inherit" }}
                  >
                    {driver.poles}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: sortKey === "podiums" ? "var(--accent)" : "inherit" }}
                  >
                    {driver.podiums}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: sortKey === "races" ? "var(--accent)" : "inherit" }}
                  >
                    {driver.races}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: sortKey === "points" ? "var(--accent)" : "inherit" }}
                  >
                    {driver.points.toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {driver.dnfs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
