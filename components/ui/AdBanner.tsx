"use client";

/**
 * AdBanner — Google AdSense integration.
 *
 * Each slot maps to a real AdSense ad unit. The outer wrapper reserves space
 * with min-height so there is zero layout shift (CLS) while the ad loads.
 *
 * To activate:
 *  1. Set NEXT_PUBLIC_ADSENSE_CLIENT_ID in .env.local (ca-pub-XXXXXXXXXXXXXXXX)
 *  2. Set the ad slot IDs below to your real unit IDs from AdSense dashboard
 *  3. The <Script> in app/layout.tsx already loads adsbygoogle.js
 *
 * Slots:
 *   leaderboard    — 728×90 desktop / 320×50 mobile — homepage after hero
 *   rectangle      — 300×250 medium rectangle       — compare page after radar
 *   in-feed        — responsive full-width           — compare page before circuits
 *   sticky-footer  — 320×50, fixed bottom           — mobile only
 */

import { useEffect, useRef } from "react";
import Link from "next/link";

export type AdSlot = "leaderboard" | "rectangle" | "in-feed" | "sticky-footer";

interface AdBannerProps {
  slot: AdSlot;
  className?: string;
}

// ─── Slot configuration ────────────────────────────────────────────────────
// Replace the adSlotId values with your real AdSense ad unit IDs.

interface SlotConfig {
  adSlotId: string;
  /** adsbygoogle data-ad-format */
  format: string;
  /** Whether to use responsive auto-sizing */
  responsive: boolean;
  /** Outer wrapper min-height — prevents CLS */
  minHeight: number;
  /** Outer wrapper max-width */
  maxWidth?: number | string;
  /** data-full-width-responsive */
  fullWidthResponsive?: boolean;
}

const SLOT_CONFIG: Record<AdSlot, SlotConfig> = {
  leaderboard: {
    adSlotId: "LEADERBOARD_SLOT_ID",    // replace with real slot ID
    format: "horizontal",
    responsive: true,
    minHeight: 90,
    maxWidth: 728,
    fullWidthResponsive: true,
  },
  rectangle: {
    adSlotId: "RECTANGLE_SLOT_ID",      // replace with real slot ID
    format: "rectangle",
    responsive: false,
    minHeight: 250,
    maxWidth: 300,
  },
  "in-feed": {
    adSlotId: "INFEED_SLOT_ID",         // replace with real slot ID
    format: "fluid",
    responsive: true,
    minHeight: 90,
    fullWidthResponsive: true,
  },
  "sticky-footer": {
    adSlotId: "STICKY_FOOTER_SLOT_ID",  // replace with real slot ID
    format: "horizontal",
    responsive: true,
    minHeight: 50,
    maxWidth: 320,
  },
};

// Read from env — set in .env.local as NEXT_PUBLIC_ADSENSE_CLIENT_ID
const CLIENT_ID =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? ""
    : "";

// ─── Ad unit ───────────────────────────────────────────────────────────────

function AdUnit({ slot }: { slot: AdSlot }) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const config = SLOT_CONFIG[slot];

  useEffect(() => {
    if (pushed.current) return;
    if (!CLIENT_ID) return;

    try {
      // adsbygoogle is injected by the Script tag in layout.tsx
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // adsbygoogle not yet loaded — will init on next render cycle
    }
  }, []);

  if (!CLIENT_ID) {
    // No client ID configured — show labelled placeholder (dev / staging)
    return (
      <div
        aria-hidden
        style={{
          width: "100%",
          maxWidth: config.maxWidth,
          minHeight: config.minHeight,
          margin: "0 auto",
          backgroundColor: "#111",
          border: "1px dashed #222",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "#333",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        Ad · {slot}
      </div>
    );
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{
        display: "block",
        width: "100%",
        maxWidth: config.maxWidth,
        minHeight: config.minHeight,
        margin: "0 auto",
      }}
      data-ad-client={CLIENT_ID}
      data-ad-slot={config.adSlotId}
      data-ad-format={config.format}
      {...(config.fullWidthResponsive
        ? { "data-full-width-responsive": "true" }
        : {})}
    />
  );
}

// ─── Main export ───────────────────────────────────────────────────────────

export function AdBanner({ slot, className }: AdBannerProps) {
  const isSticky = slot === "sticky-footer";

  if (isSticky) {
    return (
      <>
        <div
          className={`ad-sticky-footer-wrapper${className ? ` ${className}` : ""}`}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            padding: "6px 16px env(safe-area-inset-bottom)",
            backgroundColor: "var(--background)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <AdUnit slot={slot} />
          <div style={{ textAlign: "center", marginTop: 2 }}>
            <Link
              href="/pro"
              style={{
                fontSize: 10,
                color: "#444",
                textDecoration: "none",
              }}
            >
              Remove ads
            </Link>
          </div>
        </div>
        {/* CSS: hide sticky footer on desktop */}
        <style>{`
          @media (min-width: 640px) {
            .ad-sticky-footer-wrapper { display: none !important; }
          }
        `}</style>
      </>
    );
  }

  return (
    <div className={className}>
      <AdUnit slot={slot} />
    </div>
  );
}
