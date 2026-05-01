"use client";

import { useEffect, useRef, useState } from "react";
import type { DriverStats } from "@/lib/data/types";

function useCountUp(target: number, duration = 800, inView: boolean): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!inView || target === 0) { setValue(target); return; }
    setValue(0);
    startTimeRef.current = null;
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration, inView]);

  return value;
}

function useInView(): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

function StatValue({ value, isLeader, color, inView, suffix = "" }: {
  value: number; isLeader: boolean; color: string; inView: boolean; suffix?: string;
}) {
  const animated = useCountUp(value, 700, inView);
  return (
    <span
      className="f1-stat-value"
      style={{
        color: isLeader ? color : "rgba(255,255,255,0.9)",
        textShadow: isLeader ? `0 0 24px ${color}77, 0 0 8px ${color}44` : "none",
        transition: "color 0.3s, text-shadow 0.3s",
      }}
    >
      {animated}{suffix}
    </span>
  );
}

export interface StatsTableProps {
  nameA: string;
  nameB: string;
  statsA: DriverStats;
  statsB: DriverStats;
  colorA: string;
  colorB: string;
}

export function StatsTable({ nameA, nameB, statsA, statsB, colorA, colorB }: StatsTableProps) {
  const [ref, inView] = useInView();

  const champA = statsA.seasonBreakdown.filter((s) => s.championship_position === 1).length;
  const champB = statsB.seasonBreakdown.filter((s) => s.championship_position === 1).length;

  const rows: { label: string; a: number; b: number; lowerIsBetter?: boolean; suffix?: string }[] = [
    { label: "Race Wins",       a: statsA.wins,                                     b: statsB.wins },
    { label: "Poles",           a: statsA.poles,                                    b: statsB.poles },
    { label: "Podiums",         a: statsA.podiums,                                  b: statsB.podiums },
    { label: "Championships",   a: champA,                                          b: champB },
    { label: "Fastest Laps",    a: statsA.fastestLaps,                              b: statsB.fastestLaps },
    { label: "Races Started",   a: statsA.totalRaces,                               b: statsB.totalRaces },
    { label: "Points",          a: Math.round(statsA.totalPoints),                  b: Math.round(statsB.totalPoints) },
    { label: "Avg Pos. Gained", a: Math.round(statsA.avgPositionsGained * 10) / 10, b: Math.round(statsB.avgPositionsGained * 10) / 10 },
    { label: "DNFs",            a: statsA.dnfs,                                     b: statsB.dnfs, lowerIsBetter: true },
  ];

  return (
    <div
      ref={ref}
      style={{
        background: "#080808",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ padding: "14px 20px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontFamily: "var(--font-condensed)", fontSize: 16, fontWeight: 800, fontStyle: "italic", textTransform: "uppercase", color: colorA, letterSpacing: "0.02em" }}>
            {nameA}
          </span>
        </div>
        <div style={{ padding: "14px 24px", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-condensed)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>
            Stat
          </span>
        </div>
        <div style={{ padding: "14px 20px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontFamily: "var(--font-condensed)", fontSize: 16, fontWeight: 800, fontStyle: "italic", textTransform: "uppercase", color: colorB, letterSpacing: "0.02em" }}>
            {nameB}
          </span>
        </div>
      </div>

      {/* Rows */}
      {rows.map((row, i) => {
        const aLeads = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
        const bLeads = row.lowerIsBetter ? row.b < row.a : row.b > row.a;
        const tied = row.a === row.b;

        return (
          <div
            key={row.label}
            className="f1-stat-row"
            style={{
              background: aLeads
                ? `linear-gradient(90deg, ${colorA}0e 0%, transparent 40%)`
                : bLeads
                ? `linear-gradient(90deg, transparent 60%, ${colorB}0e 100%)`
                : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
            }}
          >
            {/* Value A */}
            <div style={{ padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
              {aLeads && !tied && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: colorA, boxShadow: `0 0 6px ${colorA}`, flexShrink: 0 }} />
              )}
              <StatValue value={row.a} isLeader={aLeads} color={colorA} inView={inView} suffix={row.suffix} />
              {/* Leader bar on left edge */}
              {aLeads && (
                <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: colorA, borderRadius: 1, opacity: 0.7 }} />
              )}
            </div>

            {/* Label */}
            <div style={{ padding: "13px 0", textAlign: "center", minWidth: 120 }}>
              <span className="f1-stat-label">
                {row.label}
              </span>
              {tied && row.a > 0 && (
                <div style={{ fontFamily: "var(--font-condensed)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.18)", marginTop: 2 }}>
                  tied
                </div>
              )}
            </div>

            {/* Value B */}
            <div style={{ padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8 }}>
              <StatValue value={row.b} isLeader={bLeads} color={colorB} inView={inView} suffix={row.suffix} />
              {bLeads && !tied && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: colorB, boxShadow: `0 0 6px ${colorB}`, flexShrink: 0 }} />
              )}
              {/* Leader bar on right edge */}
              {bLeads && (
                <div style={{ position: "absolute", right: 0, top: "20%", bottom: "20%", width: 2, background: colorB, borderRadius: 1, opacity: 0.7 }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
