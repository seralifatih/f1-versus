"use client";

/**
 * TeammateBattle
 *
 * Shows each driver's record vs every teammate they've ever had,
 * displayed as a horizontal bar chart: "Hamilton 42–16 Bottas".
 * Sorted by most races together (descending).
 *
 * Two panels side by side (stacked on mobile):
 *   Left  — Driver A's teammate records
 *   Right — Driver B's teammate records
 *
 * This is the most car-neutral comparison metric in F1.
 */

import type { AllTimeTeammateRecord, DriverStats } from "@/lib/data/types";

// ─── Single teammate row ───────────────────────────────────────────────────

function TeammateRow({
  record,
  driverColor,
}: {
  record: AllTimeTeammateRecord;
  driverColor: string;
}) {
  const total = record.driverAheadCount + record.driverBehindCount;
  const pctAhead = total > 0 ? (record.driverAheadCount / total) * 100 : 50;
  const pctBehind = total > 0 ? (record.driverBehindCount / total) * 100 : 50;

  // Last name only for brevity
  const teammateSurname = record.teammateName.split(" ").pop() ?? record.teammateName;

  return (
    <div
      style={{
        padding: "12px 0",
        borderBottom: "1px solid #1e1e1e",
      }}
    >
      {/* Teammate name + constructor + race count */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#fafafa" }}>
            {teammateSurname}
          </span>
          {record.constructorNames.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: "#555",
                fontWeight: 400,
              }}
            >
              {record.constructorNames.slice(0, 2).join(", ")}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            color: "#555",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {record.racesCompared} races
        </span>
      </div>

      {/* Score line: e.g. "42 – 16" */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 15,
            fontVariantNumeric: "tabular-nums",
            color: record.driverAheadCount >= record.driverBehindCount
              ? driverColor
              : "#fafafa",
          }}
        >
          {record.driverAheadCount}
        </span>
        <span style={{ fontSize: 11, color: "#444" }}>ahead</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 15,
            fontVariantNumeric: "tabular-nums",
            color: record.driverBehindCount > record.driverAheadCount
              ? "#888"
              : "#666",
          }}
        >
          {record.driverBehindCount}
        </span>
      </div>

      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          backgroundColor: "#222",
        }}
      >
        <div
          style={{
            width: `${pctAhead}%`,
            backgroundColor: driverColor,
            opacity: 0.9,
            borderRadius: "3px 0 0 3px",
            transition: "width 0.4s ease",
          }}
        />
        <div
          style={{
            width: `${pctBehind}%`,
            backgroundColor: "#333",
            borderRadius: "0 3px 3px 0",
          }}
        />
      </div>

      {/* Qualifying sub-stat */}
      {(record.qualiAheadCount > 0 || record.qualiBehindCount > 0) && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#555",
          }}
        >
          Quali: {record.qualiAheadCount}–{record.qualiBehindCount}
        </div>
      )}
    </div>
  );
}

// ─── One driver's full panel ───────────────────────────────────────────────

function DriverPanel({
  driverName,
  driverColor,
  records,
  maxShown = 8,
}: {
  driverName: string;
  driverColor: string;
  records: AllTimeTeammateRecord[];
  maxShown?: number;
}) {
  const sorted = [...records].sort((a, b) => b.racesCompared - a.racesCompared);
  const shown = sorted.slice(0, maxShown);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: driverColor,
            flexShrink: 0,
          }}
        />
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: driverColor,
          }}
        >
          {driverName}
        </h3>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#555" }}>
          vs {records.length} teammate{records.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Rows */}
      <div style={{ padding: "0 16px" }}>
        {shown.length === 0 && (
          <p style={{ padding: "16px 0", fontSize: 13, color: "#555" }}>
            No teammate data available.
          </p>
        )}
        {shown.map((r) => (
          <TeammateRow
            key={r.teammateRef}
            record={r}
            driverColor={driverColor}
          />
        ))}
        {sorted.length > maxShown && (
          <p
            style={{
              padding: "10px 0",
              fontSize: 11,
              color: "#555",
              textAlign: "center",
            }}
          >
            + {sorted.length - maxShown} more teammate
            {sorted.length - maxShown !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface TeammateBattleProps {
  nameA: string;
  nameB: string;
  statsA: Pick<DriverStats, "allTeammateRecords">;
  statsB: Pick<DriverStats, "allTeammateRecords">;
  colorA: string;
  colorB: string;
}

// ─── Main Component ────────────────────────────────────────────────────────

export function TeammateBattle({
  nameA,
  nameB,
  statsA,
  statsB,
  colorA,
  colorB,
}: TeammateBattleProps) {
  const lastNameA = nameA.split(" ").pop() ?? nameA;
  const lastNameB = nameB.split(" ").pop() ?? nameB;

  return (
    <div>
      <p
        style={{
          marginBottom: 16,
          fontSize: 13,
          color: "#666",
          lineHeight: 1.5,
        }}
      >
        Teammate records remove car quality from the equation — the most
        reliable measure of pure driver performance.
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          // Stack on narrow screens via CSS; flex-wrap handles it
          flexWrap: "wrap",
        }}
      >
        <DriverPanel
          driverName={lastNameA}
          driverColor={colorA}
          records={statsA.allTeammateRecords}
        />
        <DriverPanel
          driverName={lastNameB}
          driverColor={colorB}
          records={statsB.allTeammateRecords}
        />
      </div>
    </div>
  );
}
