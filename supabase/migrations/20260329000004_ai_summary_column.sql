-- Add AI-generated summary columns to driver_comparisons.
-- The summary is a 3-sentence analyst verdict from Groq.
-- Regenerated weekly or when stats are recomputed.

alter table driver_comparisons
  add column if not exists ai_summary           text,
  add column if not exists ai_summary_generated_at timestamptz;
