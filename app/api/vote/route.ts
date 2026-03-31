import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { parseComparisonSlug } from "@/lib/data/types";

const DEV_VOTE_IP_HASH_SECRET = "f1-versus-dev-only-secret";
let hasWarnedAboutVoteSecret = false;

// ─── GET /api/vote?slug=verstappen-vs-hamilton ─────────────────────────────
// Returns vote counts only if the requesting IP has already voted.
// Uses service role to bypass RLS (votes table is not publicly readable).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const parsed = parseComparisonSlug(slug);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const ipHash = hashIp(ip);
  const supabase = getServiceClient();

  // Only reveal counts if this IP has voted
  const { data: existing } = await supabase
    .from("votes")
    .select("driver_ref")
    .eq("comparison_slug", slug)
    .eq("ip_hash", ipHash)
    .single();

  if (!existing) {
    return NextResponse.json({ hasVoted: false, votes: null });
  }

  // Fetch aggregate counts
  const { data: allVotes } = await supabase
    .from("votes")
    .select("driver_ref")
    .eq("comparison_slug", slug);

  const votesA = allVotes?.filter((v) => v.driver_ref === parsed.driverARef).length ?? 0;
  const votesB = allVotes?.filter((v) => v.driver_ref === parsed.driverBRef).length ?? 0;

  return NextResponse.json({
    hasVoted: true,
    votedFor: existing.driver_ref,
    votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB },
  });
}

// Use service role client to bypass RLS for inserts.
// This is a trusted server-side endpoint only.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Hash an IP address for privacy (one-way, not reversible).
 * We also include a server-side secret to prevent rainbow table attacks.
 */
function hashIp(ip: string): string {
  const secret = getVoteHashSecret();
  return createHash("sha256")
    .update(`${secret}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

function getVoteHashSecret(): string {
  const secret = process.env.VOTE_IP_HASH_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("VOTE_IP_HASH_SECRET must be set in production");
  }

  if (!hasWarnedAboutVoteSecret) {
    hasWarnedAboutVoteSecret = true;
    console.warn(
      "[vote] VOTE_IP_HASH_SECRET is not set; using a development-only fallback secret."
    );
  }

  return DEV_VOTE_IP_HASH_SECRET;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * POST /api/vote
 *
 * Body (JSON or form-encoded):
 *   slug: string        — comparison slug (e.g., "hamilton-vs-verstappen")
 *   driverRef: string   — the driver ref being voted for
 *
 * Rate limiting: one vote per IP per comparison slug.
 * Returns 200 with updated vote counts or 409 if already voted.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let slug = "";
  let driverRef = "";

  // Support both JSON and form submissions
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { slug?: string; driverRef?: string };
      slug = body.slug ?? "";
      driverRef = body.driverRef ?? "";
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    // form-encoded (default HTML form POST)
    const formData = await request.formData();
    slug = (formData.get("slug") as string) ?? "";
    driverRef = (formData.get("driverRef") as string) ?? "";
  }

  if (!slug || !driverRef) {
    return NextResponse.json(
      { error: "Missing required fields: slug, driverRef" },
      { status: 400 }
    );
  }

  // Validate slug format
  const parsed = parseComparisonSlug(slug);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid comparison slug" }, { status: 400 });
  }

  // Validate driverRef is one of the two drivers in the slug
  const validRefs = [parsed.driverARef, parsed.driverBRef];
  if (!validRefs.includes(driverRef)) {
    return NextResponse.json(
      { error: "driverRef must be one of the two drivers in the comparison" },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const ipHash = hashIp(ip);

  const supabase = getServiceClient();

  // Check if this IP already voted on this comparison
  const { data: existing } = await supabase
    .from("votes")
    .select("id")
    .eq("comparison_slug", slug)
    .eq("ip_hash", ipHash)
    .single();

  if (existing) {
    // Return current counts but signal already voted
    const { data: counts } = await supabase
      .from("votes")
      .select("driver_ref")
      .eq("comparison_slug", slug);

    const votesA = counts?.filter((v) => v.driver_ref === parsed.driverARef).length ?? 0;
    const votesB = counts?.filter((v) => v.driver_ref === parsed.driverBRef).length ?? 0;

    // If request was a form POST, redirect back to the comparison page
    if (!contentType.includes("application/json")) {
      return NextResponse.redirect(new URL(`/compare/${slug}`, request.url), 303);
    }

    return NextResponse.json(
      {
        alreadyVoted: true,
        votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB },
      },
      { status: 409 }
    );
  }

  // Insert the vote
  const { error: insertError } = await supabase.from("votes").insert({
    comparison_slug: slug,
    driver_ref: driverRef,
    ip_hash: ipHash,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error("Vote insert error:", insertError);
    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }

  // Fetch updated counts
  const { data: counts } = await supabase
    .from("votes")
    .select("driver_ref")
    .eq("comparison_slug", slug);

  const votesA = counts?.filter((v) => v.driver_ref === parsed.driverARef).length ?? 0;
  const votesB = counts?.filter((v) => v.driver_ref === parsed.driverBRef).length ?? 0;

  // HTML form POST: redirect back
  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(new URL(`/compare/${slug}`, request.url), 303);
  }

  return NextResponse.json({
    success: true,
    votedFor: driverRef,
    votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB },
  });
}
