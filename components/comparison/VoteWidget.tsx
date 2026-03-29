"use client";

import { useState, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/* eslint-disable react/no-unescaped-entities */

// ─── Types ─────────────────────────────────────────────────────────────────

interface VoteCounts {
  [driverRef: string]: number;
}

interface VoteState {
  hasVoted: boolean;
  votedFor: string | null;
  votes: VoteCounts | null;
  /** "idle" | "voting" | "error" */
  status: "idle" | "voting" | "error";
  /** true while we're doing the initial GET check on mount */
  checking: boolean;
}

// ─── Animated percentage bar ───────────────────────────────────────────────

function AnimatedBar({
  pct,
  color,
  side,
}: {
  pct: number;
  color: string;
  side: "left" | "right";
}) {
  const [displayed, setDisplayed] = useState(side === "left" ? 50 : 50);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(displayed);
  const DURATION = 900;

  useEffect(() => {
    fromRef.current = displayed;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / DURATION, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(fromRef.current + (pct - fromRef.current) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  return (
    <div
      style={{
        height: "100%",
        width: `${displayed}%`,
        backgroundColor: color,
        transition: "none",
        borderRadius: side === "left" ? "4px 0 0 4px" : "0 4px 4px 0",
      }}
    />
  );
}

// ─── Results panel ─────────────────────────────────────────────────────────

function VoteResults({
  votes,
  votedFor,
  driverARef,
  driverBRef,
  nameA,
  nameB,
  colorA,
  colorB,
}: {
  votes: VoteCounts;
  votedFor: string | null;
  driverARef: string;
  driverBRef: string;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}) {
  const countA = votes[driverARef] ?? 0;
  const countB = votes[driverBRef] ?? 0;
  const total = countA + countB;
  const pctA = total > 0 ? Math.round((countA / total) * 100) : 50;
  const pctB = total > 0 ? 100 - pctA : 50;

  const lastNameA = nameA.split(" ").pop() ?? nameA;
  const lastNameB = nameB.split(" ").pop() ?? nameB;

  const leader =
    countA > countB ? nameA : countB > countA ? nameB : null;
  const leaderColor = countA > countB ? colorA : colorB;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary line */}
      <p
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "var(--muted-foreground)",
          margin: 0,
        }}
      >
        {total > 0 ? (
          leader ? (
            <>
              <span style={{ color: leaderColor, fontWeight: 700 }}>
                {leader.split(" ").pop()}
              </span>{" "}
              is the fans' choice — {total.toLocaleString()} vote{total !== 1 ? "s" : ""}
            </>
          ) : (
            <>It's a tie — {total.toLocaleString()} votes</>
          )
        ) : (
          "No votes yet"
        )}
      </p>

      {/* Bar */}
      <div>
        <div
          style={{
            height: 12,
            borderRadius: 4,
            overflow: "hidden",
            display: "flex",
            backgroundColor: "var(--border)",
          }}
        >
          <AnimatedBar pct={pctA} color={colorA} side="left" />
          <AnimatedBar pct={pctB} color={colorB} side="right" />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: colorA }}>
            {pctA}%{" "}
            <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>
              {lastNameA}
            </span>
          </span>
          <span style={{ fontSize: 12, color: "#555" }}>
            {total.toLocaleString()} votes
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: colorB }}>
            <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>
              {lastNameB}
            </span>{" "}
            {pctB}%
          </span>
        </div>
      </div>

      {/* Voted-for indicator */}
      {votedFor && (
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#555",
            margin: 0,
          }}
        >
          You voted for{" "}
          <span
            style={{
              color: votedFor === driverARef ? colorA : colorB,
              fontWeight: 700,
            }}
          >
            {votedFor === driverARef ? lastNameA : lastNameB}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Driver vote button ─────────────────────────────────────────────────────

