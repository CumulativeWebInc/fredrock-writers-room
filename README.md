# FredRock Writers Room

Black Lansky's private 10-person TV-series writing room — a static web app where invited
writers answer question rounds (text + voice), develop scripts on the Snowfall-style
**FredRock Format** template, and get coaching from built-in $0 tools.

**Identity:** Cumulative Web Inc · "FredRock Writers Room" branding throughout.

## Page map

| Page | Who | What |
|---|---|---|
| `index.html` | Everyone | Invite-code gate → signup (display name, email, password) → `claim_invite` RPC → role routing. "Sign in" link for returning writers. |
| `setup.html` | Admin (first run) | Paste Supabase Project URL + anon key → saved to localStorage (`fr_supabase_url`, `fr_supabase_anon_key`) → connection test. |
| `writer.html` | Writers | 7 tabs: **Questions** (published rounds, autosaving answers, word counts, share toggles, per-question voice recorder with a “✓ Voice answer saved and uploaded” confirmation, 🔊 read-aloud on questions and answers, 🔍 Check-my-answer coach review, 📎 file attachments) · **Voice Studio** (MediaRecorder + live Web Speech transcript + timer + manual-transcript fallback) · **Script Studio** (Snowfall guided forms: series bible, teaser + acts 1–5 + tag, scene fields, character sheets) · **Writing Coach** (5 local $0 tools + Connect-AI status) · **Room** (shared work, read-only) · **Resources** · **Help** (plain-words guide: answering, voice, files, read-aloud, sharing, install-on-phone). Header: profile photo (tap to change), notifications bell, progress-at-a-glance, inactivity nudge banner, sign out. First visit shows a 5-step welcome walkthrough (photo step optional). |
| `admin.html` | Admins | 6 tabs: **Dashboard** (aggregate cards, per-writer SVG bar graphs, completion metric bars, room-wide group progress bar, per-writer photo + name + individual progress bar, stale highlighting) · **Writers & Invites** (generate N codes, role/status management) · **Question Sets** (CRUD rounds + questions, publish toggles) · **Nudges** (stale list, send in-app nudge + copyable message, threshold setting) · **Resources** (CRUD guides) · **AI / Settings** (OpenAI-compatible endpoint + model + key in localStorage only, test button, app-settings viewer). |

## Setup

1. **Backend first** — the database builder's walkthrough lives in `SUPABASE-SETUP.md`
   (create project → run `sql/schema.sql` → run `sql/seed.sql` → create the first
   admin invite code). The schema creates all three storage buckets
   (`fredrock-audio`, `fredrock-avatars`, `fredrock-attachments`) itself.
   - Already set up before the 2026-09-30 update? Run `sql/migration-revisions-20260930.sql`
     once in the SQL Editor (adds profile photos, answer attachments, the two new buckets).
     Fresh setups don't need it — it's folded into `schema.sql`.
2. Open `setup.html`, paste the Project URL + anon key, save & test.
3. Open `index.html`, enter the admin invite code, sign up — you're routed to `admin.html`.

## Architecture notes

- **$0 stack:** vanilla JS + Supabase JS v2 (CDN) + hand-rolled inline SVG charts. No build step,
  no paid libraries, no paid APIs. Hostable on Cloudflare Pages or GitHub Pages.
- **No secrets in code.** `js/config.js` ships empty; keys live in localStorage. `js/db.js` reads
  localStorage first, then `config.js`. If Supabase isn't configured, every page redirects to
  `setup.html` with a clear message.
- **AI is two-layer:** (a) the Writing Coach's 5 tools run 100% locally, free, no key —
  the 5th, **Check my answer**, reads a writer's answer and scores coverage
  (when/where/who/why/feeling/sense-detail) then asks specific follow-up questions
  keyed to each of the 6 Round-1 origin prompts;
  (b) "Connect AI" accepts any OpenAI-compatible endpoint + key, stored in the admin's
  localStorage only (never in the database) — `js/coach.js` calls it when present and says
  honestly when it isn't.
- **Read-aloud:** browser-native speech (`js/tts.js`) — 🔊 buttons on every question and
  answer; works in Chrome/Edge/Firefox/Safari where the OS has speech voices, $0, no network.
- **Voice:** Web Speech API live transcription with feature detection — Chrome/Edge get live
  transcripts; Firefox and others get a manual-transcript box (shown in the UI).
- **First-run onboarding** (`js/onboard.js`): a 5-step, 5th-grade-reading-level welcome —
  welcome → answer questions (voice explainer included) → install-on-phone steps for
  iPhone-Safari / Android-Chrome / computer → optional profile photo → start writing.
  Shows once (tracked in `writers.onboarded_at` + a localStorage flag); writers can change
  their photo later by tapping it in the header, and every step is repeated in the Help tab.
- **Email sending is NOT wired** (no free transactional email in Supabase without config) —
  nudges are in-app notifications; the admin copies the message text for email/text.
- Audio uploads go to the private `fredrock-audio` bucket at `{writer_id}/{recording_id}.webm`;
  playback uses per-session signed URLs.
- Profile photos go to the public `fredrock-avatars` bucket at `{writer_id}/avatar.ext`
  (shown on the admin dashboard; falls back to initials if none).
- Answer attachments go to the private `fredrock-attachments` bucket at
  `{writer_id}/{answer_id}/{file_name}` (10 MB cap); metadata rows live in
  `answer_attachments`, opened via 1-hour signed URLs.
- Template content: `js/snowfall-template.js` (series bible, episode structure, scene fields,
  character sheets) is consumed by both Script Studio and the coach's beat-sheet tool.

## File map

```
css/style.css            cinematic dark theme
js/config.js             build-time keys (empty → setup.html flow)
js/db.js                 supabase singleton, session/writer helpers, activity logging
js/auth.js               signup/signin/signout, claim_invite, writers-row ensure, routing, heartbeat
js/tts.js                read-aloud (Web Speech synthesis): TTS.toggle(text, btn)
js/onboard.js            first-run onboarding overlay: Onboard.maybeShow(writer, callbacks)
js/writer.js             writer room tab logic
js/admin.js              admin panel tab logic
js/charts.js             barChart(el, rows), metricBar(el, label, value, max) → inline SVG
js/coach.js              local suggestion engine + pluggable AI endpoint
js/snowfall-template.js  Snowfall-style template DATA + form skeleton builders
```
