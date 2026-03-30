import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { parseComparisonSlug, getTeamColor, type Driver, type ComparisonResult } from "@/lib/data/types";

/* eslint-disable @next/next/no-img-element */

// ─── Helpers ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

// ─── Stat pill ─────────────────────────────────────────────────────────────

function StatPill({
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
          fontSize: "32px",
          fontWeight: 900,
          color: value > 0 ? color : "#444",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: "11px",
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

// ─── Route handler ─────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const { slug } = params;
  const parsed = parseComparisonSlug(slug);

  if (!parsed) {
    return new Response("Invalid comparison slug", { status: 400 });
  }

  let driverA: Driver | null = null;
  let driverB: Driver | null = null;
  let statsJson: ComparisonResult | null = null;
  let colorA = "#e10600";
  let colorB = "#3b82f6";

  try {
    const supabase = createServerClient();

    // Fetch both drivers in parallel
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

    driverA = dA as Driver | null;
    driverB = dB as Driver | null;

    if (driverA && driverB) {
      // Fetch pre-computed stats + team colors in parallel
      const [{ data: comp }, { data: conA }, { data: conB }] = await Promise.all([
        supabase
          .from("driver_comparisons")
          .select("stats_json")
          .is("season", null)
          .or(
            `and(driver_a_id.eq.${driverA.id},driver_b_id.eq.${driverB.id}),and(driver_a_id.eq.${driverB.id},driver_b_id.eq.${driverA.id})`
          )
          .single(),
        // Most recent constructor for driver A
        supabase
          .from("results")
          .select("constructors(color_hex, constructor_ref)")
          .eq("driver_id", driverA.id)
          .eq("is_sprint", false)
          .order("race_id", { ascending: false })
          .limit(1)
          .single(),
        // Most recent constructor for driver B
        supabase
          .from("results")
          .select("constructors(color_hex, constructor_ref)")
          .eq("driver_id", driverB.id)
          .eq("is_sprint", false)
          .order("race_id", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (comp) statsJson = comp.stats_json as ComparisonResult;

      // Resolve team colors
      type ConRow = { color_hex: string | null; constructor_ref: string };
      const cA = (Array.isArray(conA?.constructors) ? conA.constructors[0] : conA?.constructors) as ConRow | null;
      const cB = (Array.isArray(conB?.constructors) ? conB.constructors[0] : conB?.constructors) as ConRow | null;
      colorA = cA?.color_hex ?? getTeamColor(cA?.constructor_ref ?? "") ?? "#e10600";
      colorB = cB?.color_hex ?? getTeamColor(cB?.constructor_ref ?? "") ?? "#3b82f6";
    }
  } catch {
    // Fall through to generic card
  }

  const nameA = driverA
    ? `${driverA.first_name} ${driverA.last_name}`
    : parsed.driverARef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const nameB = driverB
    ? `${driverB.first_name} ${driverB.last_name}`
    : parsed.driverBRef.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const winsA = statsJson?.statsA.wins ?? 0;
  const winsB = statsJson?.statsB.wins ?? 0;
  const polesA = statsJson?.statsA.poles ?? 0;
  const polesB = statsJson?.statsB.poles ?? 0;
  const podiumsA = statsJson?.statsA.podiums ?? 0;
  const podiumsB = statsJson?.statsB.podiums ?? 0;
  const champA = statsJson?.statsA.seasonBreakdown.filter((s) => s.championship_position === 1).length ?? 0;
  const champB = statsJson?.statsB.seasonBreakdown.filter((s) => s.championship_position === 1).length ?? 0;
  const h2hA = statsJson?.headToHead.driverAWins ?? 0;
  const h2hB = statsJson?.headToHead.driverBWins ?? 0;
  const h2hTotal = statsJson?.headToHead.totalRaces ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Driver A side glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "480px",
            height: "100%",
            background: `radial-gradient(ellipse at 0% 50%, ${rgba(colorA, 0.12)} 0%, transparent 70%)`,
          }}
        />

        {/* Driver B side glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "480px",
            height: "100%",
            background: `radial-gradient(ellipse at 100% 50%, ${rgba(colorB, 0.12)} 0%, transparent 70%)`,
          }}
        />

        {/* Top accent bar — split team colors */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "600px",
            height: "5px",
            backgroundColor: colorA,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "600px",
            height: "5px",
            backgroundColor: colorB,
          }}
        />

        {/* GridRival logo — top center */}
        <div
          style={{
            position: "absolute",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: 900,
              color: "#e10600",
              letterSpacing: "-0.02em",
            }}
          >
            Grid
          </span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Rival
          </span>
          <span style={{ fontSize: "11px", color: "#444", marginLeft: "4px" }}>
            .com
          </span>
        </div>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "stretch",
            padding: "64px 48px 56px",
            gap: "0",
          }}
        >
          {/* ── Driver A ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              flex: 1,
              gap: "0",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                marginBottom: "24px",
              }}
            >
              {driverA?.headshot_url ? (
                <img
                  src={driverA.headshot_url}
                  width={100}
                  height={100}
                  style={{
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `3px solid ${colorA}`,
                    boxShadow: `0 0 20px ${rgba(colorA, 0.4)}`,
                  }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: "100px",
                    height: "100px",
                    borderRadius: "50%",
                    backgroundColor: "#1a1a1a",
                    border: `3px solid ${colorA}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "36px",
                    fontWeight: 900,
                    color: colorA,
                  }}
                >
                  {(driverA?.last_name ?? nameA)[0]}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "15px", color: "#888", fontWeight: 400 }}>
                  {driverA?.first_name ?? ""}
                </span>
                <span
                  style={{
                    fontSize: "40px",
                    fontWeight: 900,
                    color: "#ffffff",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {driverA?.last_name ?? nameA}
                </span>
                {driverA?.nationality && (
                  <span style={{ fontSize: "12px", color: "#555" }}>
                    {driverA.nationality}
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: "32px" }}>
              <StatPill value={winsA} label="Wins" color={colorA} />
              <StatPill value={polesA} label="Poles" color={colorA} />
              <StatPill value={podiumsA} label="Podiums" color={colorA} />
              {champA > 0 && (
                <StatPill value={champA} label="Titles" color={colorA} />
              )}
            </div>
          </div>

          {/* ── VS Divider ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              width: "180px",
              flexShrink: 0,
            }}
          >
            {/* VS badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                border: "2px solid #2a2a2a",
                backgroundColor: "#111",
              }}
            >
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  color: "#666",
                  letterSpacing: "2px",
                }}
              >
                VS
              </span>
            </div>

            {/* H2H result (only when they raced together) */}
            {h2hTotal > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#111",
                  border: "1px solid #222",
                  borderRadius: "12px",
                  padding: "12px 20px",
                }}
              >
                <span style={{ fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Head-to-Head
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: 900,
                      color: colorA,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {h2hA}
                  </span>
                  <span style={{ fontSize: "16px", color: "#333", fontWeight: 700 }}>–</span>
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: 900,
                      color: colorB,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {h2hB}
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "#444" }}>
                  {h2hTotal} races together
                </span>
              </div>
            )}

            {/* Divider line */}
            <div
              style={{
                width: "1px",
                height: "60px",
                background: "linear-gradient(to bottom, transparent, #2a2a2a, transparent)",
              }}
            />
          </div>

          {/* ── Driver B ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "center",
              flex: 1,
              gap: "0",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexDirection: "row-reverse",
                gap: "20px",
                marginBottom: "24px",
              }}
            >
              {driverB?.headshot_url ? (
                <img
                  src={driverB.headshot_url}
                  width={100}
                  height={100}
                  style={{
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `3px solid ${colorB}`,
                    boxShadow: `0 0 20px ${rgba(colorB, 0.4)}`,
                  }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: "100px",
                    height: "100px",
                    borderRadius: "50%",
                    backgroundColor: "#1a1a1a",
                    border: `3px solid ${colorB}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "36px",
                    fontWeight: 900,
                    color: colorB,
                  }}
                >
                  {(driverB?.last_name ?? nameB)[0]}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  alignItems: "flex-end",
                }}
              >
                <span style={{ fontSize: "15px", color: "#888", fontWeight: 400 }}>
                  {driverB?.first_name ?? ""}
                </span>
                <span
                  style={{
                    fontSize: "40px",
                    fontWeight: 900,
                    color: "#ffffff",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    textAlign: "right",
                  }}
                >
                  {driverB?.last_name ?? nameB}
                </span>
                {driverB?.nationality && (
                  <span style={{ fontSize: "12px", color: "#555" }}>
                    {driverB.nationality}
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: "32px" }}>
              {champB > 0 && (
                <StatPill value={champB} label="Titles" color={colorB} align="right" />
              )}
              <StatPill value={podiumsB} label="Podiums" color={colorB} align="right" />
              <StatPill value={polesB} label="Poles" color={colorB} align="right" />
              <StatPill value={winsB} label="Wins" color={colorB} align="right" />
            </div>
          </div>
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "48px",
            backgroundColor: "#0d0d0d",
            borderTop: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#333" }}>
            gridrival.com
          </span>
          <span style={{ fontSize: "12px", color: "#333" }}>
            gridrival.com/compare/{slug}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