function VoteButton({
  name,
  color,
  disabled,
  loading,
  onClick,
}: {
  name: string;
  color: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const lastName = name.split(" ").pop() ?? name;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        flex: 1,
        padding: "14px 20px",
        backgroundColor: disabled ? "var(--surface-elevated)" : color,
        border: `2px solid ${color}`,
        borderRadius: 10,
        color: disabled ? color : "#fff",
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: "-0.01em",
        cursor: disabled || loading ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s, transform 0.1s",
        transform: "scale(1)",
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading)
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
      }}
    >
      {loading ? "…" : lastName}
    </button>
  );
}

// ─── Main widget ────────────────────────────────────────────────────────────

export interface VoteWidgetProps {
  slug: string;
  driverARef: string;
  driverBRef: string;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}

export function VoteWidget({
  slug,
  driverARef,
  driverBRef,
  nameA,
  nameB,
  colorA,
  colorB,
}: VoteWidgetProps) {
  const [state, setState] = useState<VoteState>({
    hasVoted: false,
    votedFor: null,
    votes: null,
    status: "idle",
    checking: true,
  });

  // On mount: check if this user already voted via GET
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vote?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data: { hasVoted: boolean; votedFor?: string; votes: VoteCounts | null }) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          checking: false,
          hasVoted: data.hasVoted,
          votedFor: data.votedFor ?? null,
          votes: data.votes,
        }));
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, checking: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleVote = async (driverRef: string) => {
    if (state.hasVoted || state.status === "voting") return;
    setState((prev) => ({ ...prev, status: "voting" }));

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, driverRef }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        alreadyVoted?: boolean;
        votedFor?: string;
        votes?: VoteCounts;
        error?: string;
      };

      if (res.ok || res.status === 409) {
        setState({
          hasVoted: true,
          votedFor: data.votedFor ?? driverRef,
          votes: data.votes ?? null,
          status: "idle",
          checking: false,
        });
        if (res.ok) {
          trackEvent("vote_cast", { slug, voted_for: driverRef });
        }
      } else {
        setState((prev) => ({ ...prev, status: "error" }));
      }
    } catch {
      setState((prev) => ({ ...prev, status: "error" }));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (state.checking) {
    // Skeleton while checking vote status
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p
          style={{
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--muted-foreground)",
            margin: 0,
          }}
        >
          Who is the better driver?
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              flex: 1,
              height: 48,
              borderRadius: 10,
              backgroundColor: "var(--surface-elevated)",
              border: "2px solid var(--border)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 48,
              borderRadius: 10,
              backgroundColor: "var(--surface-elevated)",
              border: "2px solid var(--border)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p
        style={{
          textAlign: "center",
          fontSize: 14,
          fontWeight: 600,
          color: state.hasVoted ? "var(--muted-foreground)" : "var(--foreground)",
          margin: 0,
        }}
      >
        {state.hasVoted ? "Fan vote results" : "Who is the better driver?"}
      </p>

      {/* Vote buttons — hidden after voting */}
      {!state.hasVoted && (
        <div style={{ display: "flex", gap: 12 }}>
          <VoteButton
            name={nameA}
            color={colorA}
            disabled={false}
            loading={state.status === "voting"}
            onClick={() => handleVote(driverARef)}
          />
          <VoteButton
            name={nameB}
            color={colorB}
            disabled={false}
            loading={state.status === "voting"}
            onClick={() => handleVote(driverBRef)}
          />
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <p style={{ textAlign: "center", fontSize: 12, color: "#e10600", margin: 0 }}>
          Something went wrong. Please try again.
        </p>
      )}

      {/* Results — only shown after voting */}
      {state.hasVoted && state.votes && (
        <VoteResults
          votes={state.votes}
          votedFor={state.votedFor}
          driverARef={driverARef}
          driverBRef={driverBRef}
          nameA={nameA}
          nameB={nameB}
          colorA={colorA}
          colorB={colorB}
        />
      )}

      {/* Edge case: voted but counts not available yet */}
      {state.hasVoted && !state.votes && (
        <p style={{ textAlign: "center", fontSize: 13, color: "#555", margin: 0 }}>
          Vote recorded. Results will appear shortly.
        </p>
      )}
    </div>
  );
}
