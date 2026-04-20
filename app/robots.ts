import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "Googlebot",
        allow: ["/", "/api/og/"],
        disallow: ["/api/", "/_next/"],
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/api/og/", "/embed/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
