-- ============================================================================
-- FredRock Writers Room — Supabase Postgres schema
-- Goal: goal_73722a03600a | CWI identity | Branding: "FredRock Writers Room"
-- $0 route: free-tier Supabase (10 users fit easily).
--
-- HOW TO USE: paste this whole file into the Supabase Dashboard -> SQL Editor
-- -> New query, then press Run. It is safe to re-run: tables, policies,
-- triggers, functions and the storage bucket are all created idempotently.
--
-- CONTRACT: table/column names are EXACT per ARCHITECTURE.md §3 — the
-- frontend (writer.html / admin.html) depends on these names.
-- Conventions applied where §3 is silent:
--   * every uuid PK defaults to gen_random_uuid()
--   * created_at / updated_at default to now()
--   * UNIQUE(title) on question_sets & resources, UNIQUE(set_id, sort_order)
--     on questions — stable natural keys so seed.sql is idempotent
-- ============================================================================

-- 0. Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- 1. Tables ------------------------------------------------------------------
-- Invite codes: handed out by the admin; claimed once via claim_invite().
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE,
  role       text        NOT NULL DEFAULT 'writer',   -- 'writer' | 'admin'
  created_by uuid        NULL,                          -- writers.id of the admin who made it
  claimed_by uuid        NULL,                          -- auth.users.id of the claimer
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  note       text        NULL
);
COMMENT ON TABLE public.invite_codes IS
  'FredRock Writers Room: one-time invite codes. Claimed ONLY through the claim_invite() RPC; no direct client access.';

-- Writers: one row per authenticated user. id MUST equal auth.users.id.
CREATE TABLE IF NOT EXISTS public.writers (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text        NOT NULL,
  email           text        NULL,
  role            text        NOT NULL DEFAULT 'writer',  -- enforced from invite code by trigger
  invite_code     text        NULL,                        -- the code this writer claimed
  is_active       bool        NOT NULL DEFAULT true,       -- admin can deactivate
  share_by_default bool       NOT NULL DEFAULT false,
  avatar_url      text        NULL,                          -- profile photo (fredrock-avatars bucket)
  onboarded_at    timestamptz NULL,                          -- set when the writer finishes first-run onboarding
  last_active_at  timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.writers IS
  'FredRock Writers Room: writer profiles. role is authoritative from invite_codes (see writers_enforce_role trigger).';

-- Question sets ("Rounds"): published sets are visible to writers.
CREATE TABLE IF NOT EXISTS public.question_sets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL UNIQUE,                 -- natural key for idempotent seeding
  description text        NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  is_published bool       NOT NULL DEFAULT false,
  created_by  uuid        NULL,                            -- writers.id of the admin who made it
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.question_sets IS
  'FredRock Writers Room: question rounds. Writers see only is_published = true.';

-- Questions inside a set.
CREATE TABLE IF NOT EXISTS public.questions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid        NOT NULL REFERENCES public.question_sets(id) ON DELETE CASCADE,
  prompt_text text        NOT NULL,
  help_text   text        NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, sort_order)                               -- natural key for idempotent seeding
);
COMMENT ON TABLE public.questions IS
  'FredRock Writers Room: individual questions belonging to a question set.';

-- Answers: multiple per (writer, question). Writer-owned, optionally shared.
CREATE TABLE IF NOT EXISTS public.answers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id   uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  question_id uuid        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  body_text   text        NOT NULL DEFAULT '',
  word_count  int         NOT NULL DEFAULT 0,
  is_shared   bool        NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.answers IS
  'FredRock Writers Room: writer answers. Multiple answers per (writer, question) allowed — writers can add follow-up answers.';

-- Recordings: voice answers stored in the fredrock-audio bucket.
CREATE TABLE IF NOT EXISTS public.recordings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id        uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  question_id      uuid        NULL REFERENCES public.questions(id) ON DELETE SET NULL,
  answer_id        uuid        NULL REFERENCES public.answers(id) ON DELETE SET NULL,
  storage_path     text        NOT NULL,   -- e.g. {writer_id}/{recording_id}.webm
  duration_sec     int         NULL,
  transcript_text  text        NOT NULL DEFAULT '',
  transcript_source text       NOT NULL DEFAULT 'web-speech',  -- 'web-speech' | 'manual' | 'whisper'
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.recordings IS
  'FredRock Writers Room: voice recordings. Audio lives in the private fredrock-audio storage bucket; shared visibility inherits from the linked answer is_shared flag.';

