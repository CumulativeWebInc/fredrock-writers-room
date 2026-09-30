# FredRock Writers Room — Supabase Setup Guide

Plain-language setup for the room's admin. No coding needed — just copy, paste,
and click. Takes about 15 minutes. Everything here is on Supabase's **free tier**
($0), which comfortably fits a 10-person room.

---

## Step 1 — Create the free Supabase project

1. Go to **https://supabase.com** and sign in (or create a free account).
2. Click **New project**.
3. Pick your organization (or create one — it's free).
4. Name: `fredrock-writers-room`
5. Database password: click **Generate a password**, then **save that password
   somewhere safe** (a password manager or a note only you keep). You rarely
   need it, but losing it is a headache.
6. Region: choose the one closest to your writers (e.g. **US East**).
7. Click **Create new project** and wait ~2 minutes while it spins up.

> The free tier includes 500MB of database and 1GB of file storage — more than
> enough for 10 writers' answers, scripts, and voice notes.

## Step 2 — Run the database schema

1. In the left sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file `sql/schema.sql` (in the `fredrock-app` folder), select **all**
   of it, copy, and paste it into the query box.
4. Press **Run** (or Ctrl/Cmd + Enter).
5. You should see **"Success. No rows returned"**. That means all 12 tables
   (11 app tables + `answer_attachments`), the invite-claim function, the security
   rules, and the three storage buckets (`fredrock-audio`, `fredrock-avatars`,
   `fredrock-attachments`) were created.

> Safe to re-run: the script cleans up after itself, so running it twice
> changes nothing.

> **Already ran the old schema?** If you set up the database before this
> update, run `sql/migration-revisions-20260930.sql` once in the SQL Editor to
> add profile photos, answer attachments, and the two new storage buckets.
> (This also folds in the old `migration-multi-answer.sql`, which new setups
> never needed — the current `schema.sql` already includes everything.)
>
> **Relational questions (2026-09-30):** run
> `sql/migration-relational-questions-20260930.sql` once in the SQL Editor.
> It adds the auto-created "How do you know {name}?" question per member
> (trigger on every new writer + backfill), the "Getting to Know Each Other"
> round, the `writer_public` directory view, and makes `claim_invite()` also
> promote an already-existing writers row (so a direct signup who then claims
> a code gets the code's role).

## Step 3 — Run the seed data

1. Still in SQL Editor, click **New query** again.
2. Paste the entire contents of `sql/seed.sql` and press **Run**.
3. "Success" again. This loads:
   - the app setting `nudge_after_days = 3`,
   - the published question set **"Round 1: Origins"** with its 6 questions,
   - the two guides: **"The FredRock Format"** (the Snowfall-style beat sheet)
     and **"Recording your answers"**.

Quick check it's all there — paste this into a new query and Run:

```sql
SELECT 'question_sets' AS what, count(*) AS n FROM public.question_sets
UNION ALL SELECT 'questions', count(*) FROM public.questions
UNION ALL SELECT 'resources', count(*) FROM public.resources
UNION ALL SELECT 'app_settings', count(*) FROM public.app_settings;
```

You should see: question_sets **1**, questions **6**, resources **2**,
app_settings **1**.

## Step 4 — Create the first ADMIN invite code

The app has no admin until you make one. Run this in a new SQL query
(the SQL Editor bypasses the app's security rules, which is why this works
before any admin exists):

```sql
INSERT INTO public.invite_codes (code, role, note)
VALUES ('FREDROCK-ADMIN-001', 'admin', 'First admin code — for Black Lansky')
RETURNING code, role;
```

**Give that code privately to Black Lansky** (text it, don't post it anywhere).
He'll enter it on the app's start page, create his account, and land in the
**admin panel** automatically.

Need the other 9 writer seats? After Black is set up, he can generate them
from the admin panel — or you can run this once:

```sql
INSERT INTO public.invite_codes (code, role, note)
SELECT 'FREDROCK-' || upper(substr(md5(random()::text), 1, 8)),
       'writer',
       'Writer seat'
FROM generate_series(1, 9)
RETURNING code;
```

Copy the 9 codes it returns and hand one to each writer.

## Step 5 — Copy your Project URL and anon key

1. In the left sidebar, click **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://xyzcompany.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`
3. Keep the **service_role key** secret — the app never needs it, and it
   bypasses all security rules. Never paste it into the app.

## Step 6 — Connect the app

1. Open `setup.html` in a browser.
2. Paste the **Project URL** and **anon key** into the two fields and click Save.
3. The app tests the connection and links you to the start page.
4. Enter the admin invite code from Step 4 → create the account → you're in.

Writers do the same with their own codes: start page → invite code → sign up →
they land in the writer room.

---

## Honest notes (what's real and what isn't)

- **Email is NOT wired.** Nudges appear as in-app notifications (the bell icon).
  When the admin sends a nudge, the app shows the message text to copy into an
  email or text — sending itself happens outside the app. (No free transactional
  email exists in Supabase without extra configuration.)
- **Voice transcription works best in Chrome or Edge.** The live transcript uses
  the browser's built-in Web Speech API — free, no key needed. Firefox and some
  mobile browsers don't support it; there the writer types or pastes the
  transcript manually, and the audio still saves.
- **Read-aloud uses the browser's built-in voices** (Web Speech synthesis) — no
  key, no network. Availability varies by device/OS; where unsupported, the 🔊
  buttons say to try Chrome or Edge.
- **First-visit onboarding is skippable and resumable.** It shows once per writer
  (tracked in `writers.onboarded_at` and a localStorage flag). The photo step is
  optional — writers can tap their header photo later to add one. Every onboarding
  step is also written out in plain words under the **Help** tab.
- **Audio is private.** Voice notes live in a private storage bucket. Playback
  uses short-lived signed links generated when a writer or admin opens the app —
  nobody can guess a URL and listen in.
- **Invite codes are single-use.** Once claimed, a code can't be reused. Lost
  code? Deactivate the writer in the admin panel and issue a fresh one.
- **The "Connect AI" writing-coach upgrade is optional.** Out of the box the
  Writing Coach runs fully offline (free prompt tools, beat-sheet generator,
  dialogue checklist). Pointing it at an AI endpoint is an admin choice that
  needs the admin's own key — never stored in the database.

## If something goes wrong

- "Success" didn't appear in Step 2/3: check you pasted the **whole** file,
  then press Run again — both scripts are safe to re-run.
- App says it can't connect: re-open `setup.html` and re-paste the URL and
  anon key (no trailing spaces).
- Invite code rejected: codes are exact — check for typos, and confirm in the
  admin panel (or SQL: `SELECT code, claimed_by FROM public.invite_codes;`)
  that it hasn't been claimed already.
