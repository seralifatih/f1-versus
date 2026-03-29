-- ============================================================
-- Fix votes RLS: remove public SELECT so vote counts are
-- hidden until the user votes (prevents anchoring bias).
-- The /api/vote GET endpoint uses the service-role key to
-- read aggregates server-side after a valid vote is cast.
-- ============================================================

-- Drop the overly-permissive public read policy
drop policy if exists "public_read_votes" on votes;

-- No replacement: service_role bypasses RLS and can still read.
-- Anon/authenticated users cannot SELECT from votes at all.
-- Vote counts are exposed only through the /api/vote GET route,
-- which is gated: it only returns data when a valid ip_hash
-- is present in the table for that slug.
