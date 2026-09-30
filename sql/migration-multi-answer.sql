-- FredRock Writers Room — Migration: multiple answers per question
-- Run this in the Supabase SQL editor AFTER schema.sql (safe to run on existing installs).
-- Allows writers to add more than one answer to the same question.

-- 1. Drop the one-answer-per-question constraint.
ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_writer_id_question_id_key;

-- 2. Update the table comment to reflect the new behavior.
COMMENT ON TABLE public.answers IS
  'FredRock Writers Room: writer answers. Multiple answers per (writer, question) allowed — writers can add follow-up answers.';
