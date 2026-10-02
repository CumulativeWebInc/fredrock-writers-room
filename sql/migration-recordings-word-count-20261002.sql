-- FredRock Writers Room — recordings word_count (2026-10-02)
-- The Voice Studio + per-question recorder now store a word count for each
-- recording's transcript, and the writer/admin word metrics include it.
-- Run once in the Supabase SQL editor AFTER the live app is updated.

ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS word_count int NOT NULL DEFAULT 0;

-- Backfill existing rows from their stored transcripts (same rule as the app:
-- words = whitespace-split tokens of the trimmed transcript).
UPDATE public.recordings
SET word_count = CASE
  WHEN trim(coalesce(transcript_text, '')) = '' THEN 0
  ELSE array_length(regexp_split_to_array(trim(transcript_text), E'\\s+'), 1)
END
WHERE word_count = 0;
