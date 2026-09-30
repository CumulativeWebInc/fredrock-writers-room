-- ============================================================================
-- FredRock Writers Room — seed data (run AFTER sql/schema.sql)
-- Goal: goal_73722a03600a | CWI identity | Branding: "FredRock Writers Room"
--
-- HOW TO USE: Supabase Dashboard -> SQL Editor -> New query, paste, Run.
-- Idempotent: every INSERT is guarded by ON CONFLICT DO NOTHING on a stable
-- natural key (app_settings.key, question_sets.title,
-- questions.(set_id, sort_order), resources.title), so re-running is safe.
-- ============================================================================

-- 1. App settings ---------------------------------------------------------------
INSERT INTO public.app_settings (key, value)
VALUES ('nudge_after_days', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Question set: "Round 1: Origins" -------------------------------------------
INSERT INTO public.question_sets (title, description, sort_order, is_published)
VALUES (
  'Round 1: Origins',
  'Where we come from — the ground every FredRock story stands on.',
  1,
  true
)
ON CONFLICT (title) DO NOTHING;

-- 3. Questions (Round 1) — exact prompt_text / help_text per spec ----------------
INSERT INTO public.questions (set_id, prompt_text, help_text, sort_order)
SELECT s.id,
       q.prompt_text,
       q.help_text,
       q.sort_order
FROM public.question_sets s
CROSS JOIN (VALUES
  (1,
   'What brought you to Frederick, Maryland?',
   'Tell the story of how you got here — when it was, why you came, and what it felt like arriving.'),
  (2,
   'How did you grow up?',
   'Describe your household, the economy around you, the issues your family faced, and the lifestyle that shaped you.'),
  (3,
   'How did you meet Black Lansky?',
   'Tell us about the first time you met — or a moment with him that stood out to you.'),
  (4,
   'What were your dreams growing up?',
   'The job, the career, the life you imagined for yourself.'),
  (5,
   'What did you love to wear in the late ''80s and early ''90s?',
   'Paint the picture — the brands, the fits, the details that made the era.'),
  (6,
   'What were your favorite places to go?',
   'Describe them — the atmosphere, what you saw there, what made them special.')
) AS q(sort_order, prompt_text, help_text)
WHERE s.title = 'Round 1: Origins'
ON CONFLICT (set_id, sort_order) DO NOTHING;

-- 4. Resources -------------------------------------------------------------------
INSERT INTO public.resources (title, body_md, kind, sort_order)
VALUES (
  'The FredRock Format',
  $md$# The FredRock Format

*A Snowfall-style series engine for the FredRock writers room.*
*(After* Snowfall *— FX, 2017–2023; creators John Singleton, Eric Amadio, Dave Andron:
the early-1980s crack epidemic in Los Angeles, told through colliding points of view.)*

## The engine

Three or four separate POV threads — "separate spiders, one web" — each with
valid-but-narrow ambitions, colliding over one trade, one street, one town.
No thread is the "main" one. The collision is the show.

## POV threads

- **Thread A — Street / Heart.** The ground-level operator. Ambition is personal
  and immediate: respect, money, a way off the block.
- **Thread B — Power / Institution.** The badge, the office, the system. Ambition is
  order, career, control — but the institution has its own appetite.
- **Thread C — Supply / Family.** Where the product comes from and who pays the human
  price at home. Ambition is provision; the cost is the family itself.

## Era-texture checklist

- **Music** — what's on the radio, in the car, at the cookout.
- **Fashion** — the brands, the fits, the hair.
- **Cars** — what rolls down the street and what it signals.
- **News events** — the headlines your characters actually argue about.
- **Slang** — how people really talked. Never costume dialogue.

## Episode structure — 5 acts plus cold open

- **Cold open / teaser** — Atmospheric. Raises a question, doesn't answer it.
  May open on a different POV than usual. *(Purpose: hook the room.)*
- **Act 1** — Threads established. Each thread's want is visible on screen.
  *(Purpose: plant every player on the board.)*
- **Act 2** — Complications. Threads touch for the first time; pressure rises on
  every front. *(Purpose: tighten the web.)*
- **Act 3** — Midpoint turn. The cost becomes visible — someone pays, or almost
  does. *(Purpose: make the stakes real.)*
- **Act 4** — Collisions. Threads crash into each other; nobody's plan survives
  contact. *(Purpose: force the choice.)*
- **Act 5 / Tag** — Fallout. The dust settles unevenly. End on a question for the
  next episode. *(Purpose: launch the next thread.)*

## Scene fields

Heading (INT./EXT. LOCATION - TIME) · Action · Character · Dialogue · Parenthetical.

## Character sheet

Name · Thread · **Want** (stated, out loud) · **Need** (hidden, even from them) ·
Flaw · First image (how we meet them) · Cost (what they'll pay by season's end).

## The moral rule

No clean wins. Every victory costs somebody something real.

## The theme question

Who gets out? Who gets out better? What did it cost?
$md$,
  'guide',
  1
)
ON CONFLICT (title) DO NOTHING;

INSERT INTO public.resources (title, body_md, kind, sort_order)
VALUES (
  'Recording your answers',
  $md$# Recording your answers

Your voice is the instrument — here's how to make it sound like you mean it.

## Mic tips

- **Get close, not loud.** 6–8 inches from your phone or mic. Speak across it,
  not straight into it, to avoid pops.
- **Kill the room noise.** Fans, TVs, traffic — record in the quietest room you
  have. A closet full of clothes is a free vocal booth.
- **One take is fine.** This is a writers room, not a studio session. Stumbles
  and pauses are part of the texture — keep going.
- **Watch the timer.** Short, focused takes (2–5 minutes per question) transcribe
  cleaner than one long ramble.

## Transcripts

- The room transcribes as you speak (Web Speech API — best in Chrome or Edge).
- **Always read it back.** The transcript is a draft, not a verdict — fix names,
  places, and slang the machine mangled.
- Firefox and some mobile browsers don't support live transcription; type or
  paste your transcript into the edit box instead. The audio still saves.

## After you save

- Your recording stays private until you link it to a shared answer.
- You can re-record anytime — the newest take replaces the old one.
$md$,
  'guide',
  2
)
ON CONFLICT (title) DO NOTHING;

-- ============================================================================
-- Done. Verify with:
--   SELECT key, value FROM public.app_settings;
--   SELECT title, is_published FROM public.question_sets;
--   SELECT sort_order, prompt_text FROM public.questions ORDER BY sort_order;
--   SELECT title, kind FROM public.resources ORDER BY sort_order;
-- ============================================================================
