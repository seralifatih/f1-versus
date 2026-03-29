"use client";

/**
 * SeasonTimeline
 *
 * Interactive Recharts LineChart showing points per season for two drivers.
 *
 * Features:
 *  - Two lines in each driver's team color, smooth curve (monotone)
 *  - Animated entrance on load
 *  - Shared seasons (both competed) highlighted with a subtle background band
 *  - Championship win seasons annotated with a ★ marker on the dot
 *  - Clickable season dots — expands a panel below the chart with race-by-race
 *    breakdown for that season (wins, podiums, points breakdown)
 *  - Custom tooltip showing both drivers' points + wins for the hovered season
 *  - Responsive full-width
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";
import { useState, useCallback, useEffect } from "react";
import type { SeasonStats } from "@/lib/data/types";

// ─── Mobile breakpoint hook ────────────────────────────────────────────────

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SeasonTimelineProps {
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  breakdownA: SeasonStats[];
  breakdownB: SeasonStats[];
}

type ChartPoint = {
  season: number;
  isShared: boolean;
  champA: boolean;  // driver A won championship this season
  champB: boolean;  // driver B won championship this season
  /** undefined = driver didn't compete that season */
} & Record<string, number | boolean | undefined>;

// Recharts passes these to custom dot/tooltip renders
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  dataKey?: string;
  value?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number | undefined;
    color: string;
    dataKey: string;
    payload?: ChartPoint;
  }>;
  label?: number;
}

// ─── Data helpers ──────────────────────────────────────────────────────────

function buildChartData(
  breakdownA: SeasonStats[],
  breakdownB: SeasonStats[],
  nameA: string,
  nameB: string
): ChartPoint[] {
  const mapA = new Map(breakdownA.map((s) => [s.season, s]));
  const mapB = new Map(breakdownB.map((s) => [s.season, s]));

  const allSeasons = Array.from(
    new Set([...breakdownA.map((s) => s.season), ...breakdownB.map((s) => s.season)])
  ).sort((a, b) => a - b);

  return allSeasons.map((season) => {
    const sA = mapA.get(season);
    const sB = mapB.get(season);
    return {
      season,
      [nameA]: sA?.points,
      [nameB]: sB?.points,
      isShared: !!sA && !!sB,
      champA: sA?.championship_position === 1,
      champB: sB?.championship_position === 1,
    };
  });
}

// ─── Custom Dot with championship star ────────────────────────────────────

