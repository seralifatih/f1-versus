import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { computeComparison } from "@/lib/comparison/compute";
import {
  parseComparisonSlug,
  buildComparisonSlug,
  getTeamColor,
  type ComparisonResult,
  type Driver,
  type CircuitBreakdownRow,
  type CircuitBreakdownStats,
} from "@/lib/data/types";
import { SeasonTimeline } from "@/components/charts/SeasonTimeline";
import { TeammateBattle } from "@/components/comparison/TeammateBattle";
import { FilterableComparison } from "@/components/comparison/FilterableComparison";
import { ShareButton } from "@/components/comparison/ShareButton";
import { VoteWidget } from "@/components/comparison/VoteWidget";
import { CircuitBreakdown } from "@/components/comparison/CircuitBreakdown";
import { getComparisonSummary, type AISummaryResult } from "@/lib/ai/summary";
import { AdBanner } from "@/components/ui/AdBanner";
import { ComparisonViewTracker } from "@/components/comparison/ComparisonViewTracker";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";
import Image from "next/image";

// ISR: revalidate every 24 hours
export const revalidate = 86400;

// ─── Static Params ─────────────────────────────────────────────────────────
// Pre-render top 400 driver pairs at build time.
// Priority: current grid × current grid, then top historical pairs by win count.

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  if (!hasPublicSupabaseConfig()) {
    return [];
  }

  const supabase = createServerClient();
  const currentYear = new Date().getFullYear();

  const [{ data: comparisonRows, error: comparisonError }, { data: currentResults }] =
    await Promise.all([
      supabase
        .from("driver_comparisons")
        .select("slug, driver_a_id, driver_b_id, stats_json")
        .is("season", null)
        .limit(800),
      supabase
        .from("results")
        .select("driver_id, races!inner(season)")
        .eq("races.season", currentYear)
        .eq("is_sprint", false),
    ]);

  if (comparisonError || !comparisonRows) return [];

  const currentDriverIds = new Set(
    (currentResults ?? []).map((result: { driver_id: string }) => result.driver_id)
  );

  type StaticParamRow = {
    slug: string | null;
    driver_a_id: string;
    driver_b_id: string;
    stats_json: {
      statsA?: { wins?: number };
      statsB?: { wins?: number };
    } | null;
  };

  const scoreRow = (row: StaticParamRow): number => {
    const isCurrentA = currentDriverIds.has(row.driver_a_id);
    const isCurrentB = currentDriverIds.has(row.driver_b_id);
    const currentBoost = isCurrentA && isCurrentB ? 1000 : isCurrentA || isCurrentB ? 500 : 0;
    const combinedWins =
      (row.stats_json?.statsA?.wins ?? 0) + (row.stats_json?.statsB?.wins ?? 0);
    return currentBoost + combinedWins;
  };

  return (comparisonRows as StaticParamRow[])
    .filter((row) => row.slug)
    .sort((a, b) => scoreRow(b) - scoreRow(a))
    .slice(0, 400)
    .map((row) => ({ slug: row.slug as string }));

}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const parsed = parseComparisonSlug(params.slug);
  if (!parsed) return { title: "Comparison Not Found" };

  if (!hasPublicSupabaseConfig()) {
    const fallbackNameA = parsed.driverARef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const fallbackNameB = parsed.driverBRef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${fallbackNameA} vs ${fallbackNameB} - F1 Driver Comparison | F1-Versus`;
    const description = `Head-to-head F1 stats: ${fallbackNameA} vs ${fallbackNameB}. Wins, poles, podiums, consistency score, teammate battles, and more across every season of Formula 1.`;

    return {
      title,
      description,
      alternates: {
        canonical: `/compare/${params.slug}`,
      },
    };
  }

  const supabase = createServerClient();

  // Fetch driver names + pre-computed stats for a stats-rich description
  const [{ data: dA }, { data: dB }, { data: cached }] = await Promise.all([
    supabase
      .from("drivers")
      .select("first_name, last_name")
      .eq("driver_ref", parsed.driverARef)
      .single(),
    supabase
      .from("drivers")
      .select("first_name, last_name")
      .eq("driver_ref", parsed.driverBRef)
      .single(),
    supabase
      .from("driver_comparisons")
      .select("stats_json")
      .eq("slug", buildComparisonSlug(parsed.driverARef, parsed.driverBRef))
      .is("season", null)
      .single(),
  ]);

  const nameA = dA ? `${dA.first_name} ${dA.last_name}` : parsed.driverARef;
  const nameB = dB ? `${dB.first_name} ${dB.last_name}` : parsed.driverBRef;

  const title = `${nameA} vs ${nameB} — F1 Driver Comparison | F1-Versus`;

  // Build a stats-specific description if we have pre-computed data
  let description: string;
  if (cached?.stats_json) {
    type StatsShape = {
      statsA: { wins: number; poles: number; podiums: number };
      statsB: { wins: number; poles: number; podiums: number };
      headToHead: { totalRaces: number; driverAWins: number; driverBWins: number };
    };
    const s = cached.stats_json as StatsShape;
    const winsLeader = s.statsA.wins >= s.statsB.wins ? nameA : nameB;
    const winsMax = Math.max(s.statsA.wins, s.statsB.wins);
    const winsMin = Math.min(s.statsA.wins, s.statsB.wins);
    const h2hLine =
      s.headToHead.totalRaces > 0
        ? ` H2H: ${s.headToHead.driverAWins}–${s.headToHead.driverBWins} in ${s.headToHead.totalRaces} shared races.`
        : "";
    description = `${winsLeader} leads ${winsMax}–${winsMin} on wins. ${nameA}: ${s.statsA.poles}P ${s.statsA.podiums}Pd | ${nameB}: ${s.statsB.poles}P ${s.statsB.podiums}Pd.${h2hLine} Full career stats on F1-Versus.`;
  } else {
    description = `Head-to-head F1 stats: ${nameA} vs ${nameB}. Wins, poles, podiums, consistency score, teammate battles, and more across every season of Formula 1.`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: `/api/og/${params.slug}`,
          width: 1200,
          height: 630,
          alt: `${nameA} vs ${nameB} comparison card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/${params.slug}`],
    },
    alternates: {
      canonical: `/compare/${params.slug}`,
    },
  };
}

// ─── Data Fetching ─────────────────────────────────────────────────────────

async function getOrComputeComparison(slug: string): Promise<ComparisonResult | null> {
  const supabase = createServerClient();
  const parsed = parseComparisonSlug(slug);
  if (!parsed) return null;

  // Resolve driver UUIDs
  const [{ data: dA }, { data: dB }] = await Promise.all([
    supabase.from("drivers").select("id, driver_ref").eq("driver_ref", parsed.driverARef).single(),
    supabase.from("drivers").select("id, driver_ref").eq("driver_ref", parsed.driverBRef).single(),
  ]);
  if (!dA || !dB) return null;

  // Try pre-computed first
  const { data: cached } = await supabase
    .from("driver_comparisons")
    .select("stats_json")
    .is("season", null)
    .or(
      `and(driver_a_id.eq.${dA.id},driver_b_id.eq.${dB.id}),and(driver_a_id.eq.${dB.id},driver_b_id.eq.${dA.id})`
    )
    .single();

  if (cached?.stats_json) {
    return cached.stats_json as ComparisonResult;
  }

  // On-demand computation — runs at request time, cached by ISR afterwards
  try {
    const result = await computeComparison(dA.id, dB.id);

    // Store for future requests (best-effort — don't fail if this errors)
    const canonicalSlug = buildComparisonSlug(parsed.driverARef, parsed.driverBRef);
    const aIsCanonical = parsed.driverARef.localeCompare(parsed.driverBRef) <= 0;
    try {
      await supabase.from("driver_comparisons").upsert(
        {
          driver_a_id: aIsCanonical ? dA.id : dB.id,
          driver_b_id: aIsCanonical ? dB.id : dA.id,
          slug: canonicalSlug,
          season: null,
          stats_json: result,
          computed_stats: result,
          last_computed_at: new Date().toISOString(),
        },
        { onConflict: "driver_a_id,driver_b_id,season" }
      );
    } catch {
      // Best-effort cache write; the page can still render from the fresh result.
    }

    return result;
  } catch {
    return null;
  }
}

async function getTeamColors(
  driverARef: string,
  driverBRef: string
): Promise<{ colorA: string; colorB: string }> {
  const supabase = createServerClient();

  // Find the most recent constructor for each driver
  const [{ data: conA }, { data: conB }] = await Promise.all([
    supabase
      .from("results")
      .select("constructor:constructors(constructor_ref, color_hex)")
      .eq("driver_id", (
        await supabase.from("drivers").select("id").eq("driver_ref", driverARef).single()
      ).data?.id ?? "")
      .order("race_id", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("results")
      .select("constructor:constructors(constructor_ref, color_hex)")
      .eq("driver_id", (
        await supabase.from("drivers").select("id").eq("driver_ref", driverBRef).single()
      ).data?.id ?? "")
      .order("race_id", { ascending: false })
      .limit(1)
      .single(),
  ]);

  type ConstructorRow = { constructor_ref: string; color_hex: string | null };
  const consA = conA?.constructor as unknown as ConstructorRow | null;
  const consB = conB?.constructor as unknown as ConstructorRow | null;

  const colorA = consA?.color_hex ?? getTeamColor(consA?.constructor_ref ?? "") ?? "#e10600";
  const colorB = consB?.color_hex ?? getTeamColor(consB?.constructor_ref ?? "") ?? "#3b82f6";

  return { colorA, colorB };
}

// ─── Circuit breakdown data ─────────────────────────────────────────────────

async function getCircuitBreakdowns(
  driverARef: string,
  driverBRef: string
): Promise<CircuitBreakdownRow[]> {
  const supabase = createServerClient();

  // Resolve driver IDs
  const [{ data: dA }, { data: dB }] = await Promise.all([
    supabase.from("drivers").select("id").eq("driver_ref", driverARef).single(),
    supabase.from("drivers").select("id").eq("driver_ref", driverBRef).single(),
  ]);
  if (!dA || !dB) return [];

  // Fetch all non-sprint results for both drivers, with circuit + weather join
  const [{ data: resA }, { data: resB }] = await Promise.all([
    supabase
      .from("results")
      .select(
        `position, grid, points, status, fastest_lap_rank,
         race:races!inner(id, season, round, name, date,
           circuit:circuits(id, circuit_ref, name, country, type),
           weather_conditions(wet))`
      )
      .eq("driver_id", dA.id)
      .eq("is_sprint", false),
    supabase
      .from("results")
      .select(
        `position, grid, points, status, fastest_lap_rank,
         race:races!inner(id, season, round, name, date,
           circuit:circuits(id, circuit_ref, name, country, type),
           weather_conditions(wet))`
      )
      .eq("driver_id", dB.id)
      .eq("is_sprint", false),
  ]);

  // Fetch qualifying for both drivers
  const allRaceIdsA = new Set<string>();
  const allRaceIdsB = new Set<string>();

  type RawResult = {
    position: number | null;
    grid: number | null;
    points: number;
    status: string | null;
    fastest_lap_rank: number | null;
    race: {
      id: string;
      season: number;
      round: number;
      name: string;
      date: string;
      circuit: { id: string; circuit_ref: string; name: string; country: string | null; type: "street" | "permanent" | null } | null;
      weather_conditions: { wet: boolean } | null;
    };
  };

  const rowsA = (resA ?? []) as unknown as RawResult[];
  const rowsB = (resB ?? []) as unknown as RawResult[];

  for (const r of rowsA) allRaceIdsA.add(r.race.id);
  for (const r of rowsB) allRaceIdsB.add(r.race.id);

  const allRaceIds = Array.from(new Set([...allRaceIdsA, ...allRaceIdsB]));
  if (allRaceIds.length === 0) return [];

  const [{ data: qualiA }, { data: qualiB }] = await Promise.all([
    supabase
      .from("qualifying")
      .select("race_id, position")
      .eq("driver_id", dA.id)
      .in("race_id", allRaceIds),
    supabase
      .from("qualifying")
      .select("race_id, position")
      .eq("driver_id", dB.id)
      .in("race_id", allRaceIds),
  ]);

  const qualiMapA = new Map((qualiA ?? []).map((q: { race_id: string; position: number | null }) => [q.race_id, q.position]));
  const qualiMapB = new Map((qualiB ?? []).map((q: { race_id: string; position: number | null }) => [q.race_id, q.position]));

  // Group by circuit
  type CircuitAccum = {
    circuitRef: string;
    circuitName: string;
    country: string | null;
    type: "street" | "permanent" | null;
    racesA: CircuitBreakdownRow["racesA"];
    racesB: CircuitBreakdownRow["racesB"];
  };

  const byCircuit = new Map<string, CircuitAccum>();

  function getOrCreate(circuit: NonNullable<RawResult["race"]["circuit"]>): CircuitAccum {
    if (!byCircuit.has(circuit.circuit_ref)) {
      byCircuit.set(circuit.circuit_ref, {
        circuitRef: circuit.circuit_ref,
        circuitName: circuit.name,
        country: circuit.country,
        type: circuit.type,
        racesA: [],
        racesB: [],
      });
    }
    return byCircuit.get(circuit.circuit_ref)!;
  }

  for (const r of rowsA) {
    if (!r.race.circuit) continue;
    const acc = getOrCreate(r.race.circuit);
    acc.racesA.push({
      season: r.race.season,
      round: r.race.round,
      raceName: r.race.name,
      date: r.race.date,
      position: r.position,
      grid: r.grid,
      points: r.points,
      status: r.status,
      qualiPosition: qualiMapA.get(r.race.id) ?? null,
      wet: r.race.weather_conditions?.wet ?? false,
    });
  }

  for (const r of rowsB) {
    if (!r.race.circuit) continue;
    const acc = getOrCreate(r.race.circuit);
    acc.racesB.push({
      season: r.race.season,
      round: r.race.round,
      raceName: r.race.name,
      date: r.race.date,
      position: r.position,
      grid: r.grid,
      points: r.points,
      status: r.status,
      qualiPosition: qualiMapB.get(r.race.id) ?? null,
      wet: r.race.weather_conditions?.wet ?? false,
    });
  }

  function computeStats(races: CircuitBreakdownRow["racesA"]): CircuitBreakdownStats {
    const finishes = races.filter((r) => r.position !== null);
    const avgFinish =
      finishes.length > 0
        ? finishes.reduce((s, r) => s + r.position!, 0) / finishes.length
        : null;
    const bestFinish =
      finishes.length > 0
        ? Math.min(...finishes.map((r) => r.position!))
        : null;
    return {
      races: races.length,
      wins: races.filter((r) => r.position === 1).length,
      podiums: races.filter((r) => r.position !== null && r.position <= 3).length,
      poles: races.filter((r) => r.qualiPosition === 1).length,
      bestFinish,
      avgFinish,
      dnfs: races.filter((r) => r.position === null).length,
    };
  }

  // Only include circuits where at least one driver has raced
  return Array.from(byCircuit.values())
    .filter((c) => c.racesA.length > 0 || c.racesB.length > 0)
    .map((c) => ({
      ...c,
      racesA: c.racesA.sort((a, b) => b.season - a.season),
      racesB: c.racesB.sort((a, b) => b.season - a.season),
      statsA: computeStats(c.racesA),
      statsB: computeStats(c.racesB),
    }))
    .sort((a, b) =>
      Math.max(b.statsA.races, b.statsB.races) -
      Math.max(a.statsA.races, a.statsB.races)
    );
}

// ─── Related comparisons ───────────────────────────────────────────────────
// Find up to 4 other comparisons that share one driver with the current pair.

interface RelatedComparison {
  slug: string;
  nameA: string;
  nameB: string;
  colorA: string | null;
  colorB: string | null;
}

async function getRelatedComparisons(
  driverARef: string,
  driverBRef: string,
  currentSlug: string
): Promise<RelatedComparison[]> {
  const supabase = createServerClient();

  // Resolve both driver IDs
  const [{ data: dA }, { data: dB }] = await Promise.all([
    supabase.from("drivers").select("id").eq("driver_ref", driverARef).single(),
    supabase.from("drivers").select("id").eq("driver_ref", driverBRef).single(),
  ]);
  if (!dA || !dB) return [];

  // Comparisons that include either driver (but not the current one)
  const { data: rows } = await supabase
    .from("driver_comparisons")
    .select(
      `slug,
       driver_a:drivers!driver_comparisons_driver_a_id_fkey(driver_ref, first_name, last_name),
       driver_b:drivers!driver_comparisons_driver_b_id_fkey(driver_ref, first_name, last_name)`
    )
    .is("season", null)
    .neq("slug", currentSlug)
    .or(
      `driver_a_id.eq.${dA.id},driver_b_id.eq.${dA.id},driver_a_id.eq.${dB.id},driver_b_id.eq.${dB.id}`
    )
    .limit(20);

  if (!rows || rows.length === 0) return [];

  type DRow = { driver_ref: string; first_name: string; last_name: string };

  // Prefer comparisons that feature both well-known drivers
  // — sort by: shares driverA first, then driverB, then others
  const scored = rows
    .filter((r) => r.slug)
    .map((r) => {
      const a = r.driver_a as unknown as DRow;
      const b = r.driver_b as unknown as DRow;
      const hasA = a.driver_ref === driverARef || b.driver_ref === driverARef;
      const hasB = a.driver_ref === driverBRef || b.driver_ref === driverBRef;
      return { r, score: (hasA ? 1 : 0) + (hasB ? 1 : 0) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 4);

  // Fetch team colors for related drivers
  const relatedRefs = scored.flatMap(({ r }) => {
    const a = r.driver_a as unknown as DRow;
    const b = r.driver_b as unknown as DRow;
    return [a.driver_ref, b.driver_ref];
  });

  const { data: colorRows } = await supabase
    .from("results")
    .select("drivers!inner(driver_ref), constructors!inner(color_hex)")
    .in("drivers.driver_ref", relatedRefs)
    .eq("is_sprint", false)
    .order("race_id", { ascending: false });

  const colorMap = new Map<string, string>();
  for (const row of colorRows ?? []) {
    const ref = (row.drivers as unknown as { driver_ref: string }).driver_ref;
    const color = (row.constructors as unknown as { color_hex: string }).color_hex;
    if (!colorMap.has(ref) && color) colorMap.set(ref, color);
  }

  return scored.map(({ r }) => {
    const a = r.driver_a as unknown as DRow;
    const b = r.driver_b as unknown as DRow;
    return {
      slug: r.slug as string,
      nameA: `${a.first_name} ${a.last_name}`,
      nameB: `${b.first_name} ${b.last_name}`,
      colorA: colorMap.get(a.driver_ref) ?? null,
      colorB: colorMap.get(b.driver_ref) ?? null,
    };
  });
}

// ─── JSON-LD structured data ───────────────────────────────────────────────

function JsonLd({
  slug,
  nameA,
  nameB,
  statsA,
  statsB,
  headToHead,
}: {
  slug: string;
  nameA: string;
  nameB: string;
  statsA: { wins: number; poles: number; podiums: number; totalRaces: number };
  statsB: { wins: number; poles: number; podiums: number; totalRaces: number };
  headToHead: { totalRaces: number; driverAWins: number; driverBWins: number };
}) {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/compare/${slug}`;

  const winsLeader = statsA.wins >= statsB.wins ? nameA : nameB;
  const winsMax = Math.max(statsA.wins, statsB.wins);
  const winsMin = Math.min(statsA.wins, statsB.wins);
  const h2hLeader = headToHead.driverAWins >= headToHead.driverBWins ? nameA : nameB;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Who has more wins, ${nameA} or ${nameB}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${winsLeader} leads with ${winsMax} career wins compared to ${winsMin} for their rival.`,
        },
      },
      {
        "@type": "Question",
        name: `Who is faster in qualifying, ${nameA} or ${nameB}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${nameA} has ${statsA.poles} career pole positions versus ${statsB.poles} for ${nameB}.`,
        },
      },
      {
        "@type": "Question",
        name: `Head to head, who performed better when ${nameA} and ${nameB} raced together?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            headToHead.totalRaces > 0
              ? `In ${headToHead.totalRaces} shared races, ${h2hLeader} finished ahead more often.`
              : `${nameA} and ${nameB} did not compete in the same seasons.`,
        },
      },
      {
        "@type": "Question",
        name: `How many podiums do ${nameA} and ${nameB} each have?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${nameA} has ${statsA.podiums} podiums; ${nameB} has ${statsB.podiums} podiums across their F1 careers.`,
        },
      },
    ],
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "F1-Versus", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${siteUrl}/compare` },
      { "@type": "ListItem", position: 3, name: `${nameA} vs ${nameB}`, item: pageUrl },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}

// ─── Page Component ────────────────────────────────────────────────────────

export default async function ComparePage({
  params,
}: {
  params: { slug: string };
}) {
  const parsed = parseComparisonSlug(params.slug);
  if (!parsed) notFound();
  if (!hasPublicSupabaseConfig()) notFound();

  // Enforce canonical slug — redirect non-canonical ordering
  const canonical = buildComparisonSlug(parsed.driverARef, parsed.driverBRef);
  if (params.slug !== canonical) {
    redirect(`/compare/${canonical}`);
  }

  const comparison = await getOrComputeComparison(params.slug);
  if (!comparison) notFound();

  const { driverA, driverB, statsA, statsB, headToHead, radarMetrics, sharedSeasons } = comparison;
  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;
  const fallbackColorA = getTeamColor(driverA.driver_ref);
  const fallbackColorB = getTeamColor(driverB.driver_ref);

  const [colorsResult, circuitBreakdownsResult, aiSummaryResult, relatedComparisonsResult] =
    await Promise.allSettled([
      getTeamColors(parsed.driverARef, parsed.driverBRef),
      getCircuitBreakdowns(parsed.driverARef, parsed.driverBRef),
      getComparisonSummary(params.slug, comparison),
      getRelatedComparisons(parsed.driverARef, parsed.driverBRef, params.slug),
    ]);

  const { colorA, colorB } =
    colorsResult.status === "fulfilled"
      ? colorsResult.value
      : { colorA: fallbackColorA, colorB: fallbackColorB };

  const circuitBreakdowns =
    circuitBreakdownsResult.status === "fulfilled" ? circuitBreakdownsResult.value : [];

  const aiSummary: AISummaryResult =
    aiSummaryResult.status === "fulfilled"
      ? aiSummaryResult.value
      : {
          text: `${nameA} and ${nameB} can still be compared below using the available career stats.`,
          isAI: false,
        };

  const relatedComparisons =
    relatedComparisonsResult.status === "fulfilled" ? relatedComparisonsResult.value : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Analytics: fire comparison_viewed on mount ─────────────────── */}
      <ComparisonViewTracker slug={params.slug} />
      {/* ── JSON-LD structured data (FAQ + BreadcrumbList) ─────────────── */}
      <JsonLd
        slug={params.slug}
        nameA={nameA}
        nameB={nameB}
        statsA={statsA}
        statsB={statsB}
        headToHead={headToHead}
      />
      {/* ── 1. Hero Header ─────────────────────────────────────────────── */}
      <HeroHeader
        driverA={driverA}
        driverB={driverB}
        colorA={colorA}
        colorB={colorB}
        sharedSeasons={sharedSeasons}
      />

      {/* ── 2. Quick Verdict ───────────────────────────────────────────── */}
      <QuickVerdict
        driverA={driverA}
        driverB={driverB}
        statsA={statsA}
        statsB={statsB}
        colorA={colorA}
        colorB={colorB}
        headToHead={headToHead}
        aiSummary={aiSummary}
      />

      {/* ── 3 & 4. Stats Table + Radar Chart (with context filters) ──── */}
      <FilterableComparison
        defaultResult={comparison}
        driverARef={parsed.driverARef}
        driverBRef={parsed.driverBRef}
        nameA={driverA.last_name}
        nameB={driverB.last_name}
        colorA={colorA}
        colorB={colorB}
        sharedSeasons={sharedSeasons}
      />

      {/* ── Ad: Medium Rectangle (300×250) ────────────────────────────── */}
      <div className="mb-10 flex justify-center">
        <AdBanner slot="rectangle" />
      </div>

      {/* ── 5. Season Timeline ─────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionTitle>Season-by-Season Points</SectionTitle>
        <SeasonTimeline
          nameA={driverA.last_name}
          nameB={driverB.last_name}
          colorA={colorA}
          colorB={colorB}
          breakdownA={statsA.seasonBreakdown}
          breakdownB={statsB.seasonBreakdown}
        />
      </section>

      {/* ── 6. Teammate Battle ─────────────────────────────────────────── */}
      {(statsA.allTeammateRecords.length > 0 || statsB.allTeammateRecords.length > 0) && (
        <section className="mb-10">
          <SectionTitle>Teammate Battle</SectionTitle>
          <TeammateBattle
            nameA={nameA}
            nameB={nameB}
            statsA={statsA}
            statsB={statsB}
            colorA={colorA}
            colorB={colorB}
          />
        </section>
      )}

      {/* ── Ad: In-feed ────────────────────────────────────────────────── */}
      <div className="mb-10">
        <AdBanner slot="in-feed" />
      </div>

      {/* ── 7. Circuit Breakdown ───────────────────────────────────────── */}
      <section className="mb-10">
        <SectionTitle>Circuit Breakdown</SectionTitle>
        <CircuitBreakdown
          circuits={circuitBreakdowns}
          nameA={nameA}
          nameB={nameB}
          colorA={colorA}
          colorB={colorB}
        />
      </section>

      {/* ── 8. Share Card ──────────────────────────────────────────────── */}
      <ShareCard slug={params.slug} driverA={driverA} driverB={driverB} />

      {/* ── 9. Related Comparisons ─────────────────────────────────────── */}
      {relatedComparisons.length > 0 && (
        <RelatedComparisons
          items={relatedComparisons}
          nameA={nameA}
          nameB={nameB}
        />
      )}
    </main>
  );
}

// ─── 9. RelatedComparisons ─────────────────────────────────────────────────

function RelatedComparisons({
  items,
  nameA,
  nameB,
}: {
  items: RelatedComparison[];
  nameA: string;
  nameB: string;
}) {
  const lastA = nameA.split(" ").pop()!;
  const lastB = nameB.split(" ").pop()!;

  return (
    <section className="mb-10">
      <h2
        className="mb-1 text-lg font-bold uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        See Also
      </h2>
      <p className="mb-4 text-sm" style={{ color: "#555" }}>
        If you liked {lastA} vs {lastB}, you might enjoy these matchups
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {items.map((item) => {
          const lastNameA = item.nameA.split(" ").pop()!;
          const lastNameB = item.nameB.split(" ").pop()!;
          return (
            <Link
              key={item.slug}
              href={`/compare/${item.slug}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                textDecoration: "none",
                position: "relative",
                overflow: "hidden",
                minHeight: 52,
              }}
            >
              {/* Left color accent */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  backgroundColor: item.colorA ?? "var(--accent)",
                  borderRadius: "3px 0 0 3px",
                }}
              />
              <div style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      color: item.colorA ?? "var(--foreground)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {lastNameA}
                  </span>
                  <span style={{ fontSize: 9, color: "#444", fontWeight: 900 }}>VS</span>
                  <span
                    style={{
                      color: item.colorB ?? "var(--foreground)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {lastNameB}
                  </span>
                </div>
              </div>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "#333", flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-lg font-bold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      {children}
    </div>
  );
}

