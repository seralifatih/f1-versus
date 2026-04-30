import type { MetadataRoute } from "next";
import { getDB, hasDB } from "@/lib/db/client";
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

  if (!hasDB()) return staticPages;

  const db = getDB();

  const [{ results: drivers }, { results: comparisons }, { results: constructors }, { results: teamComps }] =
    await Promise.all([
      db.prepare(`SELECT driver_ref, updated_at FROM drivers ORDER BY last_name`).all<{ driver_ref: string; updated_at: string }>(),
      db.prepare(`SELECT slug, last_computed_at FROM driver_comparisons WHERE season IS NULL ORDER BY last_computed_at DESC`).all<{ slug: string; last_computed_at: string }>(),
      db.prepare(`SELECT constructor_ref, updated_at FROM constructors ORDER BY constructor_ref`).all<{ constructor_ref: string; updated_at: string }>(),
      db.prepare(`SELECT slug, last_computed_at FROM constructor_comparisons ORDER BY last_computed_at DESC LIMIT 200`).all<{ slug: string; last_computed_at: string }>(),
    ]);

  const driverPages: MetadataRoute.Sitemap = drivers.map((d) => ({
    url: `${BASE_URL}/drivers/${d.driver_ref}`,
    lastModified: d.updated_at ? new Date(d.updated_at) : new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const comparisonPages: MetadataRoute.Sitemap = comparisons
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${BASE_URL}/compare/${c.slug}`,
      lastModified: c.last_computed_at ? new Date(c.last_computed_at) : new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    }));

  const teamPages: MetadataRoute.Sitemap = constructors.map((c) => ({
    url: `${BASE_URL}/teams/${c.constructor_ref}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const rivalrySlugs = RIVALRY_PAIRS.map(([a, b]) => buildTeamSlug(a, b));
  const teamCompSlugs = new Set<string>(rivalrySlugs);
  for (const c of teamComps) { if (c.slug) teamCompSlugs.add(c.slug); }

  const teamCompMap = new Map(teamComps.map((c) => [c.slug, c.last_computed_at]));
  const teamCompPages: MetadataRoute.Sitemap = Array.from(teamCompSlugs).map((slug) => ({
    url: `${BASE_URL}/compare/teams/${slug}`,
    lastModified: teamCompMap.get(slug) ? new Date(teamCompMap.get(slug)!) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  return [...staticPages, ...driverPages, ...comparisonPages, ...teamPages, ...teamCompPages];
}
