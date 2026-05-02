"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { trackEvent } from "@/lib/analytics";

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

interface DriverOption {
  driver_ref: string;
  first_name: string;
  last_name: string;
  nationality: string | null;
  headshot_url: string | null;
  teamName: string | null;
  teamColor: string | null;
  is_current: boolean;
}

// ─── Fuzzy search ──────────────────────────────────────────────────────────

function score(driver: DriverOption, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const fullName = `${driver.first_name} ${driver.last_name}`.toLowerCase();
  const lastName = driver.last_name.toLowerCase();
  if (lastName.startsWith(q)) return 3;
  if (fullName.startsWith(q)) return 2;
  if (lastName.includes(q) || fullName.includes(q)) return 1;
  return 0;
}

// ─── Single driver picker ──────────────────────────────────────────────────

function DriverPicker({
  label,
  drivers,
  value,
  onChange,
  exclude,
  currentYear,
  placeholder,
}: {
  label: string;
  drivers: DriverOption[];
  value: DriverOption | null;
  onChange: (d: DriverOption | null) => void;
  exclude: string | null;
  currentYear: number;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? drivers
        .filter((d) => d.driver_ref !== exclude && score(d, query) > 0)
        .sort((a, b) => score(b, query) - score(a, query))
        .slice(0, 8)
    : drivers
        .filter((d) => d.driver_ref !== exclude && d.is_current)
        .slice(0, 8);

  const handleSelect = (d: DriverOption) => {
    onChange(d);
    setQuery("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  };

  const displayName = value
    ? `${value.first_name} ${value.last_name}`
    : "";

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <label
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#555",
          marginBottom: 4,
        }}
      >
        {label}
      </label>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 52,
          backgroundColor: "var(--surface)",
          border: `1px solid ${open ? "var(--accent)" : value ? "var(--border)" : "var(--border)"}`,
          borderRadius: 10,
          transition: "border-color 0.15s",
          boxShadow: open ? "0 0 0 3px rgba(225,6,0,0.12)" : "none",
        }}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Avatar */}
        {value?.headshot_url ? (
          <Image
            src={value.headshot_url}
            alt=""
            width={28}
            height={28}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              border: `1.5px solid ${value.teamColor ?? "var(--border)"}`,
            }}
            loading="lazy"
          />
        ) : value ? (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "var(--surface-elevated)",
              border: `1.5px solid ${value.teamColor ?? "var(--border)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              color: value.teamColor ?? "var(--muted)",
              flexShrink: 0,
            }}
          >
            {value.last_name[0]}
          </div>
        ) : null}

        {/* Input / selected name */}
        {value && !open ? (
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: value.teamColor ?? "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={value ? displayName : placeholder}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 15,
              color: "var(--foreground)",
            }}
          />
        )}

        {/* Clear / chevron */}
        {value ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 6, flexShrink: 0, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Clear selection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ color: "#444", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "#111",
            border: "1px solid var(--border)",
            borderRadius: 10,
            zIndex: 50,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#555" }}>
              No drivers found
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.driver_ref}
                type="button"
                onClick={() => handleSelect(d)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderBottom: "1px solid #1a1a1a",
                  transition: "background-color 0.1s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
              >
                {d.headshot_url ? (
                  <Image
                    src={d.headshot_url}
                    alt=""
                    width={28}
                    height={28}
                    style={{ borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${d.teamColor ?? "#333"}`, flexShrink: 0 }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      backgroundColor: "#1a1a1a",
                      border: `1.5px solid ${d.teamColor ?? "#333"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: d.teamColor ?? "#666", flexShrink: 0,
                    }}
                  >
                    {d.last_name[0]}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.first_name} <strong>{d.last_name}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    {d.teamName ?? d.nationality ?? ""}
                    {d.is_current && (
                      <span
                        style={{ marginLeft: 6, color: "var(--accent)", fontWeight: 700 }}
                      >
                        {currentYear}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main search bar ───────────────────────────────────────────────────────

export function DriverSearchBar({ drivers }: { drivers: DriverOption[] }) {
  const [driverA, setDriverA] = useState<DriverOption | null>(null);
  const [driverB, setDriverB] = useState<DriverOption | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const isMobile = useIsMobile(480);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => { setMounted(true); }, []);

  const canCompare = driverA !== null && driverB !== null;

  const handleCompare = useCallback(() => {
    if (!driverA || !driverB) return;
    trackEvent("search_compare", {
      driverA: driverA.driver_ref,
      driverB: driverB.driver_ref,
    });
    const refs = [driverA.driver_ref, driverB.driver_ref].sort((a, b) =>
      a.localeCompare(b)
    );
    router.push(`/compare/${refs[0]}-vs-${refs[1]}`);
  }, [driverA, driverB, router]);

  const handleSwap = useCallback(() => {
    setDriverA(driverB);
    setDriverB(driverA);
  }, [driverA, driverB]);

  // Don't render the layout-dependent parts until client-side to avoid hydration mismatch
  if (!mounted) {
    return (
      <div
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 20,
          maxWidth: 640,
          margin: "0 auto",
          minHeight: 120,
        }}
      />
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: isMobile ? 14 : 20,
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {isMobile ? (
        /* ── Mobile: stacked pickers ─────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <DriverPicker
            label="Driver A"
            drivers={drivers}
            value={driverA}
            onChange={setDriverA}
            exclude={driverB?.driver_ref ?? null}
            currentYear={currentYear}
            placeholder="Search drivers…"
          />

          {/* Swap button — centered, horizontal arrow on mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
            <button
              type="button"
              onClick={handleSwap}
              title="Swap drivers"
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "#555",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
            <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
          </div>

          <DriverPicker
            label="Driver B"
            drivers={drivers}
            value={driverB}
            onChange={setDriverB}
            exclude={driverA?.driver_ref ?? null}
            currentYear={currentYear}
            placeholder="Search drivers…"
          />
        </div>
      ) : (
        /* ── Desktop: side by side ───────────────────────────────── */
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <DriverPicker
            label="Driver A"
            drivers={drivers}
            value={driverA}
            onChange={setDriverA}
            exclude={driverB?.driver_ref ?? null}
            currentYear={currentYear}
            placeholder="Search drivers…"
          />

          {/* Swap button */}
          <button
            type="button"
            onClick={handleSwap}
            title="Swap drivers"
            style={{
              flexShrink: 0,
              width: 44,
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "#555",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#555")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>

          <DriverPicker
            label="Driver B"
            drivers={drivers}
            value={driverB}
            onChange={setDriverB}
            exclude={driverA?.driver_ref ?? null}
            currentYear={currentYear}
            placeholder="Search drivers…"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleCompare}
        disabled={!canCompare}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "14px 0",
          minHeight: 48,
          backgroundColor: canCompare ? "var(--accent)" : "#1a1a1a",
          border: `1px solid ${canCompare ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 10,
          color: canCompare ? "#fff" : "#444",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          cursor: canCompare ? "pointer" : "default",
          transition: "background-color 0.15s, color 0.15s",
        }}
      >
        {canCompare
          ? `Compare ${driverA.last_name} vs ${driverB.last_name} →`
          : "Select two drivers to compare"}
      </button>
    </div>
  );
}