function ChampionDot(props: DotProps & { color: string; isChamp: boolean; onClick: (season: number) => void }) {
  const { cx, cy, payload, color, isChamp, onClick } = props;
  if (cx == null || cy == null || !payload) return null;

  const handleClick = () => onClick(payload.season);

  if (isChamp) {
    // Gold star for championship seasons
    return (
      <g onClick={handleClick} style={{ cursor: "pointer" }}>
        <circle cx={cx} cy={cy} r={6} fill={color} stroke="#ffd700" strokeWidth={2} />
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize={11}
          fill="#ffd700"
          fontWeight="bold"
        >
          ★
        </text>
      </g>
    );
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={color}
      stroke="var(--background, #0a0a0a)"
      strokeWidth={1.5}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    />
  );
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────

function SeasonTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const point = payload[0]?.payload as ChartPoint | undefined;

  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 160,
      }}
    >
      <p
        style={{
          color: "#aaa",
          fontWeight: 700,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        {label} Season
        {point?.isShared && (
          <span style={{ color: "#555", fontWeight: 400, marginLeft: 6 }}>
            (shared)
          </span>
        )}
      </p>
      {payload.map((entry) => {
        if (entry.value == null) return null;
        const isChampA = entry.dataKey && point?.champA && entry.dataKey === Object.keys(point).find((k) => k !== "season" && k !== "isShared" && k !== "champA" && k !== "champB" && point[k] !== undefined);
        return (
          <div
            key={entry.name}
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: entry.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#fafafa", fontSize: 13, fontWeight: 600 }}>
              {entry.name}
            </span>
            <span
              style={{
                color: entry.color,
                fontSize: 13,
                fontWeight: 700,
                marginLeft: "auto",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entry.value} pts
            </span>
          </div>
        );
      })}
      <p style={{ color: "#555", fontSize: 11, marginTop: 6 }}>
        Click to expand season detail
      </p>
    </div>
  );
}

// ─── Expanded season detail panel ─────────────────────────────────────────

function SeasonDetailPanel({
  season,
  sA,
  sB,
  nameA,
  nameB,
  colorA,
  colorB,
  onClose,
}: {
  season: number;
  sA: SeasonStats | undefined;
  sB: SeasonStats | undefined;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  onClose: () => void;
}) {
  type StatRow = { label: string; a: string | number; b: string | number; lowerIsBetter?: boolean };
  const rows: StatRow[] = [
    { label: "Points", a: sA?.points ?? "—", b: sB?.points ?? "—" },
    { label: "Wins", a: sA?.wins ?? "—", b: sB?.wins ?? "—" },
    { label: "Podiums", a: sA?.podiums ?? "—", b: sB?.podiums ?? "—" },
    { label: "Poles", a: sA?.poles ?? "—", b: sB?.poles ?? "—" },
    { label: "Races", a: sA?.races ?? "—", b: sB?.races ?? "—" },
    {
      label: "Championship",
      a: sA?.championship_position ? `P${sA.championship_position}` : "—",
      b: sB?.championship_position ? `P${sB.championship_position}` : "—",
      lowerIsBetter: true,
    },
  ];

  return (
    <div
      style={{
        marginTop: 16,
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #222",
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>
          {season} Season
          {(sA?.championship_position === 1 || sB?.championship_position === 1) && (
            <span style={{ color: "#ffd700", marginLeft: 8, fontSize: 13 }}>
              ★ Championship year
            </span>
          )}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 4px",
          }}
          aria-label="Close season detail"
        >
          ×
        </button>
      </div>

      {/* Stats grid */}
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#161616" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", color: "#666", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Stat
            </th>
            <th style={{ padding: "8px 12px", textAlign: "center", color: colorA, fontSize: 12, fontWeight: 700 }}>
              {nameA}
            </th>
            <th style={{ padding: "8px 12px", textAlign: "center", color: colorB, fontSize: 12, fontWeight: 700 }}>
              {nameB}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const numA = typeof row.a === "number" ? row.a : parseFloat(String(row.a));
            const numB = typeof row.b === "number" ? row.b : parseFloat(String(row.b));
            const aLeads = !isNaN(numA) && !isNaN(numB) && (row.lowerIsBetter ? numA < numB : numA > numB);
            const bLeads = !isNaN(numA) && !isNaN(numB) && (row.lowerIsBetter ? numB < numA : numB > numA);

            return (
              <tr
                key={row.label}
                style={{
                  backgroundColor: i % 2 === 0 ? "#0e0e0e" : "#111",
                  borderTop: "1px solid #1e1e1e",
                }}
              >
                <td style={{ padding: "8px 12px", color: "#888", fontWeight: 500 }}>
                  {row.label}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: aLeads ? colorA : "#fafafa" }}>
                  {row.a}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: bLeads ? colorB : "#fafafa" }}>
                  {row.b}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared-season reference bands ────────────────────────────────────────
// Recharts doesn't support area fills between x-values natively, so we
// render subtle ReferenceLines at each shared season as a visual marker.

