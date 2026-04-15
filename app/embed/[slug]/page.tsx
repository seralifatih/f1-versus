/**
 * Chromeless embed widget for driver comparisons.
 * Designed to be loaded in an <iframe> at 600×400.
 * Includes backlink to full comparison page.
 */

import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { computeComparison } from "@/lib/comparison/compute";
import {
  parseComparisonSlug,
  buildComparisonSlug,
  getTeamColor,
  type ComparisonResult,
  type Driver,
} from "@/lib/data/types";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

// ─── Static Params ─────────────────────────────────────────────────────────
// Pre-render same legend pairs as compare page

const EMBED_PAIRS: [string, string][] = [
  ["senna", "prost"],
  ["hamilton", "schumacher"],
  ["verstappen", "hamilton"],
  ["vettel", "alonso"],
  ["verstappen", "leclerc"],
  ["schumacher", "hakkinen"],
  ["senna", "schumacher"],
  ["alonso", "hamilton"],
  ["vettel", "hamilton"],
  ["lauda", "hunt"],
];

export async function generateStaticParams() {
  return EMBED_PAIRS.map(([a, b]) => ({
    slug: buildComparisonSlug(a, b),
  }));
}

// ─── Data Fetching ─────────────────────────────────────────────────────────

async function getEmbedData(slug: string): Promise<{
  driverA: Driver;
  driverB: Driver;
  comparison: ComparisonResult;
  colorA: string;
  colorB: string;
} | null> {
  if (!hasPublicSupabaseConfig()) return null;

  const parsed = parseComparisonSlug(slug);
  if (!parsed) return null;

  try {
  const supabase = createServerClient();

  const [{ data: dA }, { data: dB }] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, nationality, headshot_url, dob")
      .eq("driver_ref", parsed.driverARef)
      .single(),
    supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, nationality, headshot_url, dob")
      .eq("driver_ref", parsed.driverBRef)
      .single(),
  ]);

  if (!dA || !dB) return null;

  const canonicalSlug = buildComparisonSlug(parsed.driverARef, parsed.driverBRef);

  // Try cached first, fall back to compute
  const { data: cached } = await supabase
    .from("driver_comparisons")
    .select("stats_json")
    .eq("slug", canonicalSlug)
    .is("season", null)
    .single();

  let comparison: ComparisonResult | null = null;
  if (cached?.stats_json) {
    comparison = cached.stats_json as ComparisonResult;
  } else {
    comparison = await computeComparison(dA.id, dB.id);
  }

  if (!comparison) return null;

  // Resolve team colors
  const [{ data: conA }, { data: conB }] = await Promise.all([
    supabase
      .from("results")
      .select("constructors(color_hex, constructor_ref)")
      .eq("driver_id", dA.id)
      .eq("is_sprint", false)
      .order("race_id", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("results")
      .select("constructors(color_hex, constructor_ref)")
      .eq("driver_id", dB.id)
      .eq("is_sprint", false)
      .order("race_id", { ascending: false })
      .limit(1)
      .single(),
  ]);

  type ConRow = { color_hex: string | null; constructor_ref: string };
  const cA = (Array.isArray(conA?.constructors) ? conA.constructors[0] : conA?.constructors) as ConRow | null;
  const cB = (Array.isArray(conB?.constructors) ? conB.constructors[0] : conB?.constructors) as ConRow | null;
  const colorA = cA?.color_hex ?? getTeamColor(cA?.constructor_ref ?? "") ?? "#e10600";
  const colorB = cB?.color_hex ?? getTeamColor(cB?.constructor_ref ?? "") ?? "#3b82f6";

  return {
    driverA: dA as Driver,
    driverB: dB as Driver,
    comparison,
    colorA,
    colorB,
  };
  } catch {
    return null;
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function EmbedPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getEmbedData(params.slug);

  // No data at build time (missing env vars) — render minimal shell.
  // At runtime on Cloudflare the real env vars are present and data loads.
  if (!data) {
    const parsed = parseComparisonSlug(params.slug);
    const siteUrl = getSiteUrl();
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } html, body { width: 100%; height: 100%; background: #0a0a0a; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; }`}</style>
        </head>
        <body>
          <a href={`${siteUrl}/compare/${params.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>
            {parsed ? `${parsed.driverARef} vs ${parsed.driverBRef}` : "F1 Comparison"} — View on f1-versus.com
          </a>
        </body>
      </html>
    );
  }

  const { driverA, driverB, comparison, colorA, colorB } = data;
  const siteUrl = getSiteUrl();
  const fullPageUrl = `${siteUrl}/compare/${params.slug}`;

  const nameA = `${driverA.first_name} ${driverA.last_name}`;
  const nameB = `${driverB.first_name} ${driverB.last_name}`;

  const winsA = comparison.statsA.wins;
  const winsB = comparison.statsB.wins;
  const polesA = comparison.statsA.poles;
  const polesB = comparison.statsB.poles;
  const podiumsA = comparison.statsA.podiums;
  const podiumsB = comparison.statsB.podiums;
  const champA = comparison.statsA.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;
  const champB = comparison.statsB.seasonBreakdown.filter(
    (s) => s.championship_position === 1
  ).length;
  const h2hA = comparison.headToHead.driverAWins;
  const h2hB = comparison.headToHead.driverBWins;
  const h2hTotal = comparison.headToHead.totalRaces;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; overflow: hidden; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0a0a0a;
            color: #fff;
          }
        `}</style>
      </head>
      <body>
        <div
          style={{
            width: "600px",
            height: "400px",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0a0a0a",
            border: "1px solid #1a1a1a",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Top color strip */}
          <div style={{ display: "flex", height: "4px", flexShrink: 0 }}>
            <div style={{ flex: 1, backgroundColor: colorA }} />
            <div style={{ flex: 1, backgroundColor: colorB }} />
          </div>

          {/* Main content */}
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              padding: "16px 20px",
              gap: "12px",
            }}
          >
            {/* Driver A */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                flex: 1,
                gap: "10px",
              }}
            >
              {/* Avatar + name */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {driverA.headshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={driverA.headshot_url}
                    alt={nameA}
                    width={52}
                    height={52}
                    style={{
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: `2px solid ${colorA}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      backgroundColor: "#1a1a1a",
                      border: `2px solid ${colorA}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      fontWeight: 900,
                      color: colorA,
                      flexShrink: 0,
                    }}
                  >
                    {driverA.last_name[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    {driverA.first_name}
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 900,
                      lineHeight: 1.1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {driverA.last_name}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: "16px" }}>
                <EmbedStat value={winsA} label="Wins" color={colorA} />
                <EmbedStat value={polesA} label="Poles" color={colorA} />
                <EmbedStat value={podiumsA} label="Pods" color={colorA} />
                {champA > 0 && (
                  <EmbedStat value={champA} label="WDC" color={colorA} />
                )}
              </div>
            </div>

            {/* Center — VS + H2H */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                flexShrink: 0,
                width: "80px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  border: "1px solid #2a2a2a",
                  backgroundColor: "#111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 900,
                  color: "#555",
                  letterSpacing: "1px",
                }}
              >
                VS
              </div>
              {h2hTotal > 0 && (
                <div
                  style={{
                    backgroundColor: "#111",
                    border: "1px solid #222",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#555",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    H2H
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <span
                      style={{
                        fontSize: "18px",
                        fontWeight: 900,
                        color: colorA,
                        lineHeight: 1,
                      }}
                    >
                      {h2hA}
                    </span>
                    <span style={{ fontSize: "12px", color: "#333" }}>–</span>
                    <span
                      style={{
                        fontSize: "18px",
                        fontWeight: 900,
                        color: colorB,
                        lineHeight: 1,
                      }}
                    >
                      {h2hB}
                    </span>
                  </div>
                  <div style={{ fontSize: "9px", color: "#444", marginTop: "2px" }}>
                    {h2hTotal} races
                  </div>
                </div>
              )}
            </div>

            {/* Driver B */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                flex: 1,
                gap: "10px",
              }}
            >
              {/* Avatar + name */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexDirection: "row-reverse",
                  gap: "10px",
                }}
              >
                {driverB.headshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={driverB.headshot_url}
                    alt={nameB}
                    width={52}
                    height={52}
                    style={{
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: `2px solid ${colorB}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      backgroundColor: "#1a1a1a",
                      border: `2px solid ${colorB}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      fontWeight: 900,
                      color: colorB,
                      flexShrink: 0,
                    }}
                  >
                    {driverB.last_name[0]}
                  </div>
                )}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    {driverB.first_name}
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 900,
                      lineHeight: 1.1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {driverB.last_name}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: "16px" }}>
                {champB > 0 && (
                  <EmbedStat value={champB} label="WDC" color={colorB} align="right" />
                )}
                <EmbedStat value={podiumsB} label="Pods" color={colorB} align="right" />
                <EmbedStat value={polesB} label="Poles" color={colorB} align="right" />
                <EmbedStat value={winsB} label="Wins" color={colorB} align="right" />
              </div>
            </div>
          </div>

          {/* Footer — watermark + full analysis link */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
              borderTop: "1px solid #1a1a1a",
              backgroundColor: "#080808",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "10px", color: "#333", fontWeight: 600 }}>
              f1-versus.com
            </span>
            <a
              href={fullPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "11px",
                color: "#555",
                fontWeight: 600,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Full analysis
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

// ─── Embed stat cell ───────────────────────────────────────────────────────

function EmbedStat({
  value,
  label,
  color,
  align = "left",
}: {
  value: number;
  label: string;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
        gap: "2px",
      }}
    >
      <span
        style={{
          fontSize: "22px",
          fontWeight: 900,
          color: value > 0 ? color : "#333",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: "9px",
          fontWeight: 700,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
