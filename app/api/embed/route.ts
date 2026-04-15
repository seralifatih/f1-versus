import type { NextRequest } from "next/server";
import { parseComparisonSlug, buildComparisonSlug } from "@/lib/data/types";

/**
 * GET /api/embed?slug=verstappen-vs-hamilton
 *
 * Returns an <iframe> snippet for embedding the comparison widget.
 * Supports two response formats:
 *   - Accept: text/html  → raw iframe HTML string
 *   - Accept: application/json (default) → { html: string, url: string }
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");

  if (!slug) {
    return Response.json(
      { error: "Missing required query param: slug" },
      { status: 400 }
    );
  }

  const parsed = parseComparisonSlug(slug);
  if (!parsed) {
    return Response.json(
      { error: "Invalid comparison slug format. Expected: driverA-vs-driverB" },
      { status: 400 }
    );
  }

  // Normalise to canonical alphabetical order
  const canonicalSlug = buildComparisonSlug(
    parsed.driverARef,
    parsed.driverBRef
  );

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://f1-versus.com";

  const embedUrl = `${origin}/embed/${canonicalSlug}`;

  const html = `<iframe
  src="${embedUrl}"
  width="600"
  height="400"
  style="border:none;border-radius:12px;overflow:hidden;"
  title="${parsed.driverARef.replace(/_/g, " ")} vs ${parsed.driverBRef.replace(/_/g, " ")} F1 comparison"
  loading="lazy"
  referrerpolicy="origin"
></iframe>`;

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return Response.json(
    { html, url: embedUrl, slug: canonicalSlug },
    {
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
