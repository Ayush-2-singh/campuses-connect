# Live Battle — YouTube live quiz engine (Phase 1: audit + schema)

Scope of this document: the audit findings, the integration plan and the database
schema that the rest of the feature depends on. **No UI is built yet** — see
"Blocked" at the end for the one thing that must happen first.

## 1. Audit (what already exists and must be reused)

| Concern | Existing answer in this repo | Decision |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript | reuse |
| Backend | Route handlers under `src/app/api/**` + SECURITY DEFINER RPCs | reuse the RPC pattern; no new server |
| Auth | Supabase Auth (`auth.users`), `profiles`, `@supabase/ssr` cookies | reuse — no second auth |
| Admin gate | `public.is_platform_admin()` (migration 035) | reused for host authorisation |
| Realtime | `supabase.channel(...)` already used in 16 places (DMs, voice rooms, typing battle) | reuse Postgres-changes on one event table |
| Storage | buckets already used for avatars and ID cards | reuse for question images / import files |
| Design system | `.hc-*` card/tag/button classes + `Layout` + `MobileBottomNav` | reuse for every screen |
| Existing Compete | `/compete?tab=rankings|contributors|challenge|clash|games` | add `live` tab, do not touch the rest |
| Existing contests | `public.contests` + `contest_registrations` (Campus Clash) | **left untouched** — a quiz room has a different lifecycle (host-paced, question by question), so it gets its own tables |

Nothing in this schema renames, drops or alters an existing table.

## 2. Why the design looks like this

1. **Bank ≠ run.** `question_bank` is the permanent authoring surface.
   `live_quiz_create()` copies the selected questions into
   `competition_questions` / `competition_question_options`. Editing or deleting
   a bank row afterwards cannot change a finished or running competition.
2. **Scores cannot be forged.** There is no INSERT policy on
   `competition_answers`. The only writer is `live_quiz_answer()`, which reads
   `now()` on the server, clamps to the question window, and computes the speed
   bonus itself. A crafted request can at most submit one answer late, which is
   rejected with `window_closed`.
3. **The answer key never reaches a player.** `competition_question_options` has
   a host-only SELECT policy, and `live_quiz_question()` returns options without
   `is_correct`. `live_quiz_reveal()` refuses while the window is still open.
4. **No duplicate participation, no duplicate answers.** `UNIQUE
   (competition_id, user_id)` on participants and `UNIQUE
   (competition_question_id, participant_id)` on answers. Rejoining a room after
   a reload returns the same participant row (`rejoined: true`).
5. **Cheap by construction.** Text in Postgres, images as URLs in storage, one
   6-digit indexed room code for the join path, one aggregate query for the
   leaderboard (top N + my rank in a single call), and one narrow event table
   for realtime instead of broadcasting a full leaderboard per answer.

## 3. Scoring (as implemented in SQL)

```
correct      = 100 (per-question `marks`, configurable)
speed bonus  = round(max_speed_bonus * (1 - response_ms / window_ms)), clamped 0..max
incorrect    = 0
unanswered   = 0
rank         = RANK() OVER (score DESC, correct_count DESC, total_response_ms ASC)
```

Exact ties share a rank, which is what the spec asks for.

## 4. Screens and routes (Phase 2+, not built yet)

```
/compete?tab=live                 Live Battle hub: join by code, open rooms, my history
/compete/live/host                host dashboard (create, question picker, controls)
/compete/live/host/[id]           live control panel + answer/submission progress
/live/[code]                      student join → waiting room
/live/[code]/play                 question screen (320px-first, large touch targets)
/live/[code]/results              podium, final table, personal performance
```

`/live/[code]` is deliberately outside `/compete` so a shared link is short and
does not carry the tab query string.

## 5. Phases

1. **Schema** (this migration) — tables, RLS, RPCs.
2. Host dashboard + competition creation (calls `live_quiz_create`).
3. Question authoring: manual editor, CSV/JSON/XLSX import, question bank browser.
4. Join flow + waiting room (`live_quiz_join`).
5. Live engine: `live_quiz_question` + countdown from `deadline` (server value),
   `live_quiz_advance`, realtime on `competition_events`.
6. Leaderboard: `live_quiz_leaderboard` (top 10 + my rank), reveal after close.
7. Results, podium, history (`live_quiz_my_history`).
8. Security + load test, then document the measured capacity.

## 6. Capacity and cost notes

- The engine sends **one upsert per answer** and **one insert per state change**.
  A 500-participant room sending one answer per question is 500 small writes per
  question window — no per-answer broadcast.
- Realtime subscribers read `competition_events` only; leaderboard refreshes are
  pulled on `question_ended` / `leaderboard_updated` (or a 5s timer), so a room
  of 500 does not receive 500 leaderboard payloads.
- Historical pages are paginated (`live_quiz_my_history`), results are capped by
  `LIMIT` and indexed by `(competition_id, rank)` and `(user_id, created_at)`.
- Imported files are stored only until parsing; the parse report is JSONB on
  `quiz_import_jobs`, so the same file is never re-uploaded per question.
- No Redis, Kafka or extra paid infrastructure is introduced.

**No load test has been run yet**, so no capacity number is claimed here. The
acceptance test is a scripted room of N concurrent participants against a real
deployment; that number will be documented after it runs.

## 7. Blocked (why this stops at schema)

The migration cannot be applied from this machine: there is no Supabase CLI
session and no direct Postgres connection string in the environment (only the
REST URL + keys). Until `20261117_live_battle.sql` is applied, any screen built
on these RPCs would be a decorative demo — which the spec explicitly forbids.

To unblock: apply the migration in the Supabase SQL editor (or restore a CLI
login), then set at least one host with
`INSERT INTO public.live_quiz_hosts (user_id) VALUES ('<uuid>');`, plus a
storage bucket `quiz-images` for image questions. Phase 2 can start immediately
after that.
