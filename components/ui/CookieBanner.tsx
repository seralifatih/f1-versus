"use client";

/**
 * CookieBanner
 *
 * EU cookie consent banner. Gates Google AdSense until the user accepts.
 * Cloudflare Web Analytics is cookie-free and does NOT need consent.
 *
 * Consent is stored in localStorage under key "cookie_consent".
 * Values: "accepted" | "declined" | (absent = not yet decided)
 *
 * On accept: dynamically injects the AdSense <script> tag.
 * On decline: banner hides, AdSense is never loaded.
 * On revisit: if "accepted" already stored, loads AdSense immediately
 *             without showing the banner (no layout flash).
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const CONSENT_KEY = "cookie_consent";

interface CookieBannerProps {
  adSenseClientId: string;
}

export function CookieBanner({ adSenseClientId }: CookieBannerProps) {
  const [visible, setVisible] = useState(false);

  // On mount: check stored consent, load AdSense if already accepted
  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted") {
      loadAdSense(adSenseClientId);
      return;
    }
    if (stored === "declined") {
      return;
    }
    // No decision yet — show banner (slight delay to avoid CLS on page load)
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [adSenseClientId]);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
    loadAdSense(adSenseClientId);
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      style={{
        position: "fixed",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: 0,
        right: 0,
        zIndex: 50,
        padding: "0 16px 12px",
        // Pointer events only over the banner itself
      }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          backgroundColor: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.6)",
        }}
      >
        {/* Text */}
        <p
          style={{
            flex: "1 1 260px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#aaa",
            margin: 0,
          }}
        >
          We use cookies to show relevant ads via Google AdSense. Analytics are
          cookie-free.{" "}
          <Link
            href="/privacy"
            style={{
              color: "#666",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Privacy policy
          </Link>
          .
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleDecline}
            style={{
              padding: "8px 16px",
              borderRadius: 7,
              border: "1px solid #333",
              backgroundColor: "transparent",
              color: "#666",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 36,
              whiteSpace: "nowrap",
            }}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            style={{
              padding: "8px 20px",
              borderRadius: 7,
              border: "1px solid #e10600",
              backgroundColor: "#e10600",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 36,
              whiteSpace: "nowrap",
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdSense loader ────────────────────────────────────────────────────────

let adSenseLoaded = false;

function loadAdSense(clientId: string): void {
  if (!clientId || adSenseLoaded) return;
  if (typeof document === "undefined") return;

  adSenseLoaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  document.head.appendChild(script);
}
