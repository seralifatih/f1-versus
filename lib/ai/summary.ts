/**
 * AI comparison summary generator.
 *
 * Uses Groq (llama-3.3-70b-versatile) to produce a 3-sentence analyst
 * verdict from a ComparisonResult. Results are cached in
 * driver_comparisons.ai_summary and regenerated weekly.
 *
 * Groq is used instead of Anthropic here because these short cached summaries
 * are materially cheaper to generate while preserving the same fallback path.
 *
 * Falls back to a template-based summary if the Groq API is unavailable
 * or the key is not configured.
 */

import { createServiceRoleClient } from "../supabase/client";
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

  // Sentence 1: win / championship overview
  const leaderByWins = statsA.wins >= statsB.wins ? nameA : nameB;
  const winLeader = Math.max(statsA.wins, statsB.wins);
  const winTrailer = Math.min(statsA.wins, statsB.wins);
  const champLine =
    champsA + champsB > 0
      ? ` ${champsA > champsB ? nameA : champsB > champsA ? nameB : "Both drivers"} ${
          champsA === champsB
            ? `share ${champsA} world title${champsA > 1 ? "s" : ""}`
            : `hold${champsA !== 1 && champsB !== 1 ? "" : "s"} ${Math.max(
                champsA,
                champsB
              )} championship${Math.max(champsA, champsB) > 1 ? "s" : ""} to ${Math.min(champsA, champsB)}`
        }.`
      : "";

  const s1 = `${leaderByWins} leads on career wins with ${winLeader} victories to ${winTrailer}.${champLine}`;

  // Sentence 2: head-to-head or reliability
  let s2: string;
  if (headToHead.totalRaces >= 10) {
    const h2hLeader =
      headToHead.driverAWins >= headToHead.driverBWins ? nameA : nameB;
    const h2hWins = Math.max(
      headToHead.driverAWins,
      headToHead.driverBWins
    );
    const h2hLoss = Math.min(
      headToHead.driverAWins,
      headToHead.driverBWins
    );
    s2 = `In ${headToHead.totalRaces} races where they competed together, ${h2hLeader} finished ahead ${h2hWins} times to ${h2hLoss}.`;
  } else {
    const dnfRateA =
      statsA.totalRaces > 0 ? statsA.dnfs / statsA.totalRaces : 0;
    const dnfRateB =
      statsB.totalRaces > 0 ? statsB.dnfs / statsB.totalRaces : 0;
    const moreReliable = dnfRateA <= dnfRateB ? nameA : nameB;
    s2 = `${moreReliable} has shown stronger reliability across their career with fewer mechanical retirements.`;
  }

  // Sentence 3: poles / consistency
  const polesLeader = statsA.poles >= statsB.poles ? nameA : nameB;
  const polesMax = Math.max(statsA.poles, statsB.poles);
  const polesMin = Math.min(statsA.poles, statsB.poles);
  const avgA = statsA.avgFinishPosition.toFixed(1);
  const avgB = statsB.avgFinishPosition.toFixed(1);
  const consistLeader =
    statsA.avgFinishPosition <= statsB.avgFinishPosition ? nameA : nameB;

  const s3 =
    polesMax > 0
      ? `${polesLeader} has the edge in qualifying with ${polesMax} poles to ${polesMin}, while ${consistLeader} edges the consistency battle with a ${
          consistLeader === nameA ? avgA : avgB
        } average finish.`
      : `${consistLeader} holds the consistency advantage with a ${
          consistLeader === nameA ? avgA : avgB
        } average finish position compared to ${
          consistLeader === nameA ? avgB : avgA
        }.`;

  return `${s1} ${s2} ${s3}`;
}

// ─── Groq call ─────────────────────────────────────────────────────────────

function buildPrompt(comparison: ComparisonResult): string {
  const { driverA, driverB, statsA, statsB, headToHead } = comparison;
  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;

  const champsA = statsA.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;
  const champsB = statsB.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;

  return `Compare these two F1 drivers:

**${nameA}**
- Races: ${statsA.totalRaces} | Wins: ${statsA.wins} | Poles: ${statsA.poles} | Podiums: ${statsA.podiums}
- Championships: ${champsA} | DNFs: ${statsA.dnfs} | Avg finish: ${statsA.avgFinishPosition.toFixed(2)}
- Points/race: ${statsA.pointsPerRace.toFixed(2)} | Consistency: ${(statsA.consistencyScore * 100).toFixed(0)}%

**${nameB}**
- Races: ${statsB.totalRaces} | Wins: ${statsB.wins} | Poles: ${statsB.poles} | Podiums: ${statsB.podiums}
- Championships: ${champsB} | DNFs: ${statsB.dnfs} | Avg finish: ${statsB.avgFinishPosition.toFixed(2)}
- Points/race: ${statsB.pointsPerRace.toFixed(2)} | Consistency: ${(statsB.consistencyScore * 100).toFixed(0)}%

**Head-to-head** (races where both competed):
- Total shared races: ${headToHead.totalRaces}
- ${nameA} finished ahead: ${headToHead.driverAWins} times
- ${nameB} finished ahead: ${headToHead.driverBWins} times`;
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are an F1 analyst. Write a concise, opinionated 3-sentence verdict comparing these two drivers based on the stats provided. Be specific about numbers. Take a position. Output only the 3 sentences — no headers, no bullet points, no preamble.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from Groq");
  return text;
}

// ─── Cache helpers ─────────────────────────────────────────────────────────

async function readCachedSummary(slug: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("driver_comparisons")
    .select("ai_summary, ai_summary_generated_at")
    .eq("slug", slug)
    .is("season", null)
    .single();

  if (!data?.ai_summary || !data.ai_summary_generated_at) return null;

  const age = Date.now() - new Date(data.ai_summary_generated_at).getTime();
  if (age > CACHE_TTL_MS) return null; // stale

  return data.ai_summary as string;
}

async function writeCachedSummary(
  slug: string,
  summary: string
): Promise<void> {
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
 * Get or generate a comparison summary.
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
    // Cache read failed — continue
  }

  // 2. Try Groq
  try {
    const prompt = buildPrompt(comparison);
    const text = await callGroq(prompt);

    // Write to cache (best-effort)
    writeCachedSummary(slug, text).catch(() => null);

    return { text, isAI: true };
  } catch (err) {
    console.warn("[AI Summary] Groq unavailable, using template fallback:", err);
  }

  // 3. Template fallback
  return { text: templateSummary(comparison), isAI: false };
}
