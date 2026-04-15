"use client";

/**
 * DriverRadarChart
 *
 * Reusable radar (spider) chart comparing two drivers across 6 axes.
 * Uses Recharts RadarChart with two overlapping polygons in each driver's
 * team color. Animates in when scrolled into view via IntersectionObserver.
 *
 * Axes rendered (first 6 metrics from the array, in order):
 *   Race Pace · Qualifying · Consistency · Wet Performance · Overtaking · Longevity
 *
 * Props:
 *   metrics   — RadarMetric[] from buildRadarMetrics() / normalizeForRadar()
 *   nameA     — Display name for driver A (used in legend + tooltip)
 *   nameB     — Display name for driver B
 *   colorA    — Hex color for driver A (team color)
 *   colorB    — Hex color for driver B
 */

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { useEffect, useRef, useState } from "react";
import type { RadarMetric } from "@/lib/data/types";

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

interface DriverRadarChartProps {
  metrics: RadarMetric[];
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  /** Max number of axes to render. Defaults to 6. */
  maxAxes?: number;
  /** Accessible label for the chart region. */
  ariaLabel?: string;
}

// Recharts tooltip payload type
interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

// ─── Scroll-into-view animation hook ──────────────────────────────────────

function useInView(threshold = 0.2): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect(); // animate once only
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  metrics,
  nameA,
  nameB,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  metrics: RadarMetric[];
  nameA: string;
  nameB: string;
}) {
  if (!active || !payload?.length) return null;

  // Find the metric matching this axis label so we can show percentile labels
  const metric = metrics.find((m) => m.label === label);

  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        maxWidth: 200,
      }}
    >
      <p
        style={{
          color: "#aaa",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      {payload.map((entry) => {
        const isA = entry.name === nameA;
        const percentile = metric ? (isA ? metric.percentileA : metric.percentileB) : undefined;
        return (
          <div key={entry.name} style={{ marginBottom: 4 }}>
            <p
              style={{
                color: entry.color,
                fontWeight: 700,
                marginBottom: percentile ? 1 : 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entry.name}:{" "}
              <span style={{ color: "#fafafa" }}>{entry.value} / 10</span>
            </p>
            {percentile && (
              <p
                style={{
                  color: "#666",
                  fontSize: 10,
                  fontWeight: 500,
                  marginLeft: 0,
                }}
              >
                {percentile} of all F1 drivers
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Custom Legend ─────────────────────────────────────────────────────────

function CustomLegend({
  nameA,
  nameB,
  colorA,
  colorB,
  scoreA,
  scoreB,
}: {
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  scoreA: number;
  scoreB: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 24,
        marginTop: 12,
      }}
    >
      {[
        { name: nameA, color: colorA, score: scoreA },
        { name: nameB, color: colorB, score: scoreB },
      ].map(({ name, color, score }) => (
        <div
          key={name}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          {/* Team color badge */}
          <div
            style={{
              width: 28,
              height: 10,
              borderRadius: 5,
              backgroundColor: color,
              opacity: 0.9,
            }}
          />
          <div>
            <span style={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}>
              {name}
            </span>
            <span
              style={{
                color: "#888",
                fontSize: 11,
                marginLeft: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {score.toFixed(1)} avg
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile bar chart (replaces radar on narrow screens) ──────────────────

function MobileBarChart({
  metrics,
  nameA,
  nameB,
  colorA,
  colorB,
  maxAxes = 6,
  ariaLabel,
}: DriverRadarChartProps) {
  const axes = metrics.slice(0, maxAxes);

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `Performance comparison: ${nameA} vs ${nameB}`}
      style={{
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 16px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #222",
        }}
      >
        {[
          { name: nameA, color: colorA },
          { name: nameB, color: colorB },
        ].map(({ name, color }) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fafafa" }}>{name}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div style={{ padding: "8px 0" }}>
        {axes.map((m) => (
          <div key={m.metric} style={{ padding: "8px 16px" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "#666",
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            {/* Driver A bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colorA,
                  width: 28,
                  textAlign: "right",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m.driverA}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  backgroundColor: "#222",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(m.driverA / 10) * 100}%`,
                    backgroundColor: colorA,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
            {/* Driver B bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colorB,
                  width: 28,
                  textAlign: "right",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m.driverB}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  backgroundColor: "#222",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(m.driverB / 10) * 100}%`,
                    backgroundColor: colorB,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function DriverRadarChart({
  metrics,
  nameA,
  nameB,
  colorA,
  colorB,
  maxAxes = 6,
  ariaLabel,
}: DriverRadarChartProps) {
  const isMobile = useIsMobile(640);
  const [containerRef, inView] = useInView(0.15);
  const label = ariaLabel ?? `Radar chart: ${nameA} vs ${nameB} across ${Math.min(metrics.length, maxAxes)} performance metrics`;

  // On mobile, show the simplified bar chart
  if (isMobile) {
    return (
      <MobileBarChart
        metrics={metrics}
        nameA={nameA}
        nameB={nameB}
        colorA={colorA}
        colorB={colorB}
        maxAxes={maxAxes}
        ariaLabel={label}
      />
    );
  }

  // Take up to maxAxes metrics for the radar shape
  const axes = metrics.slice(0, maxAxes);

  // Transform into Recharts-compatible shape: [{ subject, A, B }, ...]
  const chartData = axes.map((m) => ({
    subject: m.label,
    [nameA]: m.driverA,
    [nameB]: m.driverB,
    fullMark: 10,
  }));

  // Compute simple averages for the legend
  const avgA =
    axes.reduce((sum, m) => sum + m.driverA, 0) / (axes.length || 1);
  const avgB =
    axes.reduce((sum, m) => sum + m.driverB, 0) / (axes.length || 1);

  return (
    <div ref={containerRef} role="img" aria-label={label}>
      {/* Responsive: 50% width on md+, full width on mobile */}
      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: "0 auto",
        }}
        className="md:max-w-[50%] md:mx-auto"
      >
        <ResponsiveContainer width="100%" aspect={1}>
          <RadarChart
            data={chartData}
            margin={{ top: 10, right: 24, bottom: 10, left: 24 }}
          >
            {/* Grid */}
            <PolarGrid
              gridType="polygon"
              stroke="#333"
              strokeDasharray="3 3"
            />

            {/* Axis labels */}
            <PolarAngleAxis
              dataKey="subject"
              tick={{
                fill: "#aaa",
                fontSize: 12,
                fontWeight: 600,
              }}
            />

            {/* Radius scale — 0 to 10, show only outer ring label */}
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fill: "#555", fontSize: 10 }}
              tickCount={3}
              stroke="transparent"
            />

            {/* Driver A polygon */}
            <Radar
              name={nameA}
              dataKey={nameA}
              stroke={colorA}
              fill={colorA}
              fillOpacity={inView ? 0.25 : 0}
              strokeOpacity={inView ? 1 : 0}
              strokeWidth={2}
              // Recharts animationDuration drives the entrance animation;
              // we gate it on inView so it plays only when scrolled into view.
              isAnimationActive={inView}
              animationDuration={900}
              animationEasing="ease-out"
            />

            {/* Driver B polygon */}
            <Radar
              name={nameB}
              dataKey={nameB}
              stroke={colorB}
              fill={colorB}
              fillOpacity={inView ? 0.2 : 0}
              strokeOpacity={inView ? 1 : 0}
              strokeWidth={2}
              isAnimationActive={inView}
              animationDuration={900}
              animationEasing="ease-out"
            />

            {/* Tooltip */}
            <Tooltip
              content={
                <CustomTooltip
                  metrics={axes}
                  nameA={nameA}
                  nameB={nameB}
                />
              }
              cursor={false}
            />

            {/* Built-in legend hidden — we render our own below */}
            <Legend content={() => null} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Custom legend with team color badges and avg scores */}
        <CustomLegend
          nameA={nameA}
          nameB={nameB}
          colorA={colorA}
          colorB={colorB}
          scoreA={avgA}
          scoreB={avgB}
        />
      </div>

      {/* Remaining metrics (beyond maxAxes) shown as small supplementary bars */}
      {metrics.length > maxAxes && (
        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {metrics.slice(maxAxes).map((m) => (
            <SupplementaryMetric
              key={m.metric}
              metric={m}
              colorA={colorA}
              colorB={colorB}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Supplementary metric bar (for metrics beyond the 6 radar axes) ────────

function SupplementaryMetric({
  metric,
  colorA,
  colorB,
}: {
  metric: RadarMetric;
  colorA: string;
  colorB: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#888",
          marginBottom: 8,
        }}
      >
        {metric.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { value: metric.driverA, color: colorA },
          { value: metric.driverB, color: colorB },
        ].map(({ value, color }, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 28,
                textAlign: "right",
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: "#fafafa",
              }}
            >
              {value}
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                backgroundColor: "#222",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(value / 10) * 100}%`,
                  backgroundColor: color,
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
