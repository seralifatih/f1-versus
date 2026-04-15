"use client";

/**
 * DriverGrid
 *
 * Client-side interactive grid of F1 drivers with:
 *  - Fuzzy search (name, nationality, team)
 *  - Filters: decade, nationality, team
 *  - Checkbox-style card selection (max 2)
 *  - Floating "Compare" button when 2 selected
 *  - Pagination (24 cards per page)
 *
 * Receives the full driver list from the Server Component parent.
 * All filtering/search/pagination runs on the client — no extra requests.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { DriverWithStats } from "@/app/(public)/drivers/page";

// ─── Fuzzy match ───────────────────────────────────────────────────────────
// Simple: query tokens must all appear somewhere in the target string.
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => t.includes(token));
}

// ─── Filter helpers ────────────────────────────────────────────────────────
function getDecade(dob: string | null): string {
  if (!dob) return "Unknown";
  const year = new Date(dob).getFullYear();
  // Career decade = approx. debut year (dob + 18)
  const debutYear = year + 18;
  return `${Math.floor(debutYear / 10) * 10}s`;
}

const PAGE_SIZE = 24;

// ─── Driver Card ───────────────────────────────────────────────────────────

function DriverCard({
  driver,
  currentYear,
  selected,
  selectionDisabled,
  onToggle,
}: {
  driver: DriverWithStats;
  currentYear: number;
  selected: boolean;
  selectionDisabled: boolean;
  onToggle: (id: number) => void;
}) {
  const handleClick = () => {
    if (!selectionDisabled || selected) onToggle(driver.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={selectionDisabled && !selected}
      style={{
        textAlign: "left",
        width: "100%",
        backgroundColor: selected ? "transparent" : "var(--surface)",
        border: `2px solid ${selected ? driver.teamColor ?? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12,
        padding: 16,
        cursor: selectionDisabled && !selected ? "not-allowed" : "pointer",
        opacity: selectionDisabled && !selected ? 0.45 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s, opacity 0.15s",
        boxShadow: selected
          ? `0 0 0 3px ${driver.teamColor ?? "var(--accent)"}33, 0 0 16px ${driver.teamColor ?? "var(--accent)"}22`
          : "none",
        position: "relative",
        // Subtle gradient tint when selected
        background: selected
          ? `linear-gradient(135deg, ${driver.teamColor ?? "#e10600"}12 0%, var(--surface) 60%)`
          : "var(--surface)",
      }}
      aria-pressed={selected}
      aria-label={`${selected ? "Deselect" : "Select"} ${driver.first_name} ${driver.last_name}`}
    >
      {/* Selection checkbox indicator */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `2px solid ${selected ? driver.teamColor ?? "var(--accent)" : "var(--border)"}`,
          backgroundColor: selected ? driver.teamColor ?? "var(--accent)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background-color 0.15s, border-color 0.15s",
          flexShrink: 0,
        }}
      >
        {selected && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {driver.headshot_url ? (
          <Image
            src={driver.headshot_url}
            alt=""
            width={52}
            height={52}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${selected ? driver.teamColor ?? "var(--accent)" : "var(--border)"}`,
              flexShrink: 0,
            }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: `2px solid ${selected ? driver.teamColor ?? "var(--accent)" : "var(--border)"}`,
              backgroundColor: "var(--surface-elevated)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 900,
              color: driver.teamColor ?? "var(--muted)",
              flexShrink: 0,
            }}
          >
            {driver.last_name[0]}
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 1 }}>
            {driver.first_name}
          </p>
          <p
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: selected ? driver.teamColor ?? "var(--accent)" : "var(--foreground)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {driver.last_name}
          </p>
        </div>
      </div>

      {/* Team + nationality */}
      <div style={{ marginBottom: 10 }}>
        {driver.teamName && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            {driver.teamColor && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: driver.teamColor, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {driver.teamName}
            </span>
          </div>
        )}
        {driver.nationality && (
          <span style={{ fontSize: 11, color: "#555" }}>{driver.nationality}</span>
        )}
      </div>

      {/* Career stats mini row */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Races", value: driver.race_count ?? 0 },
          { label: "Wins", value: driver.win_count ?? 0 },
          { label: "Podiums", value: driver.podium_count ?? 0 },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: value > 0 ? "var(--foreground)" : "#444" }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </div>
          </div>
        ))}
        {driver.is_current && (
          <div style={{ marginLeft: "auto" }}>
            <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: "var(--accent)", color: "#fff", borderRadius: 4, padding: "2px 6px" }}>
              {currentYear}
            </span>
          </div>
        )}
      </div>

      {/* Profile link */}
      <Link
        href={`/drivers/${driver.driver_ref}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "inline-block",
          marginTop: 10,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--muted-foreground)",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = driver.teamColor ?? "var(--accent)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--muted-foreground)"; }}
      >
        View profile →
      </Link>
    </button>
  );
}

