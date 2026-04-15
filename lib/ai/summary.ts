/**
 * AI comparison summary generator.
 *
 * Uses Groq SDK (llama-3.3-70b-versatile) to produce a 3-sentence analyst
 * verdict from a ComparisonResult. Results are cached in
 * driver_comparisons.ai_summary and regenerated weekly.
 *
 * Every summary is required to cite at least 2 specific numbers from the stats
 * so each page has unique, data-dense content that Google will index distinctly.
 *
 * Falls back to a template-based summary if the Groq API is unavailable
 * or the key is not configured.
 */

import Groq from "groq-sdk";
import type { ComparisonResult } from "../data/types";

// ─── Cache TTL ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Template fallback ─────────────────────────────────────────────────────

function templateSummary(comparison: ComparisonResult): string {
  const { driverA, driverB, statsA, statsB, headToHead } = comparison;

  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;

  const champsA = statsA.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;
  const champsB = statsB.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;

  // Sentence 1: wins + championships — always includes 2 specific numbers
  const leaderByWins = statsA.wins >= statsB.wins ? nameA : nameB;
  const winLeader = Math.max(statsA.wins, statsB.wins);
  const winTrailer = Math.min(statsA.wins, statsB.wins);
  const champLine =
    champsA + champsB > 0
      ? ` ${champsA > champsB ? nameA : champsB > champsA ? nameB : "Both drivers"} ${
          champsA === champsB
            ? `share ${champsA} world title${champsA > 1 ? "s" : ""}`
            : `lead${champsA !== champsB ? "s" : ""} ${Math.max(champsA, champsB)}-${Math.min(champsA, champsB)} on championships`
        }.`
      : "";

  const s1 = `${leaderByWins} leads on career wins ${winLeader}–${winTrailer}.${champLine}`;

  // Sentence 2: head-to-head with hard numbers when available
  let s2: string;
  if (headToHead.totalRaces >= 5) {
    const h2hLeader =
      headToHead.driverAWins >= headToHead.driverBWins ? nameA : nameB;
    const h2hWins = Math.max(headToHead.driverAWins, headToHead.driverBWins);
    const h2hLoss = Math.min(headToHead.driverAWins, headToHead.driverBWins);
    s2 = `In ${headToHead.totalRaces} head-to-head races, ${h2hLeader} came out ahead ${h2hWins} times against ${h2hLoss}.`;
  } else {
    const pprA = statsA.pointsPerRace.toFixed(1);
    const pprB = statsB.pointsPerRace.toFixed(1);
    const pprLeader = statsA.pointsPerRace >= statsB.pointsPerRace ? nameA : nameB;
    s2 = `${pprLeader} edges the points-per-race metric at ${Math.max(statsA.pointsPerRace, statsB.pointsPerRace).toFixed(1)} vs ${Math.min(statsA.pointsPerRace, statsB.pointsPerRace).toFixed(1)}, showing consistent scoring across ${pprLeader === nameA ? statsA.totalRaces : statsB.totalRaces} races.`;
    void pprA; void pprB;
  }

  // Sentence 3: poles + average finish — two more specific numbers
  const polesLeader = statsA.poles >= statsB.poles ? nameA : nameB;
  const polesMax = Math.max(statsA.poles, statsB.poles);
  const polesMin = Math.min(statsA.poles, statsB.poles);
  const avgA = statsA.avgFinishPosition.toFixed(1);
  const avgB = statsB.avgFinishPosition.toFixed(1);
  const consistLeader =
    statsA.avgFinishPosition <= statsB.avgFinishPosition ? nameA : nameB;

  const s3 =
    polesMax > 0
      ? `${polesLeader} has the qualifying edge with ${polesMax} poles to ${polesMin}, while ${consistLeader} holds the consistency advantage with a ${consistLeader === nameA ? avgA : avgB} average finish.`
      : `${consistLeader} holds the consistency advantage with a ${consistLeader === nameA ? avgA : avgB} average finish position versus ${consistLeader === nameA ? avgB : avgA}.`;

  return `${s1} ${s2} ${s3}`;
}

// ─── Groq prompt builder ───────────────────────────────────────────────────

