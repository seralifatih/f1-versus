"use client";

/**
 * DriverSeasonChart
 *
 * Single-driver season-by-season points timeline.
 * Uses Recharts LineChart with championship annotations.
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
import { useState, useCallback } from "react";
import type { SeasonStats } from "@/lib/data/types";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DriverSeasonChartProps {
  name: string;
  color: string;
  seasons: SeasonStats[];
}

interface TooltipPayload {
  value: number;
  payload: SeasonStats;
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  color,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  color: string;
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        minWidth: 140,
      }}
    >
      <p style={{ color: "#aaa", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label} Season
      </p>
      <p style={{ color, fontWeight: 700 }}>
        {s.normalizedPoints} pts
        {s.championship_position === 1 && <span style={{ marginLeft: 6 }}>★</span>}
      </p>
      <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
        {[
          { label: "Wins", value: s.wins },
          { label: "Podiums", value: s.podiums },
          { label: "Races", value: s.races },
        ].map(({ label: l, value: v }) => (
          <div key={l}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", fontVariantNumeric: "tabular-nums" }}>{v}</div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Championship dot ──────────────────────────────────────────────────────

function ChampDot(props: {
  cx?: number;
  cy?: number;
  payload?: SeasonStats;
  color: string;
}) {
  const { cx, cy, payload, color } = props;
  if (!cx || !cy || !payload) return null;
  const isChamp = payload.championship_position === 1;
  if (isChamp) {
    return (
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={12} fontWeight={900}>
        ★
      </text>
    );
  }
  return <Dot cx={cx} cy={cy} r={3} fill={color} stroke={color} />;
}

// ─── Season detail panel ───────────────────────────────────────────────────

function SeasonPanel({ season, color }: { season: SeasonStats; color: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        <span style={{ color }}>{season.season}</span>{" "}
        <span style={{ color: "#aaa", fontWeight: 400 }}>season breakdown</span>
        {season.championship_position === 1 && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#f59e0b" }}>★ Champion</span>
        )}
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          { label: "Points", value: season.normalizedPoints },
          { label: "Races", value: season.races },
          { label: "Wins", value: season.wins },
          { label: "Podiums", value: season.podiums },
          { label: "Poles", value: season.poles },
          ...(season.championship_position ? [{ label: "WDC Pos", value: `P${season.championship_position}` }] : []),
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 18, fontWeight: 800, color: Number(value) > 0 || String(value).startsWith("P") ? "#fafafa" : "#444", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function DriverSeasonChart({ name, color, seasons }: DriverSeasonChartProps) {
  const [activeSeason, setActiveSeason] = useState<number | null>(null);

  const handleClick = useCallback((data: { activePayload?: { payload: SeasonStats }[] }) => {
    if (!data?.activePayload?.length) return;
    const s = data.activePayload[0].payload.season;
    setActiveSeason((prev) => (prev === s ? null : s));
  }, []);

  const selectedSeason = activeSeason
    ? seasons.find((s) => s.season === activeSeason)
    : null;

  const maxPoints = Math.max(...seasons.map((s) => s.normalizedPoints), 10);
  const yMax = Math.ceil(maxPoints / 50) * 50;

  // Championship years for reference lines
  const champYears = seasons
    .filter((s) => s.championship_position === 1)
    .map((s) => s.season);

  return (
    <div role="img" aria-label={`${name} season-by-season points chart`}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={seasons}
          margin={{ top: 16, right: 16, bottom: 0, left: -8 }}
          onClick={handleClick}
          style={{ cursor: "pointer" }}
        >
          <CartesianGrid stroke="#1e1e1e" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="season"
            tick={{ fill: "#555", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fill: "#555", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip color={color} />}
            cursor={{ stroke: "#333", strokeWidth: 1 }}
          />

          {champYears.map((y) => (
            <ReferenceLine
              key={y}
              x={y}
              stroke={color}
              strokeDasharray="4 3"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          ))}

          <Line
            type="monotone"
            dataKey="normalizedPoints"
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={(props) => <ChampDot {...props} color={color} />}
            activeDot={{ r: 5, fill: color, stroke: "#0a0a0a", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>

      {selectedSeason && <SeasonPanel season={selectedSeason} color={color} />}
    </div>
  );
}
