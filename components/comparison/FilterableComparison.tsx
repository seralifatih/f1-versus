"use client";

/**
 * FilterableComparison
 *
 * Client wrapper that manages context filter state for the comparison page.
 * Holds both the pre-computed (default) stats and the filtered stats.
 * When filters are active, the filtered data is used for StatsTable,
 * RadarChart, and the quick-stats summary.
 */

import { useState, useCallback } from "react";
import type {
  ComparisonResult,
  ComparisonFilters,
  RadarMetric,
  DriverStats,
} from "@/lib/data/types";
import { ContextFilters } from "./ContextFilters";
import { StatsTable } from "./StatsTable";
import { DriverRadarChart } from "../charts/DriverRadarChart";

export interface FilterableComparisonProps {
  /** Pre-computed (default, unfiltered) comparison result */
  defaultResult: ComparisonResult;
  driverARef: string;
  driverBRef: string;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  sharedSeasons: number[];
}

export function FilterableComparison({
  defaultResult,
  driverARef,
  driverBRef,
  nameA,
  nameB,
  colorA,
  colorB,
  sharedSeasons,
}: FilterableComparisonProps) {
  const [filteredResult, setFilteredResult] = useState<ComparisonResult | null>(null);
  const [activeFilters, setActiveFilters] = useState<ComparisonFilters>({});

  const handleFilterChange = useCallback(
    (result: ComparisonResult | null, filters: ComparisonFilters) => {
      setFilteredResult(result);
      setActiveFilters(filters);
    },
    []
  );

  // Use filtered data when available, else default
  const current = filteredResult ?? defaultResult;
  const { statsA, statsB, radarMetrics } = current;

  const hasFilter = !!(activeFilters.wetOnly || activeFilters.circuitType || activeFilters.season);
  const noData = hasFilter && statsA.totalRaces === 0 && statsB.totalRaces === 0;

  return (
    <>
      {/* Filter bar */}
      <ContextFilters
        driverARef={driverARef}
        driverBRef={driverBRef}
        sharedSeasons={sharedSeasons}
        onFilterChange={handleFilterChange}
      />

      {/* No-data state */}
      {noData && (
        <div
          style={{
            padding: "32px 24px",
            textAlign: "center",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
            No race data found for the selected filters.
          </p>
          <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
            Try a different combination or reset filters.
          </p>
        </div>
      )}

      {/* Stats Table */}
      {!noData && (
        <section className="mb-10">
          <SectionTitle>
            {hasFilter ? "Filtered Statistics" : "Career Statistics"}
          </SectionTitle>
          {hasFilter && (
            <FilterBadge filters={activeFilters} />
          )}
          <StatsTable
            nameA={nameA}
            nameB={nameB}
            statsA={statsA}
            statsB={statsB}
            colorA={colorA}
            colorB={colorB}
          />
        </section>
      )}

      {/* Radar Chart */}
      {!noData && (
        <section className="mb-10">
          <SectionTitle>Performance Profile</SectionTitle>
          <DriverRadarChart
            metrics={radarMetrics}
            nameA={nameA}
            nameB={nameB}
            colorA={colorA}
            colorB={colorB}
          />
        </section>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-4 text-lg font-bold uppercase tracking-wider"
      style={{ color: "var(--muted-foreground)" }}
    >
      {children}
    </h2>
  );
}

function FilterBadge({ filters }: { filters: ComparisonFilters }) {
  const parts = [
    filters.wetOnly && "Wet Races",
    filters.circuitType === "street" && "Street Circuits",
    filters.season && `${filters.season}`,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 12,
        padding: "4px 10px",
        backgroundColor: "rgba(225, 6, 0, 0.08)",
        border: "1px solid rgba(225, 6, 0, 0.2)",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        color: "#e10600",
      }}
    >
      {parts.join(" · ")}
    </div>
  );
}
