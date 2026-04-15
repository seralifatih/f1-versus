import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import {
  parseComparisonSlug,
  getTeamColor,
  type Driver,
  type ComparisonResult,
} from "@/lib/data/types";

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

// ─── Stat cell ─────────────────────────────────────────────────────────────

function StatCell({
  value,
  label,
  color,
  align = "center",
}: {
  value: number | string;
  label: string;
  color: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems:
          align === "left"
            ? "flex-start"
            : align === "right"
            ? "flex-end"
            : "center",
        gap: "4px",
      }}
    >
      <span
        style={{
          fontSize: "48px",
          fontWeight: 900,
          color:
            typeof value === "number" && value > 0
              ? color
              : typeof value === "string"
              ? color
              : "#444",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#555",
          textTransform: "uppercase" as const,
          letterSpacing: "0.1em",
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

    const [{ data: dA }, { data: dB }] = await Promise.all([
      supabase
        .from("drivers")
        .select(
          "id, driver_ref, first_name, last_name, nationality, headshot_url, dob"
        )
        .eq("driver_ref", parsed.driverARef)
        .single(),
      supabase
        .from("drivers")
        .select(
          "id, driver_ref, first_name, last_name, nationality, headshot_url, dob"
        )
        .eq("driver_ref", parsed.driverBRef)
        .single(),
    ]);

    driverA = dA as Driver | null;
    driverB = dB as Driver | null;

    if (driverA && driverB) {
      const [{ data: comp }, { data: conA }, { data: conB }] =
        await Promise.all([
          supabase
            .from("driver_comparisons")
            .select("stats_json")
            .is("season", null)
            .or(
              `and(driver_a_id.eq.${driverA.id},driver_b_id.eq.${driverB.id}),and(driver_a_id.eq.${driverB.id},driver_b_id.eq.${driverA.id})`
            )
            .single(),
          supabase
            .from("results")
            .select("constructors(color_hex, constructor_ref)")
            .eq("driver_id", driverA.id)
            .eq("is_sprint", false)
            .order("race_id", { ascending: false })
            .limit(1)
            .single(),
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

      type ConRow = { color_hex: string | null; constructor_ref: string };
      const cA = (
        Array.isArray(conA?.constructors)
          ? conA.constructors[0]
          : conA?.constructors
      ) as ConRow | null;
      const cB = (
        Array.isArray(conB?.constructors)
          ? conB.constructors[0]
          : conB?.constructors
      ) as ConRow | null;
      colorA =
        cA?.color_hex ?? getTeamColor(cA?.constructor_ref ?? "") ?? "#e10600";
      colorB =
        cB?.color_hex ?? getTeamColor(cB?.constructor_ref ?? "") ?? "#3b82f6";
    }
  } catch {
    // Fall through to generic card
  }

  const nameA = driverA
    ? `${driverA.first_name} ${driverA.last_name}`
    : parsed.driverARef
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  const nameB = driverB
    ? `${driverB.first_name} ${driverB.last_name}`
    : parsed.driverBRef
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  const winsA = statsJson?.statsA.wins ?? 0;
  const winsB = statsJson?.statsB.wins ?? 0;
  const polesA = statsJson?.statsA.poles ?? 0;
  const polesB = statsJson?.statsB.poles ?? 0;
  const podiumsA = statsJson?.statsA.podiums ?? 0;
  const podiumsB = statsJson?.statsB.podiums ?? 0;
  const champA =
    statsJson?.statsA.seasonBreakdown.filter(
      (s) => s.championship_position === 1
    ).length ?? 0;
  const champB =
    statsJson?.statsB.seasonBreakdown.filter(
      (s) => s.championship_position === 1
    ).length ?? 0;
  const h2hA = statsJson?.headToHead.driverAWins ?? 0;
  const h2hB = statsJson?.headToHead.driverBWins ?? 0;
  const h2hTotal = statsJson?.headToHead.totalRaces ?? 0;

  const watermarkUrl = `f1-versus.com/compare/${slug}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1080px",
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
            backgroundSize: "90px 90px",
          }}
        />

        {/* Driver A glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "540px",
            height: "100%",
            background: `radial-gradient(ellipse at 0% 40%, ${rgba(colorA, 0.18)} 0%, transparent 65%)`,
          }}
        />

        {/* Driver B glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "540px",
            height: "100%",
            background: `radial-gradient(ellipse at 100% 40%, ${rgba(colorB, 0.18)} 0%, transparent 65%)`,
          }}
        />

        {/* Top color bar — split */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "540px",
            height: "6px",
            backgroundColor: colorA,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "540px",
            height: "6px",
            backgroundColor: colorB,
          }}
        />

        {/* Brand — top center */}
        <div
          style={{
            position: "absolute",
            top: "28px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontSize: "16px",
              fontWeight: 900,
              color: "#e10600",
              letterSpacing: "-0.02em",
            }}
          >
            F1
          </span>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Versus
          </span>
          <span style={{ fontSize: "12px", color: "#444", marginLeft: "4px" }}>
            .com
          </span>
        </div>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 60px 120px",
            gap: "60px",
          }}
        >
          {/* Driver names row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0",
              width: "100%",
            }}
          >
            {/* Driver A */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                flex: 1,
                gap: "16px",
              }}
            >
              {driverA?.headshot_url ? (
                <img
                  src={driverA.headshot_url}
                  width={140}
                  height={140}
                  style={{
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `4px solid ${colorA}`,
                    boxShadow: `0 0 32px ${rgba(colorA, 0.5)}`,
                  }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: "140px",
                    height: "140px",
                    borderRadius: "50%",
                    backgroundColor: "#1a1a1a",
                    border: `4px solid ${colorA}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "52px",
                    fontWeight: 900,
                    color: colorA,
                  }}
                >
                  {(driverA?.last_name ?? nameA)[0]}
                </div>
              )}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <span
                  style={{
                    fontSize: "18px",
                    color: "#888",
                    fontWeight: 400,
                  }}
                >
                  {driverA?.first_name ?? ""}
                </span>
                <span
                  style={{
                    fontSize: "54px",
                    fontWeight: 900,
                    color: "#ffffff",
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {driverA?.last_name ?? nameA}
                </span>
                {driverA?.nationality && (
                  <span style={{ fontSize: "14px", color: "#555" }}>
                    {driverA.nationality}
                  </span>
                )}
              </div>
            </div>

            {/* VS badge */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                flexShrink: 0,
                padding: "0 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  border: "2px solid #2a2a2a",
                  backgroundColor: "#111",
                }}
              >
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: 900,
                    color: "#666",
                    letterSpacing: "2px",
                  }}
                >
                  VS
                </span>
              </div>

              {/* H2H pill */}
              {h2hTotal > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#111",
                    border: "1px solid #222",
                    borderRadius: "14px",
                    padding: "14px 24px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#555",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Head-to-Head
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "36px",
                        fontWeight: 900,
                        color: colorA,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {h2hA}
                    </span>
                    <span
                      style={{ fontSize: "20px", color: "#333", fontWeight: 700 }}
                    >
                      –
                    </span>
                    <span
                      style={{
                        fontSize: "36px",
                        fontWeight: 900,
                        color: colorB,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {h2hB}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#444" }}>
                    {h2hTotal} races
                  </span>
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
                gap: "16px",
              }}
            >
              {driverB?.headshot_url ? (
                <img
                  src={driverB.headshot_url}
                  width={140}
                  height={140}
                  style={{
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `4px solid ${colorB}`,
                    boxShadow: `0 0 32px ${rgba(colorB, 0.5)}`,
                  }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: "140px",
                    height: "140px",
                    borderRadius: "50%",
                    backgroundColor: "#1a1a1a",
                    border: `4px solid ${colorB}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "52px",
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
                <span
                  style={{
                    fontSize: "18px",
                    color: "#888",
                    fontWeight: 400,
                  }}
                >
                  {driverB?.first_name ?? ""}
                </span>
                <span
                  style={{
                    fontSize: "54px",
                    fontWeight: 900,
                    color: "#ffffff",
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    textAlign: "right" as const,
                  }}
                >
                  {driverB?.last_name ?? nameB}
                </span>
                {driverB?.nationality && (
                  <span style={{ fontSize: "14px", color: "#555" }}>
                    {driverB.nationality}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats comparison row */}
          <div
            style={{
              display: "flex",
              width: "100%",
              backgroundColor: "#0d0d0d",
              border: "1px solid #1a1a1a",
              borderRadius: "20px",
              padding: "40px 48px",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* A stats */}
            <div style={{ display: "flex", gap: "52px" }}>
              <StatCell value={winsA} label="Wins" color={colorA} align="left" />
              <StatCell value={polesA} label="Poles" color={colorA} align="left" />
              <StatCell
                value={podiumsA}
                label="Podiums"
                color={colorA}
                align="left"
              />
              {champA > 0 && (
                <StatCell
                  value={champA}
                  label="Titles"
                  color={colorA}
                  align="left"
                />
              )}
            </div>

            {/* Divider */}
            <div
              style={{
                width: "1px",
                height: "80px",
                background:
                  "linear-gradient(to bottom, transparent, #2a2a2a, transparent)",
              }}
            />

            {/* B stats */}
            <div style={{ display: "flex", gap: "52px" }}>
              {champB > 0 && (
                <StatCell
                  value={champB}
                  label="Titles"
                  color={colorB}
                  align="right"
                />
              )}
              <StatCell
                value={podiumsB}
                label="Podiums"
                color={colorB}
                align="right"
              />
              <StatCell value={polesB} label="Poles" color={colorB} align="right" />
              <StatCell value={winsB} label="Wins" color={colorB} align="right" />
            </div>
          </div>
        </div>

        {/* ── Watermark bar ──────────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "68px",
            backgroundColor: "#080808",
            borderTop: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          {/* Left accent line */}
          <div
            style={{
              flex: 1,
              height: "1px",
              background: `linear-gradient(to right, transparent, ${rgba(colorA, 0.4)})`,
              marginLeft: "48px",
            }}
          />

          <span
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.02em",
            }}
          >
            {watermarkUrl}
          </span>

          {/* Right accent line */}
          <div
            style={{
              flex: 1,
              height: "1px",
              background: `linear-gradient(to left, transparent, ${rgba(colorB, 0.4)})`,
              marginRight: "48px",
            }}
          />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  );
}
