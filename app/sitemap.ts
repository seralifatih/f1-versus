import type { MetadataRoute } from "next";
import { createServerClient, hasPublicSupabaseConfig } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/site-url";
import { buildTeamSlug } from "@/lib/data/types";

const BASE_URL = getSiteUrl();

// Top historical team rivalry pairs (same list as compare/teams page)
const RIVALRY_PAIRS: [string, string][] = [
  ["ferrari", "mclaren"],
  ["mercedes", "red_bull"],
  ["ferrari", "williams"],
  ["ferrari", "renault"],
  ["mclaren", "williams"],
  ["ferrari", "red_bull"],
  ["mercedes", "ferrari"],
  ["mclaren", "red_bull"],
  ["williams", "renault"],
  ["benetton", "williams"],
  ["ferrari", "benetton"],
  ["mclaren", "renault"],
  ["lotus_f1", "ferrari"],
  ["mercedes", "mclaren"],
  ["ferrari", "mercedes"],
  ["red_bull", "renault"],
  ["williams", "mercedes"],
  ["lotus_f1", "mclaren"],
  ["ferrari", "lotus_f1"],
  ["mclaren", "mercedes"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/drivers`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/rankings`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/teams`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
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

  // ─── Team pages ──────────────────────────────────────────────────────────

  const { data: constructors } = await supabase
    .from("constructors")
    .select("constructor_ref, updated_at")
    .order("constructor_ref");

  const teamPages: MetadataRoute.Sitemap = (constructors ?? []).map(
    (c: { constructor_ref: string; updated_at?: string }) => ({
      url: `${BASE_URL}/teams/${c.constructor_ref}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })
  );

  // ─── Team comparison pages ────────────────────────────────────────────────

  // Hardcoded top rivalries (always indexed)
  const rivalrySlugs = RIVALRY_PAIRS.map(([a, b]) => buildTeamSlug(a, b));

  // Current season team pairs from constructor_comparisons cache (if table exists)
  const { data: teamComps } = await supabase
    .from("constructor_comparisons")
    .select("slug, last_computed_at")
    .order("last_computed_at", { ascending: false })
    .limit(200);

  const teamCompSlugs = new Set<string>(rivalrySlugs);
  for (const c of (teamComps ?? []) as { slug: string }[]) {
    if (c.slug) teamCompSlugs.add(c.slug);
  }

  const teamCompPages: MetadataRoute.Sitemap = Array.from(teamCompSlugs).map((slug) => {
    const cached = (teamComps ?? []).find((c: { slug: string }) => c.slug === slug);
    return {
      url: `${BASE_URL}/compare/teams/${slug}`,
      lastModified: (cached as { last_computed_at?: string } | undefined)?.last_computed_at
        ? new Date((cached as { last_computed_at: string }).last_computed_at)
        : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.85,
    };
  });

  return [...staticPages, ...driverPages, ...comparisonPages, ...teamPages, ...teamCompPages];
}