// ─── 1. HeroHeader ─────────────────────────────────────────────────────────

function HeroHeader({
  driverA,
  driverB,
  colorA,
  colorB,
  sharedSeasons,
}: {
  driverA: Driver;
  driverB: Driver;
  colorA: string;
  colorB: string;
  sharedSeasons: number[];
}) {
  return (
    <header className="mb-10">
      <div
        className="overflow-hidden rounded-2xl"
        style={{ border: "1px solid var(--border)" }}
      >
        {/* Mobile: stacked row, Desktop: side-by-side */}
        <div className="flex items-stretch sm:flex-row flex-col">
          {/* Driver A side */}
          <div
            className="flex flex-1 flex-col items-center gap-3 px-6 py-6 sm:py-8"
            style={{ borderLeft: `4px solid ${colorA}` }}
          >
            <DriverAvatar driver={driverA} color={colorA} size={72} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: colorA }}>
                {driverA.first_name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{driverA.last_name}</h1>
              {driverA.nationality && (
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {driverA.nationality}
                </p>
              )}
            </div>
          </div>

          {/* Centre VS badge — horizontal on mobile, vertical on desktop */}
          <div
            className="flex shrink-0 items-center justify-center gap-2 sm:gap-1 sm:flex-col px-4 py-3 sm:py-0"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <span className="text-xs font-bold tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              VS
            </span>
            {sharedSeasons.length > 0 && (
              <span className="text-xs text-center" style={{ color: "var(--muted-foreground)", maxWidth: 80 }}>
                {sharedSeasons.length} shared season{sharedSeasons.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Driver B side */}
          <div
            className="flex flex-1 flex-col items-center gap-3 px-6 py-6 sm:py-8"
            style={{ borderRight: `4px solid ${colorB}` }}
          >
            <DriverAvatar driver={driverB} color={colorB} size={72} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: colorB }}>
                {driverB.first_name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{driverB.last_name}</h1>
              {driverB.nationality && (
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {driverB.nationality}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function DriverAvatar({
  driver,
  color,
  size,
}: {
  driver: Driver;
  color: string;
  size: number;
}) {
  const initials = `${driver.first_name[0]}${driver.last_name[0]}`;
  return driver.headshot_url ? (
    <Image
      src={driver.headshot_url}
      alt={`${driver.first_name} ${driver.last_name}`}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ border: `2px solid ${color}` }}
      priority={size >= 72}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full font-black"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        backgroundColor: "var(--surface-elevated)",
        color,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
}

// ─── 2. QuickVerdict ───────────────────────────────────────────────────────

function QuickVerdict({
  driverA,
  driverB,
  statsA,
  statsB,
  colorA,
  colorB,
  headToHead,
  aiSummary,
}: {
  driverA: Driver;
  driverB: Driver;
  statsA: { wins: number; poles: number; podiums: number; totalRaces: number };
  statsB: { wins: number; poles: number; podiums: number; totalRaces: number };
  colorA: string;
  colorB: string;
  headToHead: { totalRaces: number; driverAWins: number; driverBWins: number; ties: number };
  aiSummary: AISummaryResult;
}) {
  const total = headToHead.driverAWins + headToHead.driverBWins + headToHead.ties;
  const pctA = total > 0 ? (headToHead.driverAWins / total) * 100 : 50;
  const pctB = total > 0 ? (headToHead.driverBWins / total) * 100 : 50;

  return (
    <section className="mb-10">
      <SectionTitle>Quick Verdict</SectionTitle>
      <Card className="p-6">
        {/* AI / template summary */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            {aiSummary.isAI ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#a78bfa",
                  backgroundColor: "rgba(167,139,250,0.1)",
                  border: "1px solid rgba(167,139,250,0.25)",
                  borderRadius: 4,
                  padding: "2px 7px",
                }}
              >
                {/* Sparkle icon */}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
                AI Analysis
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#555",
                }}
              >
                Analysis
              </span>
            )}
          </div>
          <p className="text-base leading-relaxed" style={{ color: "var(--foreground)" }}>
            {aiSummary.text}
          </p>
        </div>

        {/* H2H bar */}
        {total > 0 && (
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              <span style={{ color: colorA }}>{headToHead.driverAWins} ahead</span>
              <span>{headToHead.totalRaces} shared races</span>
              <span style={{ color: colorB }}>{headToHead.driverBWins} ahead</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
              <div style={{ width: `${pctA}%`, backgroundColor: colorA, transition: "width 0.4s ease" }} />
              {headToHead.ties > 0 && (
                <div style={{ width: `${(headToHead.ties / total) * 100}%`, backgroundColor: "var(--muted)" }} />
              )}
              <div style={{ width: `${pctB}%`, backgroundColor: colorB, transition: "width 0.4s ease" }} />
            </div>
            <div className="mt-1 flex justify-between text-xs font-semibold">
              <span style={{ color: colorA }}>{driverA.last_name}</span>
              {headToHead.ties > 0 && (
                <span style={{ color: "var(--muted-foreground)" }}>{headToHead.ties} tied</span>
              )}
              <span style={{ color: colorB }}>{driverB.last_name}</span>
            </div>
          </div>
        )}

        {/* Community vote — client component, shows results only after voting */}
        <VoteWidget
          slug={`${driverA.driver_ref}-vs-${driverB.driver_ref}`}
          driverARef={driverA.driver_ref}
          driverBRef={driverB.driver_ref}
          nameA={`${driverA.first_name} ${driverA.last_name}`}
          nameB={`${driverB.first_name} ${driverB.last_name}`}
          colorA={colorA}
          colorB={colorB}
        />
      </Card>
    </section>
  );
}

// ─── 8. ShareCard ──────────────────────────────────────────────────────────

function ShareCard({
  slug,
  driverA,
  driverB,
}: {
  slug: string;
  driverA: Driver;
  driverB: Driver;
}) {
  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;

  return (
    <section className="mb-10">
      <Card className="p-6 text-center">
        <p className="mb-1 text-sm font-semibold">Share this comparison</p>
        <p className="mb-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {nameA} vs {nameB} — settled by data.
        </p>
        <ShareButton slug={slug} nameA={nameA} nameB={nameB} />
      </Card>
    </section>
  );
}
