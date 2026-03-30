const DEFAULT_SITE_URL = "https://gridrival.com";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    return DEFAULT_SITE_URL;
  }

  const withScheme = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;

  try {
    return new URL(withScheme).toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}
