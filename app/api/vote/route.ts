import { type NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { createHash } from "crypto";
import { parseComparisonSlug } from "@/lib/data/types";

const DEV_VOTE_IP_HASH_SECRET = "f1-versus-dev-only-secret";
let hasWarnedAboutVoteSecret = false;

// ─── GET /api/vote?slug=verstappen-vs-hamilton ─────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const parsed = parseComparisonSlug(slug);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const ipHash = hashIp(ip);
  const db = getDB();

  const existing = await db
    .prepare(`SELECT driver_ref FROM votes WHERE comparison_slug = ? AND ip_hash = ?`)
    .bind(slug, ipHash)
    .first<{ driver_ref: string }>();

  if (!existing) {
    return NextResponse.json({ hasVoted: false, votes: null });
  }

  const { results: allVotes } = await db
    .prepare(`SELECT driver_ref FROM votes WHERE comparison_slug = ?`)
    .bind(slug)
    .all<{ driver_ref: string }>();

  const votesA = allVotes.filter((v) => v.driver_ref === parsed.driverARef).length;
  const votesB = allVotes.filter((v) => v.driver_ref === parsed.driverBRef).length;

  return NextResponse.json({
    hasVoted: true,
    votedFor: existing.driver_ref,
    votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB },
  });
}

// ─── POST /api/vote ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let slug = "";
  let driverRef = "";

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
    const formData = await request.formData();
    slug = (formData.get("slug") as string) ?? "";
    driverRef = (formData.get("driverRef") as string) ?? "";
  }

  if (!slug || !driverRef) {
    return NextResponse.json({ error: "Missing required fields: slug, driverRef" }, { status: 400 });
  }

  const parsed = parseComparisonSlug(slug);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid comparison slug" }, { status: 400 });
  }

  const validRefs = [parsed.driverARef, parsed.driverBRef];
  if (!validRefs.includes(driverRef)) {
    return NextResponse.json({ error: "driverRef must be one of the two drivers in the comparison" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const ipHash = hashIp(ip);
  const db = getDB();

  const existing = await db
    .prepare(`SELECT id FROM votes WHERE comparison_slug = ? AND ip_hash = ?`)
    .bind(slug, ipHash)
    .first<{ id: string }>();

  if (existing) {
    const { results: counts } = await db
      .prepare(`SELECT driver_ref FROM votes WHERE comparison_slug = ?`)
      .bind(slug)
      .all<{ driver_ref: string }>();

    const votesA = counts.filter((v) => v.driver_ref === parsed.driverARef).length;
    const votesB = counts.filter((v) => v.driver_ref === parsed.driverBRef).length;

    if (!contentType.includes("application/json")) {
      return NextResponse.redirect(new URL(`/compare/${slug}`, request.url), 303);
    }

    return NextResponse.json(
      { alreadyVoted: true, votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB } },
      { status: 409 }
    );
  }

  try {
    await db
      .prepare(`INSERT INTO votes (id, comparison_slug, driver_ref, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), slug, driverRef, ipHash, new Date().toISOString())
      .run();
  } catch (err) {
    console.error("Vote insert error:", err);
    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }

  const { results: counts } = await db
    .prepare(`SELECT driver_ref FROM votes WHERE comparison_slug = ?`)
    .bind(slug)
    .all<{ driver_ref: string }>();

  const votesA = counts.filter((v) => v.driver_ref === parsed.driverARef).length;
  const votesB = counts.filter((v) => v.driver_ref === parsed.driverBRef).length;

  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(new URL(`/compare/${slug}`, request.url), 303);
  }

  return NextResponse.json({
    success: true,
    votedFor: driverRef,
    votes: { [parsed.driverARef]: votesA, [parsed.driverBRef]: votesB },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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
    console.warn("[vote] VOTE_IP_HASH_SECRET is not set; using a development-only fallback secret.");
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
