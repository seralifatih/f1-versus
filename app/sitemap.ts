import type { MetadataRoute } from "next";
import { createServerClient } from "@/lib/supabase/client";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://gridrival.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();

  // ── Static pages ──────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,         lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/drivers`,  lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/rankings`, lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/compare`,  lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
  ];

  // ── Driver pages (/drivers/[ref]) ─────────────────────────────────────────
  const { data: drivers } = await supabase
    .from("drivers")
    .select("driver_ref, updated_at")
    .order("last_name");

  const driverPages: MetadataRoute.Sitemap = (drivers ?? []).map((d) => ({
    url: `${BASE_URL}/drivers/${d.driver_ref}`,
    lastModified: d.updated_at ? new Date(d.updated_at) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // ── Comparison pages (/compare/[slug]) ────────────────────────────────────
  const { data: comparisons } = await supabase
    .from("driver_comparisons")
    .select("slug, last_computed_at")
    .is("season", null)
    .order("last_computed_at", { ascending: false });

  const comparisonPages: MetadataRoute.Sitemap = (comparisons ?? [])
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${BASE_URL}/compare/${c.slug}`,
      lastModified: c.last_computed_at ? new Date(c.last_computed_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));

  return [...staticPages, ...driverPages, ...comparisonPages];
}
