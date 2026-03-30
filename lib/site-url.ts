const DEFAULT_SITE_URL = "https://gridrival.com";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : DEFAULT_SITE_URL;
}

