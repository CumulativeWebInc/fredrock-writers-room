-- ============================================================================
-- FredRock Writers Room — relational ("How do you know X?") questions
-- 2026-09-30
--
-- Rule: EVERY member who joins the room gets one personal question —
-- "How do you know {their name}?" — which every OTHER member answers.
-- So each writer is asked about Lansky, and Lansky is asked about each writer.
--
-- Implemented as a database trigger on writers INSERT, so it fires for all
-- future signups no matter which client path creates the writers row.
-- A backfill below covers writers who joined before this migration ran.
--
-- Also included: claim_invite() now promotes an EXISTING writers row.
-- (Lansky signed up directly without a code, so his row exists with
-- role='writer'; claiming the admin code afterwards must flip him to admin.)
--
-- Run once in the Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================================

-- 1. New columns on questions ---------------------------------------------------
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard';
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS subject_writer_id uuid NULL
    REFERENCES public.writers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_questions_subject_writer
  ON public.questions (subject_writer_id);

COMMENT ON COLUMN public.questions.kind IS
  'standard = seeded round question; relational = auto-created "How do you know X?" about one member.';
COMMENT ON COLUMN public.questions.subject_writer_id IS
  'For kind=''relational'': the writers.id this question is ABOUT. Everyone except this writer answers it.';

-- 2. The "Getting to Know Each Other" round --------------------------------------
INSERT INTO public.question_sets (title, description, sort_order, is_published)
VALUES (
  'Getting to Know Each Other',
  'Every member of the room answers one question about every other member: how do you know them? Tell it in your own words.',
  100,
  true
)
ON CONFLICT (title) DO NOTHING;

-- 3. Public-safe writer directory (id + name + photo only) -----------------------
-- Lets writers see WHO a relational question is about (name + avatar) without
-- exposing emails or other private profile fields.
CREATE OR REPLACE VIEW public.writer_public AS
SELECT id, display_name, avatar_url
FROM public.writers
WHERE is_active = true;
GRANT SELECT ON public.writer_public TO authenticated;

-- 4. Trigger: create the relational question on every new writer -----------------
CREATE OR REPLACE FUNCTION public.writers_create_relational_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set_id uuid;
  v_next   int;
BEGIN
  SELECT id INTO v_set_id
  FROM public.question_sets
  WHERE title = 'Getting to Know Each Other'
  LIMIT 1;
  IF v_set_id IS NULL THEN
    RETURN NEW;  -- round missing; nothing to attach to
  END IF;
  -- One relational question per writer, ever (re-entrant safe).
  IF EXISTS (
    SELECT 1 FROM public.questions
    WHERE kind = 'relational' AND subject_writer_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
  FROM public.questions
  WHERE set_id = v_set_id;
  INSERT INTO public.questions
    (set_id, prompt_text, help_text, sort_order, kind, subject_writer_id)
  VALUES (
    v_set_id,
    'How do you know ' || NEW.display_name || '?',
    'Tell it in your own words — when you first met, what you remember most, and what they mean to you.',
    v_next,
    'relational',
    NEW.id
  );
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.writers_create_relational_question() IS
  'FredRock Writers Room: AFTER INSERT trigger helper — creates the "How do you know X?" question for each new writer.';

DROP TRIGGER IF EXISTS trg_writers_relational_question ON public.writers;
CREATE TRIGGER trg_writers_relational_question
  AFTER INSERT ON public.writers
  FOR EACH ROW EXECUTE FUNCTION public.writers_create_relational_question();

-- 5. Keep the prompt fresh if a writer changes their display name -----------------
CREATE OR REPLACE FUNCTION public.writers_refresh_relational_prompt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    UPDATE public.questions
       SET prompt_text = 'How do you know ' || NEW.display_name || '?'
     WHERE kind = 'relational'
       AND subject_writer_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_writers_refresh_relational_prompt ON public.writers;
CREATE TRIGGER trg_writers_refresh_relational_prompt
  AFTER UPDATE OF display_name ON public.writers
  FOR EACH ROW EXECUTE FUNCTION public.writers_refresh_relational_prompt();

-- 6. Backfill: writers who joined BEFORE this migration ---------------------------
-- Creates the relational question for any writer missing one (idempotent).
DO $$
DECLARE
  v_set_id uuid;
  r        RECORD;
  v_next   int;
BEGIN
  SELECT id INTO v_set_id
  FROM public.question_sets
  WHERE title = 'Getting to Know Each Other'
  LIMIT 1;
  IF v_set_id IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT w.id, w.display_name
    FROM public.writers w
    WHERE NOT EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.kind = 'relational'
        AND q.subject_writer_id = w.id
    )
    ORDER BY w.created_at
  LOOP
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
    FROM public.questions
    WHERE set_id = v_set_id;
    INSERT INTO public.questions
      (set_id, prompt_text, help_text, sort_order, kind, subject_writer_id)
    VALUES (
      v_set_id,
      'How do you know ' || r.display_name || '?',
      'Tell it in your own words — when you first met, what you remember most, and what they mean to you.',
      v_next,
      'relational',
      r.id
    );
  END LOOP;
END;
$$;

-- 7. claim_invite(): also promote an EXISTING writers row --------------------------
-- Claiming a code stamps claimed_by/claimed_at (as before) AND, when the
-- claimer already has a writers row (e.g. direct signup before claiming),
-- updates that row's role + invite_code from the verified code.
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

  IF v_role IS NOT NULL THEN
    -- Transaction-local flag: the code was just verified above, so the
    -- writers_protect_columns trigger lets this one role/invite_code change
    -- through. Vanishes when the transaction ends.
    PERFORM set_config('fredrock.claim_flow', 'on', true);
    UPDATE public.writers
       SET role        = v_role,
           invite_code = p_code
     WHERE id = auth.uid()
       AND (role IS DISTINCT FROM v_role OR invite_code IS DISTINCT FROM p_code);
  END IF;

  RETURN v_role;  -- NULL when the code does not exist or belongs to someone else
END;
$$;
COMMENT ON FUNCTION public.claim_invite(text) IS
  'FredRock Writers Room: claim an invite code. Returns the code role or NULL if invalid/already taken. Also promotes an existing writers row to the code role.';

-- 8. writers_protect_columns(): let the verified claim flow through -----------------
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
  -- claim_invite() just verified the code in this transaction; allow its
  -- role/invite_code update (it only writes what the claimed code says).
  IF current_setting('fredrock.claim_flow', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.role        IS DISTINCT FROM OLD.role        THEN RAISE EXCEPTION 'writers.role is admin-managed'; END IF;
  IF NEW.is_active   IS DISTINCT FROM OLD.is_active   THEN RAISE EXCEPTION 'writers.is_active is admin-managed'; END IF;
  IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN RAISE EXCEPTION 'writers.invite_code is admin-managed'; END IF;
  IF NEW.id          IS DISTINCT FROM OLD.id          THEN RAISE EXCEPTION 'writers.id is immutable'; END IF;
  RETURN NEW;
END;
$$;

-- 9. Verify -------------------------------------------------------------------------
SELECT 'question_sets' AS check, count(*) AS n
FROM public.question_sets WHERE title = 'Getting to Know Each Other'
UNION ALL
SELECT 'relational_questions', count(*)
FROM public.questions WHERE kind = 'relational'
UNION ALL
SELECT 'writers_missing_relational', count(*)
FROM public.writers w
WHERE NOT EXISTS (
  SELECT 1 FROM public.questions q
  WHERE q.kind = 'relational' AND q.subject_writer_id = w.id
);