// ─── Filter bar ────────────────────────────────────────────────────────────

function FilterBar({
  search,
  onSearch,
  decade,
  onDecade,
  nationality,
  onNationality,
  team,
  onTeam,
  decades,
  nationalities,
  teams,
  resultCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  decade: string;
  onDecade: (v: string) => void;
  nationality: string;
  onNationality: (v: string) => void;
  team: string;
  onTeam: (v: string) => void;
  decades: string[];
  nationalities: string[];
  teams: string[];
  resultCount: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <svg
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#555", pointerEvents: "none" }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder="Search drivers, teams, nationalities…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{
            width: "100%",
            paddingLeft: 38,
            paddingRight: 16,
            paddingTop: 10,
            paddingBottom: 10,
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterSelect label="Decade" value={decade} onChange={onDecade} options={["All", ...decades]} />
        <FilterSelect label="Nationality" value={nationality} onChange={onNationality} options={["All", ...nationalities]} />
        <FilterSelect label="Team" value={team} onChange={onTeam} options={["All", ...teams]} />

        {(search || decade !== "All" || nationality !== "All" || team !== "All") && (
          <button
            type="button"
            onClick={() => { onSearch(""); onDecade("All"); onNationality("All"); onTeam("All"); }}
            style={{
              padding: "8px 14px",
              backgroundColor: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--muted-foreground)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#555" }}>
          {resultCount} driver{resultCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{
        padding: "8px 28px 8px 12px",
        backgroundColor: value !== "All" ? "var(--accent)" : "var(--surface)",
        border: `1px solid ${value !== "All" ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        color: value !== "All" ? "#fff" : "var(--muted-foreground)",
        fontSize: 13,
        cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option key={o} value={o} style={{ backgroundColor: "#1a1a1a", color: "#fafafa" }}>
          {o === "All" ? `All ${label}s` : o}
        </option>
      ))}
    </select>
  );
}

// ─── Floating compare bar ──────────────────────────────────────────────────

function CompareBar({
  selected,
  drivers,
  onClear,
}: {
  selected: number[];
  drivers: DriverWithStats[];
  onClear: () => void;
}) {
  const router = useRouter();
  const dA = drivers.find((d) => d.id === selected[0]);
  const dB = drivers.find((d) => d.id === selected[1]);

  const handleCompare = () => {
    if (!dA || !dB) return;
    const refs = [dA.driver_ref, dB.driver_ref].sort((a, b) => a.localeCompare(b));
    router.push(`/compare/${refs[0]}-vs-${refs[1]}`);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 20px",
        backgroundColor: "#0e0e0e",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        maxWidth: "calc(100vw - 32px)",
        flexWrap: "wrap",
      }}
    >
      {/* Selected drivers */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {[dA, dB].map((d, i) =>
          d ? (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {d.headshot_url ? (
                <Image
                  src={d.headshot_url}
                  alt=""
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", border: `2px solid ${d.teamColor ?? "var(--accent)"}` }}
                  loading="lazy"
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: "var(--surface)",
                    border: `2px solid ${d.teamColor ?? "var(--accent)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: d.teamColor ?? "var(--accent)",
                  }}
                >
                  {d.last_name[0]}
                </div>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: d.teamColor ?? "var(--foreground)" }}>
                {d.last_name}
              </span>
            </div>
          ) : (
            <div
              key={i}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "2px dashed var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 18, color: "#444", lineHeight: 1 }}>+</span>
            </div>
          )
        )}
        {selected.length === 1 && (
          <span style={{ fontSize: 13, color: "#555" }}>Select one more driver</span>
        )}
      </div>

      {/* VS divider */}
      {selected.length === 2 && (
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: "#555" }}>VS</span>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {selected.length === 2 && (
          <button
            type="button"
            onClick={handleCompare}
            style={{
              padding: "8px 20px",
              backgroundColor: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
          >
            Compare →
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          style={{
            padding: "8px 14px",
            backgroundColor: "transparent",
            color: "var(--muted-foreground)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Show at most 7 page buttons with ellipsis
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 32, flexWrap: "wrap" }}>
      <PaginationBtn disabled={page === 1} onClick={() => onPage(page - 1)}>← Prev</PaginationBtn>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} style={{ padding: "8px 4px", color: "#555", alignSelf: "center" }}>…</span>
        ) : (
          <PaginationBtn key={p} active={p === page} onClick={() => onPage(p as number)}>
            {p}
          </PaginationBtn>
        )
      )}
      <PaginationBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}>Next →</PaginationBtn>
    </div>
  );
}

function PaginationBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 12px",
        borderRadius: 8,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        backgroundColor: active ? "var(--accent)" : "var(--surface)",
        color: active ? "#fff" : disabled ? "#444" : "var(--muted-foreground)",
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        cursor: disabled ? "default" : "pointer",
        transition: "background-color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export interface DriverGridProps {
  drivers: DriverWithStats[];
  currentYear: number;
}

export function DriverGrid({ drivers, currentYear }: DriverGridProps) {
  const [search, setSearch] = useState("");
  const [decade, setDecade] = useState("All");
  const [nationality, setNationality] = useState("All");
  const [team, setTeam] = useState("All");
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  // Build filter option lists from data
  const decades = useMemo(() => {
    const set = new Set(drivers.map((d) => getDecade(d.dob)));
    set.delete("Unknown");
    return Array.from(set).sort().reverse();
  }, [drivers]);

  const nationalities = useMemo(() => {
    const set = new Set(drivers.map((d) => d.nationality).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [drivers]);

  const teams = useMemo(() => {
    const set = new Set(drivers.map((d) => d.teamName).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [drivers]);

  // Apply filters
  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (!fuzzyMatch(`${d.first_name} ${d.last_name} ${d.nationality ?? ""} ${d.teamName ?? ""}`, search)) return false;
      if (decade !== "All" && getDecade(d.dob) !== decade) return false;
      if (nationality !== "All" && d.nationality !== nationality) return false;
      if (team !== "All" && d.teamName !== team) return false;
      return true;
    });
  }, [drivers, search, decade, nationality, team]);

  // Reset to page 1 when filters change
  const prevFilters = useRef({ search, decade, nationality, team });
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.search !== search || prev.decade !== decade || prev.nationality !== nationality || prev.team !== team) {
      setPage(1);
      prevFilters.current = { search, decade, nationality, team };
    }
  }, [search, decade, nationality, team]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageDrivers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleToggle = useCallback((id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // already 2 selected
      return [...prev, id];
    });
  }, []);

  const handlePageChange = (p: number) => {
    setPage(p);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={topRef}>
      <FilterBar
        search={search}
        onSearch={setSearch}
        decade={decade}
        onDecade={setDecade}
        nationality={nationality}
        onNationality={setNationality}
        team={team}
        onTeam={setTeam}
        decades={decades}
        nationalities={nationalities}
        teams={teams}
        resultCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#555" }}>
          <p style={{ fontSize: 16 }}>No drivers match your filters.</p>
          <button
            type="button"
            onClick={() => { setSearch(""); setDecade("All"); setNationality("All"); setTeam("All"); }}
            style={{ marginTop: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {pageDrivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                currentYear={currentYear}
                selected={selected.includes(driver.id)}
                selectionDisabled={selected.length >= 2}
                onToggle={handleToggle}
              />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={handlePageChange} />
        </>
      )}

      {/* Floating compare bar */}
      {selected.length > 0 && (
        <CompareBar
          selected={selected}
          drivers={drivers}
          onClear={() => setSelected([])}
        />
      )}

      {/* Bottom padding so floating bar doesn't overlap last row */}
      {selected.length > 0 && <div style={{ height: 80 }} />}
    </div>
  );
}
