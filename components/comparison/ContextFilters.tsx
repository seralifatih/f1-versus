"use client";

/**
 * ContextFilters
 *
 * Filter bar for the compare page. Lets users toggle:
 *  - Wet races only
 *  - Street circuits only
 *  - Season filter (dropdown of shared seasons)
 *
 * When a filter is active, fetches a filtered ComparisonResult from
 * /api/compare and passes the new data up via onFilterChange callback.
 */

import { useState, useCallback, useTransition } from "react";
import type { ComparisonFilters, ComparisonResult } from "@/lib/data/types";

// ─── Icons ────────────────────────────────────────────────────────────────

function RainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M10.5 5.5a3.5 3.5 0 0 0-7 0A2.5 2.5 0 0 0 3 10.5h7a2.5 2.5 0 0 0 .5-5Z" />
      <path d="M5 12v1.5M7 12.5v1.5M9 12v1.5" strokeWidth="1.5" />
    </svg>
  );
}

function StreetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1" y="1" width="5" height="5" rx="0.8" />
      <rect x="8" y="1" width="5" height="5" rx="0.8" />
      <rect x="1" y="8" width="5" height="5" rx="0.8" />
      <rect x="8" y="8" width="5" height="5" rx="0.8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
      <path d="M1.5 5.5h11" />
      <path d="M4.5 1v2.5M9.5 1v2.5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M1.5 1.5v3h3" />
      <path d="M2.1 7.5a4.5 4.5 0 1 0 .9-4.5" />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface ContextFiltersProps {
  driverARef: string;
  driverBRef: string;
  sharedSeasons: number[];
  onFilterChange: (result: ComparisonResult | null, filters: ComparisonFilters) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ContextFilters({
  driverARef,
  driverBRef,
  sharedSeasons,
  onFilterChange,
}: ContextFiltersProps) {
  const [filters, setFilters] = useState<ComparisonFilters>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasActiveFilter = !!(filters.wetOnly || filters.circuitType || filters.season);

  const applyFilters = useCallback(
    (newFilters: ComparisonFilters) => {
      setFilters(newFilters);
      setError(null);

      // If all filters are off, revert to the pre-computed data
      const isDefault = !newFilters.wetOnly && !newFilters.circuitType && !newFilters.season;
      if (isDefault) {
        onFilterChange(null, {});
        return;
      }

      startTransition(async () => {
        try {
          const res = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driverARef,
              driverBRef,
              filters: newFilters,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.error ?? "Failed to load filtered data");
            return;
          }

          const result: ComparisonResult = await res.json();
          onFilterChange(result, newFilters);
        } catch {
          setError("Network error — try again");
        }
      });
    },
    [driverARef, driverBRef, onFilterChange, startTransition]
  );

  const toggleWet = () => {
    applyFilters({ ...filters, wetOnly: !filters.wetOnly });
  };

  const toggleStreet = () => {
    const next = filters.circuitType === "street" ? undefined : "street" as const;
    applyFilters({ ...filters, circuitType: next });
  };

  const setSeason = (season: number | undefined) => {
    applyFilters({ ...filters, season });
  };

  const resetAll = () => {
    applyFilters({});
  };

  // Build season options: all shared seasons (where both drivers raced)
  const seasonOptions = [...sharedSeasons].sort((a, b) => b - a);

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Wet toggle */}
        <FilterChip
          icon={<RainIcon />}
          label="Wet Races"
          active={!!filters.wetOnly}
          onClick={toggleWet}
          disabled={isPending}
        />

        {/* Street toggle */}
        <FilterChip
          icon={<StreetIcon />}
          label="Street Circuits"
          active={filters.circuitType === "street"}
          onClick={toggleStreet}
          disabled={isPending}
        />

        {/* Season dropdown */}
        {seasonOptions.length > 0 && (
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <CalendarIcon />
            <select
              value={filters.season ?? ""}
              onChange={(e) => setSeason(e.target.value ? Number(e.target.value) : undefined)}
              disabled={isPending}
              style={{
                appearance: "none",
                backgroundColor: filters.season ? "rgba(225, 6, 0, 0.15)" : "var(--surface-elevated)",
                color: filters.season ? "#e10600" : "var(--muted-foreground)",
                border: `1px solid ${filters.season ? "rgba(225, 6, 0, 0.4)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "6px 28px 6px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                marginLeft: 4,
                outline: "none",
                transition: "all 0.15s ease",
              }}
            >
              <option value="">All Seasons</option>
              {seasonOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{
                position: "absolute",
                right: 10,
                pointerEvents: "none",
                color: filters.season ? "#e10600" : "var(--muted-foreground)",
              }}
            >
              <path d="M2 4l3 3 3-3" />
            </svg>
          </div>
        )}

        {/* Reset */}
        {hasActiveFilter && (
          <button
            onClick={resetAll}
            disabled={isPending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              backgroundColor: "transparent",
              color: "var(--muted-foreground)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ResetIcon />
            Reset
          </button>
        )}

        {/* Loading indicator */}
        {isPending && (
          <span
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                border: "2px solid var(--border)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
              }}
            />
            Filtering...
          </span>
        )}
      </div>

      {/* Active filter summary */}
      {hasActiveFilter && !isPending && !error && (
        <p style={{ marginTop: 8, fontSize: 11, color: "var(--muted-foreground)" }}>
          Showing stats for{" "}
          {[
            filters.wetOnly && "wet races",
            filters.circuitType === "street" && "street circuits",
            filters.season && `${filters.season} season`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Error */}
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>
          {error}
        </p>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────

function FilterChip({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        backgroundColor: active ? "rgba(225, 6, 0, 0.15)" : "var(--surface-elevated)",
        color: active ? "#e10600" : "var(--muted-foreground)",
        border: `1px solid ${active ? "rgba(225, 6, 0, 0.4)" : "var(--border)"}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s ease",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
