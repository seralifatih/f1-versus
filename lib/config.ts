/**
 * Tiny config helper. NEXT_PUBLIC_SITE_URL is set per environment in
 * wrangler.toml / Cloudflare dashboard. Falls back to the production
 * canonical so local dev still generates sane URLs in sitemap/OG tags.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://f1-versus.com'
