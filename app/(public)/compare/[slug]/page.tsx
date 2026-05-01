import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDB, hasDB } from "@/lib/db/client";
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
import { ShareButton, EmbedSection } from "@/components/comparison/ShareButton";
import { VoteWidget } from "@/components/comparison/VoteWidget";
import { CircuitBreakdown } from "@/components/comparison/CircuitBreakdown";
import { getComparisonSummary, type AISummaryResult } from "@/lib/ai/summary";
import { AdBanner } from "@/components/ui/AdBanner";
import { ComparisonViewTracker } from "@/components/comparison/ComparisonViewTracker";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-static";

// ─── Static Params ─────────────────────────────────────────────────────────
// Pre-render top 400 driver pairs at build time.
// Priority: legend seed pairs first, then current grid × current grid,
// then top historical pairs by win count.

/**
 * Top-50 legend pairs guaranteed to be pre-rendered at build time.
 * Uses Jolpica driver refs (lowercase_underscored).
 */
const LEGEND_PAIRS: [string, string][] = [
  ["senna", "prost"],
  ["hamilton", "schumacher"],
  ["verstappen", "hamilton"],
  ["fangio", "clark"],
  ["schumacher", "villeneuve"],
  ["senna", "mansell"],
  ["prost", "lauda"],
  ["hamilton", "button"],
  ["vettel", "alonso"],
  ["verstappen", "leclerc"],
  ["schumacher", "hakkinen"],
  ["senna", "schumacher"],
  ["alonso", "hamilton"],
  ["vettel", "hamilton"],
  ["lauda", "hunt"],
  ["mansell", "piquet"],
  ["hill", "schumacher"],
  ["prost", "mansell"],
  ["senna", "berger"],
  ["stewart", "rindt"],
  ["clark", "surtees"],
  ["fangio", "moss"],
  ["hill_damon", "villeneuve"],
  ["schumacher", "barrichello"],
  ["alonso", "raikkonen"],
  ["vettel", "webber"],
  ["hamilton", "rosberg"],
  ["verstappen", "norris"],
  ["leclerc", "sainz"],
  ["raikkonen", "massa"],
  ["prost", "piquet"],
  ["mansell", "senna"],
  ["coulthard", "hakkinen"],
  ["button", "perez"],
  ["alonso", "button"],
  ["vettel", "raikkonen"],
  ["hamilton", "alonso"],
  ["schumacher_mick", "verstappen"],
  ["lauda", "regazzoni"],
  ["moss", "hawthorn"],
  ["hill_graham", "clark"],
  ["andretti", "peterson"],
  ["piquet", "senna"],
  ["berger", "alesi"],
  ["fisichella", "alonso"],
  ["kubica", "hamilton"],
  ["rosberg_keke", "piquet"],
  ["schumacher", "coulthard"],
  ["hakkinen", "irvine"],
];