function SharedSeasonMarker({ season, data }: { season: number; data: ChartPoint[] }) {
  const point = data.find((d) => d.season === season);
  if (!point?.isShared) return null;

  return (
    <ReferenceLine
      x={season}
      stroke="#ffffff"
      strokeOpacity={0.04}
      strokeWidth={20}
      ifOverflow="visible"
    />
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function SeasonTimeline({
  nameA,
  nameB,
  colorA,
  colorB,
  breakdownA,
  breakdownB,
}: SeasonTimelineProps) {
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const isMobile = useIsMobile(640);

  const chartData = buildChartData(breakdownA, breakdownB, nameA, nameB);
  const mapA = new Map(breakdownA.map((s) => [s.season, s]));
  const mapB = new Map(breakdownB.map((s) => [s.season, s]));
  const sharedSeasons = chartData.filter((d) => d.isShared).map((d) => d.season);

  const handleDotClick = useCallback((season: number) => {
    setActiveSeason((prev) => (prev === season ? null : season));
  }, []);

  const handleChartClick = useCallback(
    (data: { activePayload?: Array<{ payload: ChartPoint }> } | null) => {
      if (data?.activePayload?.[0]?.payload) {
        handleDotClick(data.activePayload[0].payload.season);
      }
    },
    [handleDotClick]
  );

  if (chartData.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          backgroundColor: "#111",
          border: "1px solid #222",
          borderRadius: 12,
          color: "#888",
          fontSize: 14,
        }}
      >
        No season data available.
      </div>
    );
  }

  // Tick density: show every year if ≤20 seasons, otherwise every 5
  const allYears = chartData.map((d) => d.season);
  // On mobile with many seasons, show fewer ticks to prevent overlap
  const xTicks = isMobile
    ? allYears.filter((y) => y % 5 === 0 || allYears.length <= 10)
    : allYears.length <= 20
    ? allYears
    : allYears.filter((y) => y % 5 === 0);

  // On mobile with many seasons, render a wider chart in a scroll container
  const manySeasons = chartData.length > 15;
  const chartMinWidth = isMobile && manySeasons ? chartData.length * 24 : undefined;
  const chartHeight = isMobile ? 220 : 280;

  return (
    <div>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {[
          { name: nameA, color: colorA },
          { name: nameB, color: colorB },
        ].map(({ name, color }) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 3,
                backgroundColor: color,
                borderRadius: 2,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fafafa" }}>{name}</span>
          </div>
        ))}
        {sharedSeasons.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid #333",
                borderRadius: 3,
              }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>Shared season</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#ffd700" }}>★</span>
          <span style={{ fontSize: 12, color: "#666" }}>Championship win</span>
        </div>
      </div>

      {/* Swipe hint on mobile when many seasons */}
      {isMobile && manySeasons && (
        <div style={{ fontSize: 11, color: "#444", marginBottom: 8, textAlign: "center" }}>
          ← Scroll to see all seasons →
        </div>
      )}

      {/* Chart — swipeable wrapper on mobile */}
      <div
        style={{
          backgroundColor: "#111",
          border: "1px solid #222",
          borderRadius: 12,
          padding: "16px 8px 8px",
          overflowX: isMobile && manySeasons ? "auto" : "visible",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
      >
        <div style={{ minWidth: chartMinWidth }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={chartData}
            margin={{ top: 16, right: isMobile ? 8 : 24, left: 0, bottom: 4 }}
            onClick={handleChartClick}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#222"
              vertical={false}
            />

            {/* Shared season background bands */}
            {sharedSeasons.map((s) => (
              <SharedSeasonMarker key={s} season={s} data={chartData} />
            ))}

            {/* Selected season highlight */}
            {activeSeason !== null && (
              <ReferenceLine
                x={activeSeason}
                stroke="#ffffff"
                strokeOpacity={0.15}
                strokeWidth={28}
                ifOverflow="visible"
              />
            )}

            <XAxis
              dataKey="season"
              ticks={xTicks}
              tick={{ fill: "#666", fontSize: isMobile ? 9 : 11 }}
              axisLine={{ stroke: "#333" }}
              tickLine={false}
            />

            <YAxis
              tick={{ fill: "#666", fontSize: isMobile ? 9 : 11 }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 28 : 40}
              tickFormatter={(v: number) => String(v)}
            />

            <Tooltip
              content={<SeasonTooltip />}
              cursor={{ stroke: "#444", strokeWidth: 1, strokeDasharray: "4 2" }}
            />

            {/* Driver A line */}
            <Line
              type="monotone"
              dataKey={nameA}
              stroke={colorA}
              strokeWidth={2.5}
              dot={(props: DotProps) => (
                <ChampionDot
                  {...props}
                  color={colorA}
                  isChamp={props.payload?.champA ?? false}
                  onClick={handleDotClick}
                />
              )}
              activeDot={{ r: 6, fill: colorA, stroke: "#0a0a0a", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={1000}
              animationEasing="ease-out"
            />

            {/* Driver B line */}
            <Line
              type="monotone"
              dataKey={nameB}
              stroke={colorB}
              strokeWidth={2.5}
              dot={(props: DotProps) => (
                <ChampionDot
                  {...props}
                  color={colorB}
                  isChamp={props.payload?.champB ?? false}
                  onClick={handleDotClick}
                />
              )}
              activeDot={{ r: 6, fill: colorB, stroke: "#0a0a0a", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={1000}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>

      {/* Expanded season detail panel */}
      {activeSeason !== null && (
        <SeasonDetailPanel
          season={activeSeason}
          sA={mapA.get(activeSeason)}
          sB={mapB.get(activeSeason)}
          nameA={nameA}
          nameB={nameB}
          colorA={colorA}
          colorB={colorB}
          onClose={() => setActiveSeason(null)}
        />
      )}
    </div>
  );
}
