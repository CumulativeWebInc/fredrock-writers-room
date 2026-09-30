# FredRock Writers Room — Revisions Receipt (2026-09-30)

Black Lansky's revisions pass on the FredRock writers room app. This pass filled the
simplicity/identity gaps from his 2026-09-30 review. It did **not** rebuild anything —
every item below is either already-built (with a file reference), newly added in this
pass (with a file reference), or blocked on the owner.

## Every request from Black's list → where it stands

| # | His request | Status | Where |
|---|---|---|---|
| 1 | Read-aloud: questions read to writers; writers listen to their own answers and judge what to change | **Added** | `js/tts.js` (new) — browser-native speech, $0, no network. 🔊 button on every question head and every answer block; button becomes ⏹ while reading. Wired in `writer.js` (`questionCard` head buttons, `answerEditor` meta row). |
| 2 | Writers' understanding must be very simple and clear — non-technical writers | **Added** | Help tab in `writer.html` + `renderHelp()`/`helpCard()` in `js/writer.js` — 9 plain-words cards (answering, adding more, voice recording, attaching files, listening, checking answers, moving between questions, sharing, install-on-phone), written at 5th-grade level. |
| 3 | First-run onboarding so simple a non-computer person can't get lost | **Added** | `js/onboard.js` (new) + `maybeOnboard()` in `js/writer.js` — 5-step welcome: welcome → answer questions (with the "✓ Voice answer saved and uploaded" explainer) → install-on-phone steps (device-detected: iPhone Safari "Share → Add to Home Screen" / Android Chrome "⋮ → Add to Home screen" / computer) → optional photo → start writing. Shows once (tracked in `writers.onboarded_at` + localStorage flag). |
| 4 | Profile photos — writer identity on the dashboard | **Added** | `sql/schema.sql` + `sql/migration-revisions-20260930.sql`: `writers.avatar_url`, `writers.onboarded_at`, public `fredrock-avatars` bucket (`{writer_id}/avatar.ext`, owner upsert). `writer.js`: `initAvatar()`/`uploadAvatar()` — tap header photo to change; initials fallback. `admin.js` dashboard: photo + name + individual progress bar per writer; group progress bar for the whole room (`#dash-group-wrap`). CSS in `style.css`. |
| 5 | "Check my answer" — coach verifies answer completeness, asks follow-up questions to draw out perspective/background/era | **Added** | `js/coach.js`: `Coach.checkAnswer(question, answerText)` — word-count bands, 6-facet coverage check (WHEN / WHERE / WHO / WHY / FEELING / SENSE DETAIL) with ✓/MISSING, 3 follow-up questions (per-question variants keyed to the 6 Round-1 origin prompts, filtered against already-written content), rule-of-thumb closer. 5th coach tool button in `writer.html` + question picker; per-question "🔍 Check my answer" button on every question card with inline output (`runCardCheck`). Connect-AI system prompt strengthened for completeness checking too. |
| 6 | Upload docs / images / text files alongside answers | **Added** | `sql/schema.sql` + migration: `answer_attachments` table (RLS: owner all, admin all) + private `fredrock-attachments` bucket (`{writer_id}/{answer_id}/{file_name}`, 10 MB cap, signed-URL access). `writer.js`: `attachFileToAnswer()`/`loadAttachments()` — "📎 Attach a file" under each answer; auto-saves a blank answer first so the file has an answer to hang on. |
| 7 | Clear confirmation when a voice recording saves | **Added** | Per-question recorder now shows a status line: "uploading…" then **"✓ Voice answer saved and uploaded"** (was silent / vague before). |
| 8 | Autosave duplicates bug (found during this pass) | **Fixed** | `writer.js` `answerEditor`: autosave on a brand-new answer used to INSERT a new row on every keystroke (the local row reference was never updated — `setAnswer` existed but was never called). Now `saveAnswer` returns the saved row and the editor updates its binding, so the second keystroke updates instead of duplicating. |
| 9 | Email nudges | **Not wired — Black's call, unchanged** | Manual workflow documented in README + SUPABASE-SETUP (admin copies the message text; sending happens outside the app). |
| 10 | iPhone live transcription | **Not promised — honest fallback kept** | Web Speech live transcription is Chrome/Edge-only; other browsers get a manual-transcript box. Read-aloud (TTS) is separate and works wherever the OS has speech voices. Both are documented honestly in README + SUPABASE-SETUP. |

### Already-built before this pass (not touched, still standing)
- 10-person invite-only (Black admin + 9 writer seats), special invite link
- 6 Round-1 origin questions seeded (`sql/seed.sql`) — not reworded
- Metrics dashboard: bar graphs + metric bars + per-writer stats
- Scalable question sets + admin question input
- Voice record + transcribe → FredRock DB
- Snowfall-style script template (`js/snowfall-template.js` + "The FredRock Format" guide)
- Writing coach (local tools), multi-answer per question, share toggles, room tab

### Owner-blocked (not this pass's job)
- Supabase project creation, hosting, admin-code claim, writer invites — **3 owner steps
  block launch**: (1) create the Supabase project; (2) run the SQL files in order
  (`schema.sql` → `seed.sql`, plus `migration-revisions-20260930.sql` only if the
  database was already set up before this update); (3) host the static files and
  claim the admin code, then invite the 9 writers.

## QA re-run (2026-09-30, post-revisions)

- `node --check` — all 10 JS files pass.
- Contract check: every `$(id)` / `getElementById` in `writer.js` (39) and `admin.js`
  (36) resolves to an element in `writer.html` / `admin.html`. Script load order
  verified: `coach.js` + `tts.js` + `onboard.js` load before `writer.js`.
- Table contract: all 12 tables referenced in frontend JS exist in `schema.sql`
  (`invite_codes, writers, question_sets, questions, answers, recordings, scripts,
  resources, activity_log, notifications, app_settings, answer_attachments`);
  storage references (`fredrock-audio`, `fredrock-avatars`, `fredrock-attachments`)
  all have bucket-creation inserts + RLS policies (incl. a DELETE policy added this
  pass so attachment "remove" actually works).
- `Coach.checkAnswer` smoke-tested in Node: coverage facets, follow-ups, and the
  rule-of-thumb closer all render.
- Secrets/TODO scan: clean (two false-positive regex hits on "coach-ask-ai" — no
  keys, no TODOs, no FIXMEs).
- **Blocked without a live Supabase project** (owner step): end-to-end signup,
  RLS policy enforcement, bucket uploads, and the onboarding once-flag cannot be
  exercised until the owner creates the project. Flagged, not faked.

## Files changed this pass
- NEW: `sql/migration-revisions-20260930.sql`, `js/tts.js`, `js/onboard.js`,
  `REVISIONS-RECEIPT.md` (this file)
- EDITED: `sql/schema.sql` (avatar columns, `answer_attachments`, both buckets),
  `js/coach.js` (`checkAnswer`), `js/writer.js` (Help tab, onboarding/avatar/check/
  attach/recorder-confirm/autosave fix), `js/admin.js` (group + per-writer progress,
  avatars), `writer.html` (scripts, Help panel, 5th coach tool + question picker),
  `admin.html` (group progress container, Progress column), `css/style.css`
  (avatars, progress bars, onboarding, help cards, attachments),
  `README.md` + `SUPABASE-SETUP.md` (migration docs, honest notes).

## Memory note
The agent-memory read at task start failed — the registry was empty
("unknown agent urn:cwi:agent:MUSE_CWI"). Task-end claims were written per the
standing law; the read-side gap is recorded here for the parent to see.
