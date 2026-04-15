/**
 * Client-side analytics helpers.
 *
 * Wraps Cloudflare Web Analytics' custom event API.
 * Falls back silently if the beacon hasn't loaded yet.
 *
 * CF beacon exposes: window.__cfBeacon?.sendEvent(name, data)
 * Docs: https://developers.cloudflare.com/analytics/web-analytics/custom-events/
 *
 * Usage (client components only):
 *   import { trackEvent } from "@/lib/analytics";
 *   trackEvent("comparison_viewed", { slug: "hamilton-vs-verstappen" });
 */

type EventName =
  | "comparison_viewed"
  | "vote_cast"
  | "share_clicked"
  | "search_compare"
  | "embed_copy";

type EventProperties = Record<string, string | number | boolean>;

export function trackEvent(name: EventName, props?: EventProperties): void {
  try {
    if (typeof window !== "undefined" && window.__cfBeacon?.sendEvent) {
      window.__cfBeacon.sendEvent(name, props);
    }
  } catch {
    // Never throw — analytics must never break the UI
  }
}
