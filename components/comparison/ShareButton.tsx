"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

interface ShareButtonProps {
  slug: string;
  nameA: string;
  nameB: string;
}

export function ShareButton({ slug, nameA, nameB }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const pageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/compare/${slug}`
      : `https://f1-versus.com/compare/${slug}`;

  const ogImageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/og/${slug}`
      : `https://f1-versus.com/api/og/${slug}`;

  const handleCopy = async () => {
    trackEvent("share_clicked", { slug, method: "copy_link" });
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a temporary input
      const input = document.createElement("input");
      input.value = pageUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    trackEvent("share_clicked", { slug, method: "download_image" });
    setDownloading(true);
    try {
      const res = await fetch(ogImageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(ogImageUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const tweetText = encodeURIComponent(
    `${nameA} vs ${nameB} — settled by data 🏎️`
  );
  const tweetUrl = encodeURIComponent(pageUrl);
  const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;

  const tapTargetStyle: React.CSSProperties = { minHeight: 44 };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopy}
        style={{
          ...tapTargetStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          backgroundColor: copied ? "#166534" : "var(--surface-elevated)",
          border: `1px solid ${copied ? "#166534" : "var(--border)"}`,
          borderRadius: 8,
          color: copied ? "#86efac" : "var(--foreground)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Link
          </>
        )}
      </button>

      {/* Download image */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          ...tapTargetStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--foreground)",
          fontSize: 13,
          fontWeight: 600,
          cursor: downloading ? "wait" : "pointer",
          opacity: downloading ? 0.7 : 1,
          transition: "opacity 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        {downloading ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Downloading…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Image
          </>
        )}
      </button>

      {/* Share on X */}
      <a
        href={tweetHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("share_clicked", { slug, method: "twitter" })}
        style={{
          ...tapTargetStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          backgroundColor: "#000",
          border: "1px solid #333",
          borderRadius: 8,
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
          transition: "opacity 0.15s",
        }}
      >
        {/* X logo */}
        <svg width="13" height="13" viewBox="0 0 1200 1227" fill="currentColor">
          <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
        </svg>
        Share on X
      </a>

      {/* Web Share API — only renders when supported */}
      <NativeShareButton slug={slug} nameA={nameA} nameB={nameB} pageUrl={pageUrl} />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Native share (mobile) ─────────────────────────────────────────────────
// Conditionally rendered — Web Share API is not universally available.

function NativeShareButton({
  slug,
  nameA,
  nameB,
  pageUrl,
}: {
  slug: string;
  nameA: string;
  nameB: string;
  pageUrl: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);

  // Check on first render (client only)
  if (supported === null) {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      // defer actual state set to avoid hydration mismatch
      setTimeout(() => setSupported(true), 0);
    }
    return null;
  }

  if (!supported) return null;

  const handleShare = async () => {
    trackEvent("share_clicked", { slug, method: "native" });
    try {
      await navigator.share({
        title: `${nameA} vs ${nameB} | F1-Versus`,
        text: `${nameA} vs ${nameB} — settled by data 🏎️`,
        url: pageUrl,
      });
    } catch {
      // User cancelled or share failed — no-op
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--foreground)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      Share
    </button>
  );
}
