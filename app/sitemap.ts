import type { MetadataRoute } from "next";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/drivers`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/rankings`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  if (!hasPublicSupabaseConfig()) {
    return staticPages;
  }

  const supabase = createServerClient();

  const { data: drivers } = await supabase.from("drivers").select("driver_ref, updated_at").order("last_name");

  const driverPages: MetadataRoute.Sitemap = (drivers ?? []).map((driver) => ({
    url: `${BASE_URL}/drivers/${driver.driver_ref}`,
    lastModified: driver.updated_at ? new Date(driver.updated_at) : new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const { data: comparisons } = await supabase
    .from("driver_comparisons")
    .select("slug, last_computed_at")
    .is("season", null)
    .order("last_computed_at", { ascending: false });

  const comparisonPages: MetadataRoute.Sitemap = (comparisons ?? [])
    .filter((comparison) => comparison.slug)
    .map((comparison) => ({
      url: `${BASE_URL}/compare/${comparison.slug}`,
      lastModified: comparison.last_computed_at ? new Date(comparison.last_computed_at) : new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    }));

  return [...staticPages, ...driverPages, ...comparisonPages];
}