function buildUserPrompt(comparison: ComparisonResult): string {
  const { driverA, driverB, statsA, statsB, headToHead } = comparison;
  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;

  const champsA = statsA.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;
  const champsB = statsB.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;

  const podiumRateA = statsA.totalRaces > 0
    ? ((statsA.podiums / statsA.totalRaces) * 100).toFixed(1)
    : "0.0";
  const podiumRateB = statsB.totalRaces > 0
    ? ((statsB.podiums / statsB.totalRaces) * 100).toFixed(1)
    : "0.0";

  return `Compare these two F1 drivers:

**${nameA}**
- Races: ${statsA.totalRaces} | Wins: ${statsA.wins} | Win rate: ${statsA.totalRaces > 0 ? ((statsA.wins / statsA.totalRaces) * 100).toFixed(1) : 0}%
- Poles: ${statsA.poles} | Podiums: ${statsA.podiums} (${podiumRateA}% podium rate)
- Championships: ${champsA} | DNFs: ${statsA.dnfs} | Avg finish: ${statsA.avgFinishPosition.toFixed(2)}
- Points/race: ${statsA.pointsPerRace.toFixed(2)} | Consistency score: ${(statsA.consistencyScore * 100).toFixed(0)}%

**${nameB}**
- Races: ${statsB.totalRaces} | Wins: ${statsB.wins} | Win rate: ${statsB.totalRaces > 0 ? ((statsB.wins / statsB.totalRaces) * 100).toFixed(1) : 0}%
- Poles: ${statsB.poles} | Podiums: ${statsB.podiums} (${podiumRateB}% podium rate)
- Championships: ${champsB} | DNFs: ${statsB.dnfs} | Avg finish: ${statsB.avgFinishPosition.toFixed(2)}
- Points/race: ${statsB.pointsPerRace.toFixed(2)} | Consistency score: ${(statsB.consistencyScore * 100).toFixed(0)}%

**Head-to-head** (races where both competed in same event):
- Total shared races: ${headToHead.totalRaces}
- ${nameA} finished ahead: ${headToHead.driverAWins} times
- ${nameB} finished ahead: ${headToHead.driverBWins} times
- Ties: ${headToHead.ties}`;
}

// ─── Groq call ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an authoritative Formula 1 analyst writing for an F1 statistics website. \
Write exactly 3 sentences delivering a sharp, opinionated verdict comparing two drivers. \
Rules you must follow:
1. Cite at least 2 specific numbers from the stats provided (e.g., "44 wins", "92.3% podium rate", "6 titles to 4").
2. Take a clear position on who has the stronger overall record — do not hedge or say "it depends".
3. Mention one underrated or surprising insight from the data (e.g., consistency, podium rate, reliability).
4. Output ONLY the 3 sentences — no intro, no headers, no bullet points, no preamble, no closing line.
5. Keep each sentence factual and grounded in the numbers above.`;

async function callGroq(comparison: ComparisonResult): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  const chat = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(comparison) },
    ],
    temperature: 0.4,
    max_tokens: 180,
  });

  const text = chat.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from Groq");
  return text;
}

// ─── Cache helpers (Supabase read/write) ──────────────────────────────────

async function readCachedSummary(slug: string): Promise<string | null> {
  // Dynamic import so scripts that import this module without a Supabase
  // environment still work (compute-comparisons.ts uses its own client).
  const { createServiceRoleClient } = await import("../supabase/client");
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("driver_comparisons")
    .select("ai_summary, ai_summary_generated_at")
    .eq("slug", slug)
    .is("season", null)
    .single();

  if (!data?.ai_summary || !data.ai_summary_generated_at) return null;

  const age = Date.now() - new Date(data.ai_summary_generated_at as string).getTime();
  if (age > CACHE_TTL_MS) return null;

  return data.ai_summary as string;
}

async function writeCachedSummary(
  slug: string,
  summary: string
): Promise<void> {
  const { createServiceRoleClient } = await import("../supabase/client");
  const supabase = createServiceRoleClient();

  await supabase
    .from("driver_comparisons")
    .update({
      ai_summary: summary,
      ai_summary_generated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .is("season", null);
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface AISummaryResult {
  text: string;
  /** true = came from Groq, false = template fallback */
  isAI: boolean;
}

/**
 * Get or generate a comparison summary for page rendering.
 *
 * Priority:
 *  1. Fresh cached Groq summary from Supabase (< 7 days old)
 *  2. Fresh Groq generation (written back to cache)
 *  3. Template fallback (if Groq unavailable)
 */
export async function getComparisonSummary(
  slug: string,
  comparison: ComparisonResult
): Promise<AISummaryResult> {
  // 1. Try cache
  try {
    const cached = await readCachedSummary(slug);
    if (cached) return { text: cached, isAI: true };
  } catch {
    // Cache read failed — continue to generate fresh
  }

  // 2. Try Groq
  try {
    const text = await callGroq(comparison);
    // Write to cache (best-effort, don't block page render)
    writeCachedSummary(slug, text).catch(() => null);
    return { text, isAI: true };
  } catch (err) {
    // Silently fall back — expected during static builds where GROQ_API_KEY is absent
    void err;
  }

  // 3. Template fallback — always includes specific numbers
  return { text: templateSummary(comparison), isAI: false };
}

/**
 * Generate a summary and return the text string only.
 * For use in compute scripts that manage their own caching.
 * Does NOT read from or write to Supabase — caller handles persistence.
 *
 * Throws on Groq failure so callers can decide whether to fall back.
 */
export async function generateComparisonSummary(
  comparison: ComparisonResult
): Promise<string> {
  return callGroq(comparison);
}

/**
 * Template-only summary — no network call, no Supabase.
 * Used as a cheap fallback in scripts when Groq is unavailable.
 */
export function generateTemplateSummary(comparison: ComparisonResult): string {
  return templateSummary(comparison);
}
