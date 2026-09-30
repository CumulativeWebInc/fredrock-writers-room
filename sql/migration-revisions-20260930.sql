-- FredRock Writers Room — revisions migration 2026-09-30
-- Run this AFTER schema.sql + seed.sql if you already set up Supabase.
-- (Fresh setups: these are folded into schema.sql — you do not need this file.)
--
-- 1) writers: avatar_url (profile photo) + onboarded_at (first-run onboarding flag)
-- 2) answer_attachments: files writers attach to an answer (docs / images / text files)
-- 3) storage buckets: fredrock-avatars (public) + fredrock-attachments (private)

-- 1. Writer profile columns -------------------------------------------------
ALTER TABLE public.writers ADD COLUMN IF NOT EXISTS avatar_url   text NULL;
ALTER TABLE public.writers ADD COLUMN IF NOT EXISTS onboarded_at timestamptz NULL;

-- 2. Answer attachments -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.answer_attachments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id   uuid        NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE,
  writer_id   uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  storage_path text       NOT NULL,   -- {writer_id}/{answer_id}/{file_name}
  file_name   text        NOT NULL,
  mime_type   text        NULL,
  size_bytes  bigint      NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.answer_attachments IS
  'FredRock Writers Room: docs/images/text files attached to an answer. Blobs live in the fredrock-attachments bucket.';

ALTER TABLE public.answer_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "answer_attachments owner all" ON public.answer_attachments;
CREATE POLICY "answer_attachments owner all"
  ON public.answer_attachments FOR ALL TO authenticated
  USING (writer_id = auth.uid())
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "answer_attachments admin all" ON public.answer_attachments;
CREATE POLICY "answer_attachments admin all"
  ON public.answer_attachments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3a. fredrock-avatars bucket (public — profile photos shown on the dashboard) --
INSERT INTO storage.buckets (id, name, public)
VALUES ('fredrock-avatars', 'fredrock-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fredrock-avatars public read" ON storage.objects;
CREATE POLICY "fredrock-avatars public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'fredrock-avatars');

DROP POLICY IF EXISTS "fredrock-avatars owner insert" ON storage.objects;
CREATE POLICY "fredrock-avatars owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fredrock-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "fredrock-avatars owner update" ON storage.objects;
CREATE POLICY "fredrock-avatars owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fredrock-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- 3b. fredrock-attachments bucket (private — docs/images attached to answers) --
INSERT INTO storage.buckets (id, name, public)
VALUES ('fredrock-attachments', 'fredrock-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fredrock-attachments owner insert" ON storage.objects;
CREATE POLICY "fredrock-attachments owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fredrock-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "fredrock-attachments owner or admin select" ON storage.objects;
CREATE POLICY "fredrock-attachments owner or admin select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fredrock-attachments'
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "fredrock-attachments owner delete" ON storage.objects;
CREATE POLICY "fredrock-attachments owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fredrock-attachments'
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_admin())
  );
