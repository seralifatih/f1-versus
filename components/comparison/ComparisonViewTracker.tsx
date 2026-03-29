"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function ComparisonViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent("comparison_viewed", { slug });
  }, [slug]);

  return null;
}