function legendSlug(a: string, b: string): string {
  const refs = [a, b].sort((x, y) => x.localeCompare(y));
  return `${refs[0]}-vs-${refs[1]}`;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  if (!hasDB()) return [];

  const db = getDB();
  const currentYear = new Date().getFullYear();

  const [{ results: comparisonRows }, { results: currentResults }] = await Promise.all([
    db.prepare(
      `SELECT slug, driver_a_id, driver_b_id, stats_json FROM driver_comparisons WHERE season IS NULL LIMIT 800`
    ).all<{ slug: string; driver_a_id: string; driver_b_id: string; stats_json: string | null }>(),

    db.prepare(
      `SELECT DISTINCT r.driver_id FROM results r
       JOIN races rc ON rc.id = r.race_id
       WHERE rc.season = ? AND r.is_sprint = 0`
    ).bind(currentYear).all<{ driver_id: string }>(),
  ]);

  if (comparisonRows.length === 0) return [];

  const currentDriverIds = new Set(currentResults.map((r) => r.driver_id));

  const scoreRow = (row: { slug: string; driver_a_id: string; driver_b_id: string; stats_json: string | null }): number => {
    const isCurrentA = currentDriverIds.has(row.driver_a_id);
    const isCurrentB = currentDriverIds.has(row.driver_b_id);
    const currentBoost = isCurrentA && isCurrentB ? 1000 : isCurrentA || isCurrentB ? 500 : 0;
    let combinedWins = 0;
    if (row.stats_json) {
      try {
        const parsed = JSON.parse(row.stats_json) as { statsA?: { wins?: number }; statsB?: { wins?: number } };
        combinedWins = (parsed.statsA?.wins ?? 0) + (parsed.statsB?.wins ?? 0);
      } catch { /* ignore */ }
    }
    return currentBoost + combinedWins;
  };

  const legendSlugs = new Set(LEGEND_PAIRS.map(([a, b]) => legendSlug(a, b)));
  const dbSlugs = new Set(comparisonRows.filter((r) => r.slug).map((r) => r.slug));
  const guaranteedSlugs = [...legendSlugs].filter((s) => dbSlugs.has(s));

  const ranked = comparisonRows
    .filter((row) => row.slug && !legendSlugs.has(row.slug))
    .sort((a, b) => scoreRow(b) - scoreRow(a))
    .slice(0, 400 - guaranteedSlugs.length)
    .map((row) => row.slug);

  return [...guaranteedSlugs, ...ranked].map((slug) => ({ slug }));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const parsed = parseComparisonSlug(params.slug);
  if (!parsed) return { title: "Comparison Not Found" };

  const canonicalSlug = buildComparisonSlug(parsed.driverARef, parsed.driverBRef);

  if (!hasDB()) {
    const fallbackNameA = parsed.driverARef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const fallbackNameB = parsed.driverBRef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${fallbackNameA} vs ${fallbackNameB} - F1 Driver Comparison | F1-Versus`,
      description: `Head-to-head F1 stats: ${fallbackNameA} vs ${fallbackNameB}. Wins, poles, podiums, consistency score, teammate battles, and more.`,
      alternates: { canonical: `/compare/${canonicalSlug}` },
    };
  }

  const db = getDB();

  const [dA, dB, cached] = await Promise.all([
    db.prepare(`SELECT first_name, last_name FROM drivers WHERE driver_ref = ?`).bind(parsed.driverARef).first<{ first_name: string; last_name: string }>(),
    db.prepare(`SELECT first_name, last_name FROM drivers WHERE driver_ref = ?`).bind(parsed.driverBRef).first<{ first_name: string; last_name: string }>(),
    db.prepare(`SELECT stats_json FROM driver_comparisons WHERE slug = ? AND season IS NULL`).bind(canonicalSlug).first<{ stats_json: string | null }>(),
  ]);

  const nameA = dA ? `${dA.first_name} ${dA.last_name}` : parsed.driverARef;
  const nameB = dB ? `${dB.first_name} ${dB.last_name}` : parsed.driverBRef;

  const title = `${nameA} vs ${nameB} — F1 Driver Comparison | F1-Versus`;

  let description: string;
  if (cached?.stats_json) {
    type StatsShape = {
      statsA: { wins: number; poles: number; podiums: number };
      statsB: { wins: number; poles: number; podiums: number };
      headToHead: { totalRaces: number; driverAWins: number; driverBWins: number };
    };
    let s: StatsShape;
    try { s = JSON.parse(cached.stats_json) as StatsShape; } catch { s = { statsA: { wins: 0, poles: 0, podiums: 0 }, statsB: { wins: 0, poles: 0, podiums: 0 }, headToHead: { totalRaces: 0, driverAWins: 0, driverBWins: 0 } }; }
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
          url: `/api/og/${canonicalSlug}`,
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
      images: [`/api/og/${canonicalSlug}`],
    },
    alternates: {
      canonical: `/compare/${canonicalSlug}`,
    },
  };
}

// ─── Data Fetching ─────────────────────────────────────────────────────────

async function getOrComputeComparison(slug: string): Promise<ComparisonResult | null> {
  const db = getDB();
  const parsed = parseComparisonSlug(slug);
  if (!parsed) return null;

  const [dA, dB] = await Promise.all([
    db.prepare(`SELECT id, driver_ref FROM drivers WHERE driver_ref = ?`).bind(parsed.driverARef).first<{ id: string; driver_ref: string }>(),
    db.prepare(`SELECT id, driver_ref FROM drivers WHERE driver_ref = ?`).bind(parsed.driverBRef).first<{ id: string; driver_ref: string }>(),
  ]);
  if (!dA || !dB) return null;

  const cached = await db
    .prepare(
      `SELECT stats_json FROM driver_comparisons
       WHERE season IS NULL
         AND ((driver_a_id = ? AND driver_b_id = ?) OR (driver_a_id = ? AND driver_b_id = ?))`
    )
    .bind(dA.id, dB.id, dB.id, dA.id)
    .first<{ stats_json: string | null }>();

  if (cached?.stats_json) {
    try { return JSON.parse(cached.stats_json) as ComparisonResult; } catch { /* fall through */ }
  }

  try {
    const result = await computeComparison(dA.id, dB.id);
    const canonicalSlug = buildComparisonSlug(parsed.driverARef, parsed.driverBRef);
    const aIsCanonical = parsed.driverARef.localeCompare(parsed.driverBRef) <= 0;
    const ts = new Date().toISOString();
    const statsJson = JSON.stringify(result);
    try {
      await db
        .prepare(
          `INSERT INTO driver_comparisons (id, driver_a_id, driver_b_id, slug, season, stats_json, computed_stats, last_computed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
           ON CONFLICT (driver_a_id, driver_b_id, season) DO UPDATE SET
             stats_json = excluded.stats_json, computed_stats = excluded.computed_stats,
             last_computed_at = excluded.last_computed_at, updated_at = excluded.updated_at`
        )
        .bind(
          crypto.randomUUID(),
          aIsCanonical ? dA.id : dB.id,
          aIsCanonical ? dB.id : dA.id,
          canonicalSlug,
          statsJson,
          statsJson,
          ts, ts, ts
        )
        .run();
    } catch { /* best-effort cache write */ }
    return result;
  } catch {
    return null;
  }
}

async function getTeamColors(
  driverARef: string,
  driverBRef: string
): Promise<{ colorA: string; colorB: string }> {
  const db = getDB();

  const [rowA, rowB] = await Promise.all([
    db.prepare(
      `SELECT c.constructor_ref, c.color_hex
       FROM results r
       JOIN constructors c ON c.id = r.constructor_id
       JOIN drivers d ON d.id = r.driver_id
       WHERE d.driver_ref = ? AND r.is_sprint = 0
       ORDER BY r.race_id DESC LIMIT 1`
    ).bind(driverARef).first<{ constructor_ref: string; color_hex: string | null }>(),

    db.prepare(
      `SELECT c.constructor_ref, c.color_hex
       FROM results r
       JOIN constructors c ON c.id = r.constructor_id
       JOIN drivers d ON d.id = r.driver_id
       WHERE d.driver_ref = ? AND r.is_sprint = 0
       ORDER BY r.race_id DESC LIMIT 1`
    ).bind(driverBRef).first<{ constructor_ref: string; color_hex: string | null }>(),
  ]);

  return {
    colorA: rowA?.color_hex ?? getTeamColor(rowA?.constructor_ref ?? "") ?? "#e10600",
    colorB: rowB?.color_hex ?? getTeamColor(rowB?.constructor_ref ?? "") ?? "#3b82f6",
  };
}

// ─── Circuit breakdown data ─────────────────────────────────────────────────

async function getCircuitBreakdowns(
  driverARef: string,
  driverBRef: string
): Promise<CircuitBreakdownRow[]> {
  const db = getDB();

  const [dA, dB] = await Promise.all([
    db.prepare(`SELECT id FROM drivers WHERE driver_ref = ?`).bind(driverARef).first<{ id: string }>(),
    db.prepare(`SELECT id FROM drivers WHERE driver_ref = ?`).bind(driverBRef).first<{ id: string }>(),
  ]);
  if (!dA || !dB) return [];

  type FlatResult = {
    race_id: string; season: number; round: number; race_name: string; date: string;
    circuit_ref: string; circuit_name: string; circuit_country: string | null; circuit_type: "street" | "permanent" | null;
    weather_wet: number | null;
    position: number | null; grid: number | null; points: number; status: string | null; fastest_lap_rank: number | null;
  };

  const resultSql = `
    SELECT rc.id AS race_id, rc.season, rc.round, rc.name AS race_name, rc.date,
           c.circuit_ref, c.name AS circuit_name, c.country AS circuit_country, c.type AS circuit_type,
           w.wet AS weather_wet,
           r.position, r.grid, r.points, r.status, r.fastest_lap_rank
    FROM results r
    JOIN races rc ON rc.id = r.race_id
    LEFT JOIN circuits c ON c.id = rc.circuit_id
    LEFT JOIN weather_conditions w ON w.race_id = rc.id
    WHERE r.driver_id = ? AND r.is_sprint = 0`;

  const [{ results: rowsA }, { results: rowsB }] = await Promise.all([
    db.prepare(resultSql).bind(dA.id).all<FlatResult>(),
    db.prepare(resultSql).bind(dB.id).all<FlatResult>(),
  ]);

  const allRaceIds = Array.from(new Set([...rowsA.map((r) => r.race_id), ...rowsB.map((r) => r.race_id)]));
  if (allRaceIds.length === 0) return [];

  const raceIdPlaceholders = allRaceIds.map(() => "?").join(", ");

  const [{ results: qualiA }, { results: qualiB }] = await Promise.all([
    db.prepare(`SELECT race_id, position FROM qualifying WHERE driver_id = ? AND race_id IN (${raceIdPlaceholders})`).bind(dA.id, ...allRaceIds).all<{ race_id: string; position: number | null }>(),
    db.prepare(`SELECT race_id, position FROM qualifying WHERE driver_id = ? AND race_id IN (${raceIdPlaceholders})`).bind(dB.id, ...allRaceIds).all<{ race_id: string; position: number | null }>(),
  ]);

  const qualiMapA = new Map(qualiA.map((q) => [q.race_id, q.position]));
  const qualiMapB = new Map(qualiB.map((q) => [q.race_id, q.position]));

  type CircuitAccum = {
    circuitRef: string; circuitName: string; country: string | null; type: "street" | "permanent" | null;
    racesA: CircuitBreakdownRow["racesA"]; racesB: CircuitBreakdownRow["racesB"];
  };
  const byCircuit = new Map<string, CircuitAccum>();

  function getOrCreate(r: FlatResult): CircuitAccum {
    if (!byCircuit.has(r.circuit_ref)) {
      byCircuit.set(r.circuit_ref, { circuitRef: r.circuit_ref, circuitName: r.circuit_name, country: r.circuit_country, type: r.circuit_type, racesA: [], racesB: [] });
    }
    return byCircuit.get(r.circuit_ref)!;
  }

  for (const r of rowsA) {
    if (!r.circuit_ref) continue;
    getOrCreate(r).racesA.push({ season: r.season, round: r.round, raceName: r.race_name, date: r.date, position: r.position, grid: r.grid, points: r.points, status: r.status, qualiPosition: qualiMapA.get(r.race_id) ?? null, wet: r.weather_wet === 1 });
  }
  for (const r of rowsB) {
    if (!r.circuit_ref) continue;
    getOrCreate(r).racesB.push({ season: r.season, round: r.round, raceName: r.race_name, date: r.date, position: r.position, grid: r.grid, points: r.points, status: r.status, qualiPosition: qualiMapB.get(r.race_id) ?? null, wet: r.weather_wet === 1 });
  }

  function computeStats(races: CircuitBreakdownRow["racesA"]): CircuitBreakdownStats {
    const finishes = races.filter((r) => r.position !== null);
    const avgFinish = finishes.length > 0 ? finishes.reduce((s, r) => s + r.position!, 0) / finishes.length : null;
    const bestFinish = finishes.length > 0 ? Math.min(...finishes.map((r) => r.position!)) : null;
    return { races: races.length, wins: races.filter((r) => r.position === 1).length, podiums: races.filter((r) => r.position !== null && r.position <= 3).length, poles: races.filter((r) => r.qualiPosition === 1).length, bestFinish, avgFinish, dnfs: races.filter((r) => r.position === null).length };
  }

  return Array.from(byCircuit.values())
    .filter((c) => c.racesA.length > 0 || c.racesB.length > 0)
    .map((c) => ({ ...c, racesA: c.racesA.sort((a, b) => b.season - a.season), racesB: c.racesB.sort((a, b) => b.season - a.season), statsA: computeStats(c.racesA), statsB: computeStats(c.racesB) }))
    .sort((a, b) => Math.max(b.statsA.races, b.statsB.races) - Math.max(a.statsA.races, a.statsB.races));
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
  const db = getDB();

  const [dA, dB] = await Promise.all([
    db.prepare(`SELECT id FROM drivers WHERE driver_ref = ?`).bind(driverARef).first<{ id: string }>(),
    db.prepare(`SELECT id FROM drivers WHERE driver_ref = ?`).bind(driverBRef).first<{ id: string }>(),
  ]);
  if (!dA || !dB) return [];

  const { results: rows } = await db
    .prepare(
      `SELECT dc.slug,
              da.driver_ref AS a_ref, da.first_name AS a_first, da.last_name AS a_last,
              db.driver_ref AS b_ref, db.first_name AS b_first, db.last_name AS b_last
       FROM driver_comparisons dc
       JOIN drivers da ON da.id = dc.driver_a_id
       JOIN drivers db ON db.id = dc.driver_b_id
       WHERE dc.season IS NULL AND dc.slug != ?
         AND (dc.driver_a_id IN (?, ?) OR dc.driver_b_id IN (?, ?))
       LIMIT 20`
    )
    .bind(currentSlug, dA.id, dB.id, dA.id, dB.id)
    .all<{ slug: string; a_ref: string; a_first: string; a_last: string; b_ref: string; b_first: string; b_last: string }>();

  if (rows.length === 0) return [];

  const scored = rows
    .map((r) => {
      const hasA = r.a_ref === driverARef || r.b_ref === driverARef;
      const hasB = r.a_ref === driverBRef || r.b_ref === driverBRef;
      return { r, score: (hasA ? 1 : 0) + (hasB ? 1 : 0) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 4);

  const relatedRefs = scored.flatMap(({ r }) => [r.a_ref, r.b_ref]);
  const refPlaceholders = relatedRefs.map(() => "?").join(", ");

  const { results: colorRows } = await db
    .prepare(
      `SELECT d.driver_ref, c.color_hex
       FROM results r
       JOIN drivers d ON d.id = r.driver_id
       JOIN constructors c ON c.id = r.constructor_id
       WHERE d.driver_ref IN (${refPlaceholders}) AND r.is_sprint = 0
       ORDER BY r.race_id DESC`
    )
    .bind(...relatedRefs)
    .all<{ driver_ref: string; color_hex: string }>();

  const colorMap = new Map<string, string>();
  for (const row of colorRows) {
    if (!colorMap.has(row.driver_ref) && row.color_hex) colorMap.set(row.driver_ref, row.color_hex);
  }

  return scored.map(({ r }) => ({
    slug: r.slug,
    nameA: `${r.a_first} ${r.a_last}`,
    nameB: `${r.b_first} ${r.b_last}`,
    colorA: colorMap.get(r.a_ref) ?? null,
    colorB: colorMap.get(r.b_ref) ?? null,
  }));
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
  if (!hasDB()) notFound();

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
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
        {/* min-height reserves space during Recharts hydration to prevent CLS */}
        <div style={{ minHeight: 300 }}>
        <SeasonTimeline
          nameA={driverA.last_name}
          nameB={driverB.last_name}
          colorA={colorA}
          colorB={colorB}
          breakdownA={statsA.seasonBreakdown}
          breakdownB={statsB.seasonBreakdown}
        />
        </div>
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
    <div className="f1-section-label mb-4">{children}</div>
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
    <header className="mb-8">
      <div
        className="f1-hero f1-scanlines rounded-xl overflow-hidden"
        style={{ border: `1px solid rgba(255,255,255,0.06)` }}
      >
        {/* Corner brackets */}
        <div className="f1-corner f1-corner--tl" style={{ color: colorA }} />
        <div className="f1-corner f1-corner--tr" style={{ color: colorB }} />
        <div className="f1-corner f1-corner--bl" style={{ color: colorA }} />
        <div className="f1-corner f1-corner--br" style={{ color: colorB }} />

        {/* Split background glow */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0,
          background: `linear-gradient(105deg, ${colorA}18 0%, transparent 45%, transparent 55%, ${colorB}18 100%)` }} />

        <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr auto 1fr", minHeight: 200 }}>

          {/* ── Driver A ── */}
          <Link
            href={`/drivers/${driverA.driver_ref}`}
            style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 24px 32px 32px", textDecoration: "none", position: "relative" }}
          >
            {/* Ghost last name */}
            <span className="f1-driver-number" style={{ color: colorA, right: 0, bottom: -8 }}>
              {driverA.last_name.toUpperCase()}
            </span>
            {/* Nationality eyebrow */}
            {driverA.nationality && (
              <span className="f1-name-first" style={{ color: colorA, marginBottom: 4 }}>
                {driverA.nationality}
              </span>
            )}
            {/* First name */}
            <span style={{ fontFamily: "var(--font-condensed)", fontWeight: 600, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
              {driverA.first_name}
            </span>
            {/* Last name */}
            <h1 className="f1-name-last" style={{ color: colorA, fontSize: "clamp(28px, 5vw, 52px)" }}>
              {driverA.last_name}
            </h1>
            {/* Team color bar */}
            <div style={{ width: 40, height: 3, backgroundColor: colorA, marginTop: 10, borderRadius: 2 }} />
            {/* Avatar */}
            {driverA.headshot_url && (
              <div style={{ position: "absolute", right: 16, bottom: 0, opacity: 0.25 }}>
                <Image src={driverA.headshot_url} alt={driverA.last_name} width={80} height={80} style={{ objectFit: "cover", borderRadius: "50%" }} />
              </div>
            )}
          </Link>

          {/* ── VS Centre ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 8px", gap: 8, zIndex: 2 }}>
            {/* Big VS ghost text */}
            <span className="f1-vs-text">VS</span>
            {sharedSeasons.length > 0 && (
              <span style={{ fontFamily: "var(--font-condensed)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
                {sharedSeasons.length} shared season{sharedSeasons.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* ── Driver B ── */}
          <Link
            href={`/drivers/${driverB.driver_ref}`}
            style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", padding: "32px 32px 32px 24px", textDecoration: "none", position: "relative", textAlign: "right" }}
          >
            {/* Ghost last name */}
            <span className="f1-driver-number" style={{ color: colorB, left: 0, bottom: -8 }}>
              {driverB.last_name.toUpperCase()}
            </span>
            {driverB.nationality && (
              <span className="f1-name-first" style={{ color: colorB, marginBottom: 4 }}>
                {driverB.nationality}
              </span>
            )}
            <span style={{ fontFamily: "var(--font-condensed)", fontWeight: 600, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
              {driverB.first_name}
            </span>
            <h1 className="f1-name-last" style={{ color: colorB, fontSize: "clamp(28px, 5vw, 52px)" }}>
              {driverB.last_name}
            </h1>
            <div style={{ width: 40, height: 3, backgroundColor: colorB, marginTop: 10, borderRadius: 2, marginLeft: "auto" }} />
            {driverB.headshot_url && (
              <div style={{ position: "absolute", left: 16, bottom: 0, opacity: 0.25 }}>
                <Image src={driverB.headshot_url} alt={driverB.last_name} width={80} height={80} style={{ objectFit: "cover", borderRadius: "50%" }} />
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
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

  // Key stats for the quick glance row
  const quickStats = [
    { label: "Wins",    a: statsA.wins,    b: statsB.wins },
    { label: "Poles",   a: statsA.poles,   b: statsB.poles },
    { label: "Podiums", a: statsA.podiums, b: statsB.podiums },
    { label: "Races",   a: statsA.totalRaces, b: statsB.totalRaces },
  ];

  return (
    <section className="mb-8">
      {/* Quick stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${quickStats.length}, 1fr)`,
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 2,
          background: "#0a0a0a",
        }}
      >
        {quickStats.map((s, i) => {
          const aLeads = s.a > s.b;
          const bLeads = s.b > s.a;
          return (
            <div
              key={s.label}
              style={{
                borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                padding: "16px 12px",
                background: aLeads
                  ? `linear-gradient(160deg, ${colorA}12, transparent)`
                  : bLeads
                  ? `linear-gradient(200deg, transparent, ${colorB}12)`
                  : undefined,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 4 }}>
                <span
                  className="f1-stat-value"
                  style={{ color: aLeads ? colorA : "#fff", textAlign: "right", textShadow: aLeads ? `0 0 20px ${colorA}66` : "none" }}
                >
                  {s.a}
                </span>
                <span className="f1-stat-label" style={{ fontSize: 10 }}>{s.label}</span>
                <span
                  className="f1-stat-value"
                  style={{ color: bLeads ? colorB : "#fff", textAlign: "left", textShadow: bLeads ? `0 0 20px ${colorB}66` : "none" }}
                >
                  {s.b}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* H2H bar + AI summary + Vote */}
      <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", background: "#0a0a0a" }}>

        {/* H2H progress bar */}
        {total > 0 && (
          <div style={{ padding: "16px 20px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-condensed)", fontSize: 13, fontWeight: 700, color: colorA }}>
                {headToHead.driverAWins} ahead
              </span>
              <span style={{ fontFamily: "var(--font-condensed)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                {headToHead.totalRaces} shared races
              </span>
              <span style={{ fontFamily: "var(--font-condensed)", fontSize: 13, fontWeight: 700, color: colorB }}>
                {headToHead.driverBWins} ahead
              </span>
            </div>
            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#1a1a1a" }}>
              <div style={{ width: `${pctA}%`, background: colorA, boxShadow: `0 0 8px ${colorA}88` }} />
              {headToHead.ties > 0 && (
                <div style={{ width: `${(headToHead.ties / total) * 100}%`, background: "#333" }} />
              )}
              <div style={{ width: `${pctB}%`, background: colorB, boxShadow: `0 0 8px ${colorB}88` }} />
            </div>
          </div>
        )}

        {/* AI summary */}
        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            {aiSummary.isAI ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 4, padding: "2px 8px" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                AI Analysis
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#555" }}>Analysis</span>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>{aiSummary.text}</p>
        </div>

        {/* Vote */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "16px 20px" }}>
          <VoteWidget
            slug={`${driverA.driver_ref}-vs-${driverB.driver_ref}`}
            driverARef={driverA.driver_ref}
            driverBRef={driverB.driver_ref}
            nameA={`${driverA.first_name} ${driverA.last_name}`}
            nameB={`${driverB.first_name} ${driverB.last_name}`}
            colorA={colorA}
            colorB={colorB}
          />
        </div>
      </div>
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
        <EmbedSection slug={slug} />
      </Card>
    </section>
  );
}
