"use client";

import { useState, useMemo } from "react";
import type { CircuitBreakdownRow, CircuitBreakdownStats } from "@/lib/data/types";

// ─── Types ─────────────────────────────────────────────────────────────────

type SortKey = "races" | "gap" | "alpha";
type FilterState = { streetOnly: boolean; wetOnly: boolean };

// ─── Circuit type icon ─────────────────────────────────────────────────────
// Simple inline SVG icons — no sprite sheet dependency.

function CircuitTypeIcon({ type }: { type: "street" | "permanent" | null }) {
  if (type === "street") {
    // City block grid
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
        <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (type === "permanent") {
    // Oval loop
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
        <ellipse cx="6" cy="6" rx="4.5" ry="3" stroke="currentColor" strokeWidth="1.2" />
        <line x1="1.5" y1="6" x2="3.5" y2="6" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return null;
}

// Rain drop icon for wet race indicator
function WetIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ color: "#60a5fa", flexShrink: 0 }}>
      <path d="M5 1 C5 1, 1.5 5.5 1.5 7 a3.5 3.5 0 0 0 7 0 C8.5 5.5 5 1 5 1Z" />
    </svg>
  );
}

// ─── Performance gap bar ───────────────────────────────────────────────────

function GapBar({
  statsA,
  statsB,
  colorA,
  colorB,
}: {
  statsA: CircuitBreakdownStats;
  statsB: CircuitBreakdownStats;
  colorA: string;
  colorB: string;
}) {
  const total = statsA.races + statsB.races;
  if (total === 0) return null;

  // Use avg finish as gap metric (lower is better); fall back to win share
  const hasFinishData = statsA.avgFinish !== null || statsB.avgFinish !== null;
  let pctA: number;

  if (hasFinishData) {
    const fA = statsA.avgFinish ?? 20;
    const fB = statsB.avgFinish ?? 20;
    // Invert: lower avg finish = better; map to 0-100 share
    const invA = 1 / fA;
    const invB = 1 / fB;
    pctA = (invA / (invA + invB)) * 100;
  } else {
    pctA = (statsA.races / total) * 100;
  }

  const pctB = 100 - pctA;

  return (
    <div
      style={{
        height: 3,
        display: "flex",
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "var(--border)",
      }}
    >
      <div style={{ width: `${pctA}%`, backgroundColor: colorA, transition: "width 0.4s ease" }} />
      <div style={{ width: `${pctB}%`, backgroundColor: colorB, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ─── Aggregate stat cells ─────────────────────────────────────────────────

function StatCell({
  value,
  isLeader,
  color,
}: {
  value: string | number;
  isLeader: boolean;
  color: string;
}) {
  return (
    <td
      style={{
        padding: "6px 10px",
        textAlign: "center",
        fontSize: 13,
        fontWeight: isLeader ? 700 : 400,
        color: isLeader ? color : "var(--muted-foreground)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </td>
  );
}

// ─── Expanded race-by-race table ──────────────────────────────────────────

function RaceByRaceTable({
  row,
  nameA,
  nameB,
  colorA,
  colorB,
}: {
  row: CircuitBreakdownRow;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}) {
  // Build merged season list (all seasons either driver raced here)
  const seasonsSet = new Set([
    ...row.racesA.map((r) => r.season),
    ...row.racesB.map((r) => r.season),
  ]);
  const seasons = Array.from(seasonsSet).sort((a, b) => b - a); // newest first

  const bySeasonA = new Map(row.racesA.map((r) => [r.season, r]));
  const bySeasonB = new Map(row.racesB.map((r) => [r.season, r]));

  const lastNameA = nameA.split(" ").pop() ?? nameA;
  const lastNameB = nameB.split(" ").pop() ?? nameB;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        backgroundColor: "#0d0d0d",
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>
              Season
            </th>
            <th style={{ padding: "6px 10px", textAlign: "center", color: colorA, fontWeight: 700 }}>
              {lastNameA} P
            </th>
            <th style={{ padding: "6px 10px", textAlign: "center", color: colorA, fontWeight: 600, opacity: 0.8 }}>
              Q
            </th>
            <th style={{ padding: "6px 4px", textAlign: "center", color: "#444", fontWeight: 700 }}>
              —
            </th>
            <th style={{ padding: "6px 10px", textAlign: "center", color: colorB, fontWeight: 700 }}>
              {lastNameB} P
            </th>
            <th style={{ padding: "6px 10px", textAlign: "center", color: colorB, fontWeight: 600, opacity: 0.8 }}>
              Q
            </th>
            <th style={{ padding: "6px 10px", textAlign: "right", color: "#555", fontWeight: 600 }}>
              Cond.
            </th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((season, i) => {
            const rA = bySeasonA.get(season);
            const rB = bySeasonB.get(season);
            const aAhead =
              rA?.position != null && rB?.position != null && rA.position < rB.position;
            const bAhead =
              rA?.position != null && rB?.position != null && rB.position < rA.position;

            return (
              <tr
                key={season}
                style={{
                  backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  borderTop: i > 0 ? "1px solid #1a1a1a" : undefined,
                }}
              >
                <td style={{ padding: "5px 10px", color: "#666", whiteSpace: "nowrap" }}>
                  {season}
                  {(rA?.wet || rB?.wet) && (
                    <span style={{ marginLeft: 4, display: "inline-flex", verticalAlign: "middle" }}>
                      <WetIcon />
                    </span>
                  )}
                </td>
                {/* Driver A position */}
                <td
                  style={{
                    padding: "5px 10px",
                    textAlign: "center",
                    fontWeight: aAhead ? 700 : 400,
                    color: rA?.position == null ? "#444" : aAhead ? colorA : "var(--muted-foreground)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rA?.position != null ? `P${rA.position}` : rA ? "DNF" : "—"}
                </td>
                {/* Driver A quali */}
                <td
                  style={{
                    padding: "5px 10px",
                    textAlign: "center",
                    color: "#555",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rA?.qualiPosition != null ? `P${rA.qualiPosition}` : "—"}
                </td>
                {/* Divider */}
                <td style={{ padding: "5px 4px", textAlign: "center", color: "#2a2a2a", fontSize: 10 }}>|</td>
                {/* Driver B position */}
                <td
                  style={{
                    padding: "5px 10px",
                    textAlign: "center",
                    fontWeight: bAhead ? 700 : 400,
                    color: rB?.position == null ? "#444" : bAhead ? colorB : "var(--muted-foreground)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rB?.position != null ? `P${rB.position}` : rB ? "DNF" : "—"}
                </td>
                {/* Driver B quali */}
                <td
                  style={{
                    padding: "5px 10px",
                    textAlign: "center",
                    color: "#555",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rB?.qualiPosition != null ? `P${rB.qualiPosition}` : "—"}
                </td>
                {/* Conditions */}
                <td style={{ padding: "5px 10px", textAlign: "right" }}>
                  {rA?.wet || rB?.wet ? (
                    <span style={{ fontSize: 10, color: "#60a5fa" }}>Wet</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Single circuit row ────────────────────────────────────────────────────

function CircuitRow({
  row,
  nameA,
  nameB,
  colorA,
  colorB,
}: {
  row: CircuitBreakdownRow;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const sA = row.statsA;
  const sB = row.statsB;

  // Per-stat leaders (null = tie or no data)
  function leader(a: number | null, b: number | null, lowerIsBetter = false) {
    if (a === null || b === null) return null;
    if (a === b) return null;
    if (lowerIsBetter) return a < b ? "a" : "b";
    return a > b ? "a" : "b";
  }

  const winsLeader = leader(sA.wins, sB.wins);
  const polesLeader = leader(sA.poles, sB.poles);
  const avgLeader = leader(sA.avgFinish, sB.avgFinish, true);

  // Performance advantage label
  const aAvg = sA.avgFinish;
  const bAvg = sB.avgFinish;
  const gap =
    aAvg !== null && bAvg !== null ? Math.abs(aAvg - bAvg).toFixed(1) : null;
  const advantageDriver =
    aAvg !== null && bAvg !== null
      ? aAvg < bAvg
        ? "a"
        : bAvg < aAvg
        ? "b"
        : null
      : null;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Header row — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            transition: "background-color 0.1s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = "rgba(255,255,255,0.02)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent")}
        >
          {/* Circuit name + type icon */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#666" }}>
                <CircuitTypeIcon type={row.type} />
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.circuitName}
              </span>
              {row.country && (
                <span style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                  · {row.country}
                </span>
              )}
            </div>
            <GapBar statsA={sA} statsB={sB} colorA={colorA} colorB={colorB} />
          </div>

          {/* Advantage label */}
          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            {gap && advantageDriver && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: advantageDriver === "a" ? colorA : colorB,
                }}
              >
                +{gap} avg
              </span>
            )}
          </div>

          {/* Races badge */}
          <div
            style={{
              fontSize: 11,
              color: "#555",
              whiteSpace: "nowrap",
              minWidth: 40,
              textAlign: "right",
            }}
          >
            {Math.max(sA.races, sB.races)} races
          </div>

          {/* Expand chevron */}
          <div style={{ color: "#444", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>

      {/* Stats summary bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 8,
          padding: "0 14px 10px",
        }}
      >
        {/* Driver A mini stats */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "W", value: sA.wins, isLeader: winsLeader === "a" },
            { label: "Pd", value: sA.podiums, isLeader: leader(sA.podiums, sB.podiums) === "a" },
            { label: "P", value: sA.poles, isLeader: polesLeader === "a" },
            {
              label: "Avg",
              value: sA.avgFinish !== null ? sA.avgFinish.toFixed(1) : "—",
              isLeader: avgLeader === "a",
            },
          ].map(({ label, value, isLeader }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isLeader ? 700 : 400,
                  color: isLeader ? colorA : "#555",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </span>
              <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* VS center */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, color: "#333", fontWeight: 700, letterSpacing: "0.08em" }}>VS</span>
        </div>

        {/* Driver B mini stats */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          {[
            {
              label: "Avg",
              value: sB.avgFinish !== null ? sB.avgFinish.toFixed(1) : "—",
              isLeader: avgLeader === "b",
            },
            { label: "P", value: sB.poles, isLeader: polesLeader === "b" },
            { label: "Pd", value: sB.podiums, isLeader: leader(sB.podiums, sA.podiums) === "b" },
            { label: "W", value: sB.wins, isLeader: winsLeader === "b" },
          ].map(({ label, value, isLeader }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isLeader ? 700 : 400,
                  color: isLeader ? colorB : "#555",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </span>
              <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded: race-by-race */}
      {expanded && (
        <RaceByRaceTable
          row={row}
          nameA={nameA}
          nameB={nameB}
          colorA={colorA}
          colorB={colorB}
        />
      )}
    </div>
  );
}

// ─── Sort / filter controls ────────────────────────────────────────────────

function ControlBar({
  sort,
  onSort,
  filters,
  onFilters,
  hasWetRaces,
  resultCount,
  total,
}: {
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  hasWetRaces: boolean;
  resultCount: number;
  total: number;
}) {
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "races", label: "Most Races" },
    { key: "gap", label: "Biggest Gap" },
    { key: "alpha", label: "A–Z" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      {/* Sort buttons */}
      <div style={{ display: "flex", gap: 4 }}>
        {sortOptions.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSort(key)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              backgroundColor: sort === key ? "var(--accent)" : "var(--surface)",
              color: sort === key ? "#fff" : "var(--muted-foreground)",
              fontSize: 12,
              fontWeight: sort === key ? 700 : 400,
              cursor: "pointer",
              transition: "background-color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, backgroundColor: "var(--border)" }} />

      {/* Filter toggles */}
      <button
        type="button"
        onClick={() => onFilters({ ...filters, streetOnly: !filters.streetOnly })}
        style={{
          padding: "5px 12px",
          borderRadius: 6,
          border: `1px solid ${filters.streetOnly ? "var(--accent)" : "var(--border)"}`,
          backgroundColor: filters.streetOnly ? "rgba(225,6,0,0.15)" : "var(--surface)",
          color: filters.streetOnly ? "var(--accent)" : "var(--muted-foreground)",
          fontSize: 12,
          fontWeight: filters.streetOnly ? 700 : 400,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        <CircuitTypeIcon type="street" />
        Street only
      </button>

      {hasWetRaces && (
        <button
          type="button"
          onClick={() => onFilters({ ...filters, wetOnly: !filters.wetOnly })}
          style={{
            padding: "5px 12px",
            borderRadius: 6,
            border: `1px solid ${filters.wetOnly ? "#3b82f6" : "var(--border)"}`,
            backgroundColor: filters.wetOnly ? "rgba(59,130,246,0.1)" : "var(--surface)",
            color: filters.wetOnly ? "#60a5fa" : "var(--muted-foreground)",
            fontSize: 12,
            fontWeight: filters.wetOnly ? 700 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <WetIcon />
          Wet only
        </button>
      )}

      <span style={{ marginLeft: "auto", fontSize: 11, color: "#555" }}>
        {resultCount === total ? `${total} circuits` : `${resultCount} / ${total}`}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export interface CircuitBreakdownProps {
  circuits: CircuitBreakdownRow[];
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}

export function CircuitBreakdown({
  circuits,
  nameA,
  nameB,
  colorA,
  colorB,
}: CircuitBreakdownProps) {
  const [sort, setSort] = useState<SortKey>("races");
  const [filters, setFilters] = useState<FilterState>({ streetOnly: false, wetOnly: false });

  const hasWetRaces = useMemo(
    () =>
      circuits.some(
        (c) => c.racesA.some((r) => r.wet) || c.racesB.some((r) => r.wet)
      ),
    [circuits]
  );

  const filtered = useMemo(() => {
    let rows = [...circuits];

    if (filters.streetOnly) {
      rows = rows.filter((c) => c.type === "street");
    }

    if (filters.wetOnly) {
      rows = rows.filter(
        (c) => c.racesA.some((r) => r.wet) || c.racesB.some((r) => r.wet)
      );
    }

    switch (sort) {
      case "races":
        rows.sort(
          (a, b) =>
            Math.max(b.statsA.races, b.statsB.races) -
            Math.max(a.statsA.races, a.statsB.races)
        );
        break;
      case "gap": {
        // Sort by avg finish gap, circuits where they both have data first
        rows.sort((a, b) => {
          const gapA =
            a.statsA.avgFinish !== null && a.statsB.avgFinish !== null
              ? Math.abs(a.statsA.avgFinish - a.statsB.avgFinish)
              : -1;
          const gapB =
            b.statsA.avgFinish !== null && b.statsB.avgFinish !== null
              ? Math.abs(b.statsA.avgFinish - b.statsB.avgFinish)
              : -1;
          return gapB - gapA;
        });
        break;
      }
      case "alpha":
        rows.sort((a, b) => a.circuitName.localeCompare(b.circuitName));
        break;
    }

    return rows;
  }, [circuits, sort, filters]);

  if (circuits.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "#555" }}>
        No shared circuit data available.
      </div>
    );
  }

  return (
    <div>
      <ControlBar
        sort={sort}
        onSort={setSort}
        filters={filters}
        onFilters={setFilters}
        hasWetRaces={hasWetRaces}
        resultCount={filtered.length}
        total={circuits.length}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#555", fontSize: 13 }}>
          No circuits match the current filters.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "var(--surface)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 12,
              padding: "8px 14px",
              backgroundColor: "var(--surface-elevated)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Circuit
            </span>
            <span style={{ fontSize: 11, color: colorA, fontWeight: 700, textAlign: "right" }}>
              {nameA.split(" ").pop()}
            </span>
            <span style={{ fontSize: 11, color: colorB, fontWeight: 700 }}>
              {nameB.split(" ").pop()}
            </span>
          </div>

          {filtered.map((row) => (
            <CircuitRow
              key={row.circuitRef}
              row={row}
              nameA={nameA}
              nameB={nameB}
              colorA={colorA}
              colorB={colorB}
            />
          ))}
        </div>
      )}
    </div>
  );
}