-- Scripts: Snowfall-style series bible / episode drafts (content_json).
CREATE TABLE IF NOT EXISTS public.scripts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id   uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  logline     text        NULL,
  format      text        NOT NULL DEFAULT 'fredrock_drama',
  content_json jsonb      NOT NULL DEFAULT '{}',
  word_count  int         NOT NULL DEFAULT 0,
  is_shared   bool        NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scripts IS
  'FredRock Writers Room: script drafts (series bible + episode acts as JSON).';

-- Resources: admin-curated guides (Snowfall format doc, recording tips...).
CREATE TABLE IF NOT EXISTS public.resources (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL UNIQUE,                 -- natural key for idempotent seeding
  body_md    text        NULL,
  kind       text        NOT NULL DEFAULT 'guide',        -- 'guide' | 'link' | ...
  url        text        NULL,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.resources IS
  'FredRock Writers Room: admin-curated guides and reference links.';

-- Activity log: append-only-ish event trail (signup, answer_save, ...).
CREATE TABLE IF NOT EXISTS public.activity_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id  uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  action     text        NOT NULL,   -- signup | login | answer_save | recording_save | transcript_save | script_save | nudge_sent
  detail     jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.activity_log IS
  'FredRock Writers Room: event trail. Writers insert/select their own rows; admin sees all.';

-- Notifications: in-app nudges from the admin (email sending is NOT wired).
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id  uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  kind       text        NOT NULL DEFAULT 'nudge',
  title      text        NOT NULL,
  body       text        NOT NULL,
  is_read    bool        NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.notifications IS
  'FredRock Writers Room: in-app notifications. Created by admin; the writer marks them read.';

-- App settings: key/value store (nudge_after_days, ai_endpoint, ai_model).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_settings IS
  'FredRock Writers Room: app settings. Keys: nudge_after_days (3), ai_endpoint (null), ai_model (null).';

-- 2. Indexes on foreign keys --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_questions_set_id      ON public.questions (set_id);
CREATE INDEX IF NOT EXISTS idx_answers_writer_id     ON public.answers (writer_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id   ON public.answers (question_id);
CREATE INDEX IF NOT EXISTS idx_recordings_writer_id  ON public.recordings (writer_id);
CREATE INDEX IF NOT EXISTS idx_recordings_answer_id  ON public.recordings (answer_id);
CREATE INDEX IF NOT EXISTS idx_scripts_writer_id     ON public.scripts (writer_id);
CREATE INDEX IF NOT EXISTS idx_activity_writer_id    ON public.activity_log (writer_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at   ON public.activity_log (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_writer  ON public.notifications (writer_id);

-- 3. Helper functions ---------------------------------------------------------
-- is_admin(): true when the current user has role='admin' in writers.
-- SECURITY DEFINER so it can be used inside RLS policies without recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.writers
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;
COMMENT ON FUNCTION public.is_admin() IS
  'FredRock Writers Room: true if the current authenticated user is an active admin. Used by RLS policies.';

-- claim_invite(p_code): the ONLY client path to consume an invite code.
-- Verifies the code exists and is unclaimed (or already claimed by THIS user,
-- so signup-flow retries are safe), stamps claimed_by / claimed_at, and
-- returns the code role ('writer' | 'admin'), or NULL when invalid.
CREATE OR REPLACE FUNCTION public.claim_invite(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;  -- must be signed in (signUp happens before the claim)
  END IF;

  UPDATE public.invite_codes
     SET claimed_by = auth.uid(),
         claimed_at = now()
   WHERE code = p_code
     AND (claimed_by IS NULL OR claimed_by = auth.uid())
  RETURNING role INTO v_role;

  RETURN v_role;  -- NULL when the code does not exist or belongs to someone else
END;
$$;
COMMENT ON FUNCTION public.claim_invite(text) IS
  'FredRock Writers Room: claim an invite code. Returns the code role or NULL if invalid/already taken.';

-- writers_enforce_role(): BEFORE INSERT trigger — the writers.role value is
-- authoritative from the claimed invite code, so a client can never
-- self-promote to admin by inserting role=''admin''.
CREATE OR REPLACE FUNCTION public.writers_enforce_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_role text;
BEGIN
  SELECT role INTO v_invite_role
    FROM public.invite_codes
   WHERE claimed_by = NEW.id
   LIMIT 1;

  NEW.role := COALESCE(v_invite_role, 'writer');
  RETURN NEW;
END;
$$;

-- writers_protect_columns(): BEFORE UPDATE trigger — non-admins may only
-- change their own display_name, email, share_by_default, last_active_at.
-- role / is_active / invite_code / id are admin-managed.
CREATE OR REPLACE FUNCTION public.writers_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role        IS DISTINCT FROM OLD.role        THEN RAISE EXCEPTION 'writers.role is admin-managed'; END IF;
  IF NEW.is_active   IS DISTINCT FROM OLD.is_active   THEN RAISE EXCEPTION 'writers.is_active is admin-managed'; END IF;
  IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN RAISE EXCEPTION 'writers.invite_code is admin-managed'; END IF;
  IF NEW.id          IS DISTINCT FROM OLD.id          THEN RAISE EXCEPTION 'writers.id is immutable'; END IF;
  RETURN NEW;
END;
$$;

-- set_updated_at(): keeps updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. Triggers -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_writers_enforce_role    ON public.writers;
CREATE TRIGGER trg_writers_enforce_role
  BEFORE INSERT ON public.writers
  FOR EACH ROW EXECUTE FUNCTION public.writers_enforce_role();

DROP TRIGGER IF EXISTS trg_writers_protect_columns ON public.writers;
CREATE TRIGGER trg_writers_protect_columns
  BEFORE UPDATE ON public.writers
  FOR EACH ROW EXECUTE FUNCTION public.writers_protect_columns();

DROP TRIGGER IF EXISTS trg_answers_updated_at      ON public.answers;
CREATE TRIGGER trg_answers_updated_at
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_scripts_updated_at      ON public.scripts;
CREATE TRIGGER trg_scripts_updated_at
  BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Grants -------------------------------------------------------------------
-- Authenticated users get table privileges; RLS policies below are the real
-- enforcement. (anon gets nothing.)
GRANT ALL ON TABLE public.invite_codes   TO authenticated;
GRANT ALL ON TABLE public.writers        TO authenticated;
GRANT ALL ON TABLE public.question_sets  TO authenticated;
GRANT ALL ON TABLE public.questions      TO authenticated;
GRANT ALL ON TABLE public.answers        TO authenticated;
GRANT ALL ON TABLE public.recordings     TO authenticated;
GRANT ALL ON TABLE public.scripts        TO authenticated;
GRANT ALL ON TABLE public.resources      TO authenticated;
GRANT ALL ON TABLE public.activity_log   TO authenticated;
GRANT ALL ON TABLE public.notifications  TO authenticated;
GRANT ALL ON TABLE public.app_settings   TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.claim_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invite(text) TO authenticated;

-- 6. Row Level Security -------------------------------------------------------
ALTER TABLE public.invite_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings  ENABLE ROW LEVEL SECURITY;

-- ---- invite_codes: NO direct client access; claim via claim_invite() only; admin full.
DROP POLICY IF EXISTS "invite_codes admin all" ON public.invite_codes;
CREATE POLICY "invite_codes admin all"
  ON public.invite_codes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- writers: select own row; admin selects all; insert own row (signup flow);
-- ---- update own row (sensitive columns guarded by writers_protect_columns trigger).
DROP POLICY IF EXISTS "writers select own" ON public.writers;
CREATE POLICY "writers select own"
  ON public.writers FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "writers select admin" ON public.writers;
CREATE POLICY "writers select admin"
  ON public.writers FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "writers insert own" ON public.writers;
CREATE POLICY "writers insert own"
  ON public.writers FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
-- NOTE: writers_enforce_role trigger overwrites NEW.role from the claimed
-- invite code, so this INSERT policy cannot be abused for self-promotion.

DROP POLICY IF EXISTS "writers update own" ON public.writers;
CREATE POLICY "writers update own"
  ON public.writers FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "writers admin all" ON public.writers;
CREATE POLICY "writers admin all"
  ON public.writers FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- question_sets: published readable by authenticated; admin full CRUD.
DROP POLICY IF EXISTS "question_sets select published" ON public.question_sets;
CREATE POLICY "question_sets select published"
  ON public.question_sets FOR SELECT TO authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "question_sets admin all" ON public.question_sets;
CREATE POLICY "question_sets admin all"
  ON public.question_sets FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- questions: readable when their set is published; admin full CRUD.
DROP POLICY IF EXISTS "questions select of published sets" ON public.questions;
CREATE POLICY "questions select of published sets"
  ON public.questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.question_sets s
      WHERE s.id = questions.set_id AND s.is_published = true
    )
  );

DROP POLICY IF EXISTS "questions admin all" ON public.questions;
CREATE POLICY "questions admin all"
  ON public.questions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- resources: readable by authenticated; admin full CRUD.
DROP POLICY IF EXISTS "resources select authenticated" ON public.resources;
CREATE POLICY "resources select authenticated"
  ON public.resources FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "resources admin all" ON public.resources;
CREATE POLICY "resources admin all"
  ON public.resources FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- answers: owner full; others select where is_shared; admin full.
DROP POLICY IF EXISTS "answers owner all" ON public.answers;
CREATE POLICY "answers owner all"
  ON public.answers FOR ALL TO authenticated
  USING (writer_id = auth.uid())
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "answers select shared" ON public.answers;
CREATE POLICY "answers select shared"
  ON public.answers FOR SELECT TO authenticated
  USING (is_shared = true);

DROP POLICY IF EXISTS "answers admin all" ON public.answers;
CREATE POLICY "answers admin all"
  ON public.answers FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- scripts: owner full; others select where is_shared; admin full.
DROP POLICY IF EXISTS "scripts owner all" ON public.scripts;
CREATE POLICY "scripts owner all"
  ON public.scripts FOR ALL TO authenticated
  USING (writer_id = auth.uid())
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "scripts select shared" ON public.scripts;
CREATE POLICY "scripts select shared"
  ON public.scripts FOR SELECT TO authenticated
  USING (is_shared = true);

DROP POLICY IF EXISTS "scripts admin all" ON public.scripts;
CREATE POLICY "scripts admin all"
  ON public.scripts FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- recordings: owner full; others select when linked to a SHARED answer;
-- ---- admin full. (recordings has no is_shared column — visibility inherits
-- ---- from the linked answer, per §3's "shared-visible to others".)
DROP POLICY IF EXISTS "recordings owner all" ON public.recordings;
CREATE POLICY "recordings owner all"
  ON public.recordings FOR ALL TO authenticated
  USING (writer_id = auth.uid())
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "recordings select via shared answer" ON public.recordings;
CREATE POLICY "recordings select via shared answer"
  ON public.recordings FOR SELECT TO authenticated
  USING (
    answer_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.answers a
      WHERE a.id = recordings.answer_id AND a.is_shared = true
    )
  );

DROP POLICY IF EXISTS "recordings admin all" ON public.recordings;
CREATE POLICY "recordings admin all"
  ON public.recordings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- activity_log: insert own; select own; admin all.
DROP POLICY IF EXISTS "activity_log insert own" ON public.activity_log;
CREATE POLICY "activity_log insert own"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "activity_log select own" ON public.activity_log;
CREATE POLICY "activity_log select own"
  ON public.activity_log FOR SELECT TO authenticated
  USING (writer_id = auth.uid());

DROP POLICY IF EXISTS "activity_log admin all" ON public.activity_log;
CREATE POLICY "activity_log admin all"
  ON public.activity_log FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- notifications: owner select/update own; admin all (incl. insert).
DROP POLICY IF EXISTS "notifications select own" ON public.notifications;
CREATE POLICY "notifications select own"
  ON public.notifications FOR SELECT TO authenticated
  USING (writer_id = auth.uid());

DROP POLICY IF EXISTS "notifications update own" ON public.notifications;
CREATE POLICY "notifications update own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (writer_id = auth.uid())
  WITH CHECK (writer_id = auth.uid());

DROP POLICY IF EXISTS "notifications admin all" ON public.notifications;
CREATE POLICY "notifications admin all"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- app_settings: authenticated select; admin full (incl. update).
DROP POLICY IF EXISTS "app_settings select authenticated" ON public.app_settings;
CREATE POLICY "app_settings select authenticated"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_settings admin all" ON public.app_settings;
CREATE POLICY "app_settings admin all"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. Storage: private bucket fredrock-audio -----------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('fredrock-audio', 'fredrock-audio', false)
ON CONFLICT (id) DO NOTHING;
-- Path convention: {writer_id}/{recording_id}.webm — owner reads/writes own
-- prefix; admin reads all. (Postgres has no COMMENT ON for storage buckets;
-- this comment is the documentation.)

DROP POLICY IF EXISTS "fredrock-audio owner insert" ON storage.objects;
CREATE POLICY "fredrock-audio owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fredrock-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "fredrock-audio owner or admin select" ON storage.objects;
CREATE POLICY "fredrock-audio owner or admin select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fredrock-audio'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "fredrock-audio owner update" ON storage.objects;
CREATE POLICY "fredrock-audio owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fredrock-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'fredrock-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "fredrock-audio owner delete" ON storage.objects;
CREATE POLICY "fredrock-audio owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fredrock-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ============================================================================
-- 2026-09-30 revisions: answer attachments + avatar / onboarding columns
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.answer_attachments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id   uuid        NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE,
  writer_id   uuid        NOT NULL REFERENCES public.writers(id) ON DELETE CASCADE,
  storage_path text       NOT NULL,
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

-- fredrock-avatars bucket (public — profile photos shown on the dashboard)
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

-- fredrock-attachments bucket (private — docs/images attached to answers)
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

-- ============================================================================
-- Done. Next: run sql/seed.sql, then create the first ADMIN invite code
-- (see SUPABASE-SETUP.md).
-- ============================================================================
