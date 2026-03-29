"use client";

/**
 * StatsTable
 *
 * Two-column comparison table with animated counting numbers.
 * The leader in each row is highlighted with a subtle color glow.
 *
 * Rows: Wins · Poles · Podiums · Fastest Laps · Championships ·
 *       Races Started · Points · DNFs
 *
 * Championships is derived from seasonBreakdown (position === 1 count).
 */

import { useEffect, useRef, useState } from "react";
import type { DriverStats } from "@/lib/data/types";

// ─── Mobile breakpoint hook ────────────────────────────────────────────────

function useIsMobile(breakpoint = 480): boolean {
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

// ─── Animated counter hook ─────────────────────────────────────────────────

function useCountUp(target: number, duration = 900, inView: boolean): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!inView || target === 0) {
      setValue(target);
      return;
    }

    setValue(0);
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, inView]);

  return value;
}

// ─── Intersection observer hook ────────────────────────────────────────────

function useInView(threshold = 0.1): [React.RefObject<HTMLTableElement>, boolean] {
  const ref = useRef<HTMLTableElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// ─── Single animated stat cell ─────────────────────────────────────────────

function AnimatedCell({
  value,
  isLeader,
  color,
  inView,
  suffix = "",
}: {
  value: number;
  isLeader: boolean;
  color: string;
  inView: boolean;
  suffix?: string;
}) {
  const animated = useCountUp(value, 800, inView);

  return (
    <span
      style={{
        fontSize: 22,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em",
        color: isLeader ? color : "#fafafa",
        // Subtle glow when leading
        textShadow: isLeader
          ? `0 0 12px ${color}55, 0 0 24px ${color}22`
          : "none",
        transition: "color 0.3s ease, text-shadow 0.3s ease",
      }}
    >
      {animated}
      {suffix}
    </span>
  );
}

// ─── Row leader indicator ──────────────────────────────────────────────────

function LeaderIndicator({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: color,
        marginLeft: 6,
        boxShadow: `0 0 6px ${color}`,
        verticalAlign: "middle",
      }}
    />
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface StatsTableProps {
  nameA: string;
  nameB: string;
  statsA: DriverStats;
  statsB: DriverStats;
  colorA: string;
  colorB: string;
}

// ─── Main Component ────────────────────────────────────────────────────────

export function StatsTable({
  nameA,
  nameB,
  statsA,
  statsB,
  colorA,
  colorB,
}: StatsTableProps) {
  const [tableRef, inView] = useInView(0.1);
  const isMobile = useIsMobile(480);

  const champA = statsA.seasonBreakdown.filter((s) => s.championship_position === 1).length;
  const champB = statsB.seasonBreakdown.filter((s) => s.championship_position === 1).length;

  type Row = {
    label: string;
    a: number;
    b: number;
    lowerIsBetter?: boolean;
    suffix?: string;
  };

  const rows: Row[] = [
    { label: "Wins",           a: statsA.wins,                     b: statsB.wins },
    { label: "Poles",          a: statsA.poles,                    b: statsB.poles },
    { label: "Podiums",        a: statsA.podiums,                  b: statsB.podiums },
    { label: "Fastest Laps",   a: statsA.fastestLaps,              b: statsB.fastestLaps },
    { label: "Championships",  a: champA,                          b: champB },
    { label: "Races Started",  a: statsA.totalRaces,               b: statsB.totalRaces },
    { label: "Points",         a: Math.round(statsA.totalPoints),  b: Math.round(statsB.totalPoints) },
    { label: "DNFs",           a: statsA.dnfs,                     b: statsB.dnfs, lowerIsBetter: true },
  ];

  // ── Mobile stacked cards ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        style={{
          backgroundColor: "#111",
          border: "1px solid #222",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            backgroundColor: "#1a1a1a",
            borderBottom: "1px solid #222",
          }}
        >
          <div style={{ padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: colorA }}>
            {nameA}
          </div>
          <div style={{ padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: colorB, borderLeft: "1px solid #222" }}>
            {nameB}
          </div>
        </div>

        {/* Stat rows */}
        {rows.map((row, i) => {
          const aLeads = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
          const bLeads = row.lowerIsBetter ? row.b < row.a : row.b > row.a;
          const tied = row.a === row.b;
          const bgEven = i % 2 === 0 ? "#0e0e0e" : "#111";

          return (
            <div key={row.label} style={{ borderTop: "1px solid #1e1e1e" }}>
              {/* Stat label */}
              <div
                style={{
                  padding: "6px 16px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "#555",
                  backgroundColor: bgEven,
                  textAlign: "center",
                }}
              >
                {row.label}
                {tied && row.a > 0 && <span style={{ color: "#444", marginLeft: 6 }}>· tied</span>}
              </div>
              {/* Values side by side */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  backgroundColor: bgEven,
                }}
              >
                <div
                  style={{
                    padding: "8px 16px",
                    textAlign: "center",
                    background: aLeads ? `linear-gradient(135deg, ${colorA}10, transparent)` : undefined,
                  }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                      color: aLeads ? colorA : "#fafafa",
                      textShadow: aLeads ? `0 0 12px ${colorA}55` : "none",
                    }}
                  >
                    {row.a}{row.suffix ?? ""}
                  </span>
                  {aLeads && !tied && (
                    <span style={{ marginLeft: 4, display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: colorA, boxShadow: `0 0 6px ${colorA}`, verticalAlign: "middle" }} />
                  )}
                </div>
                <div
                  style={{
                    padding: "8px 16px",
                    textAlign: "center",
                    borderLeft: "1px solid #1e1e1e",
                    background: bLeads ? `linear-gradient(135deg, transparent, ${colorB}10)` : undefined,
                  }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                      color: bLeads ? colorB : "#fafafa",
                      textShadow: bLeads ? `0 0 12px ${colorB}55` : "none",
                    }}
                  >
                    {row.b}{row.suffix ?? ""}
                  </span>
                  {bLeads && !tied && (
                    <span style={{ marginLeft: 4, display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: colorB, boxShadow: `0 0 6px ${colorB}`, verticalAlign: "middle" }} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <table
        ref={tableRef}
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
      >
        <thead>
          <tr style={{ backgroundColor: "#1a1a1a" }}>
            <th
              style={{
                padding: "14px 20px",
                textAlign: "center",
                color: colorA,
                fontWeight: 700,
                fontSize: 15,
                width: "32%",
              }}
            >
              {nameA}
            </th>
            <th
              style={{
                padding: "14px 12px",
                textAlign: "center",
                color: "#666",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                width: "36%",
              }}
            >
              Career Stat
            </th>
            <th
              style={{
                padding: "14px 20px",
                textAlign: "center",
                color: colorB,
                fontWeight: 700,
                fontSize: 15,
                width: "32%",
              }}
            >
              {nameB}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const aLeads = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
            const bLeads = row.lowerIsBetter ? row.b < row.a : row.b > row.a;
            const tied = row.a === row.b;

            return (
              <tr
                key={row.label}
                style={{
                  backgroundColor: i % 2 === 0 ? "#0e0e0e" : "#111",
                  borderTop: "1px solid #1e1e1e",
                  ...(aLeads
                    ? { background: `linear-gradient(90deg, ${colorA}08 0%, #0e0e0e 45%)` }
                    : bLeads
                    ? { background: `linear-gradient(90deg, #0e0e0e 55%, ${colorB}08 100%)` }
                    : {}),
                }}
              >
                {/* Driver A value */}
                <td style={{ padding: "14px 20px", textAlign: "center" }}>
                  <AnimatedCell
                    value={row.a}
                    isLeader={aLeads}
                    color={colorA}
                    inView={inView}
                    suffix={row.suffix}
                  />
                  {aLeads && !tied && <LeaderIndicator color={colorA} />}
                </td>

                {/* Stat label */}
                <td
                  style={{
                    padding: "14px 12px",
                    textAlign: "center",
                    color: "#666",
                    fontWeight: 600,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {row.label}
                  {tied && row.a > 0 && (
                    <div style={{ color: "#444", fontSize: 10, fontWeight: 500, marginTop: 2 }}>
                      tied
                    </div>
                  )}
                </td>

                {/* Driver B value */}
                <td style={{ padding: "14px 20px", textAlign: "center" }}>
                  <AnimatedCell
                    value={row.b}
                    isLeader={bLeads}
                    color={colorB}
                    inView={inView}
                    suffix={row.suffix}
                  />
                  {bLeads && !tied && <LeaderIndicator color={colorB} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
