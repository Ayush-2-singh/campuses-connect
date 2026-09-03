# ConnectMyCampus V3 — Migration Plan

How to move the current codebase + database to the V3 architecture.

## 0. Order of operations

```bash
# 1. Apply database migrations (Supabase SQL editor, in order)
supabase/migrations/001_v3_core_schema.sql
supabase/migrations/002_v3_seeds.sql
supabase/migrations/003_v3_authz.sql

# 2. Update code (this repo now contains the V3 code)
# 3. Verify (see §5)
```

> ⚠️ The migrations **drop `profiles.role`** and **drop the `meetings` table**.
> Back up the database before running.

## 1. Schema migration (001)

- `profiles`: + `status`; `role` survives until 002 backfills `admin_grants`.
- New: communities, community_members, content_categories, saved_posts, clubs/club_members, study_groups/study_group_members, campus_insights, admin_types, admin_grants, content_permissions, moderation_permissions, ai_agents, campus_ai_agents, moderation_queue, content_reports, audit_log, college_email_verifications.
- `posts`: + category_id, scope, community_id, status, share_count, meta columns (apply_link, deadline, skills_required, drive_link…).
- `meetings` **dropped** (faculty concept removed).
- Triggers: `handle_new_user` (auto profile), `set_updated_at`.

## 2. Seeds & backfill (002)

- 9 categories, 3 global communities, 3 admin types, **default permission matrix** (students disabled; community_admin → global in-community; campus_admin → campus/college; platform_admin → global).
- 2 AI agents with defaults.
- PW IOI demo college + Lucknow/Delhi campuses + CSE-only departments.
- Backfills:
  - `posts.post_type` → `category_id`, `visibility` → `scope`.
  - `profiles.role` → `admin_grants`:
    - `platform_admin` → platform_admin (global)
    - `campus_admin` → campus_admin (their campus/college)
    - `ambassador` → community_admin on all 3 communities
    - `faculty`, `club_lead`, `student` → plain students (no grants)
  - `ALTER TABLE profiles DROP COLUMN role`.

## 3. Authorization (003)

- Functions: `scope_level`, `user_admin_type`, `can_create_post`, `list_creatable_categories`, `has_mod_permission`, `can_view_post`, `can_view_post_id`, `can_interact_post`, `can_interact_post_id`.
- RLS enabled + policies on **all** tables (drop stale policies first).
- RPCs: `add_karma`, `update_streak`, `my_admin_grants`, `log_audit`.

## 4. Code changes (this repo)

| Area | Change |
|---|---|
| `src/types/index.ts` | V3 types (scopes, categories, grants, communities) |
| `src/lib/permissions.ts` | **new** — `usePermissions` hook + RPC helpers |
| `src/middleware.ts` | `/admin` guard = platform/campus admin grant |
| `src/components/PostCard.tsx` | **new** — unified post card (scope + category chips, like/comment/save/share) |
| `src/components/PostComposer.tsx` | **new** — matrix-driven composer (admins only) |
| `src/components/Layout.tsx` | nav → Communities · College · Saved |
| `src/app/feed/page.tsx` | unified scope-aware feed |
| `src/app/communities/*` | **new** — 3 global communities |
| `src/app/college/*` | **new** — college space hub + clubs/study-groups/insights |
| `src/app/saved/page.tsx` | **new** |
| `src/app/verify-email/*` | **new** — college email verification |
| `src/app/admin/page.tsx` | v3 panel: Content Permissions matrix, Admins & Agents, AI Agents, Moderation |
| `src/app/more/page.tsx` | updated hub (meetings removed) |
| `src/app/onboarding/page.tsx` | CSE-only departments + college email step |
| `src/app/profile/*` | agent/verified badges instead of roles |
| `src/app/meetings/*` | **deleted** |

Legacy pages (`opportunities`, `notes`, `talent`, `teams`, `travel`, `weekly`, `leaderboard`) and legacy tables (`opportunities`, `notes`, `team_requests`, `travel_buddies`) are **kept for backward compatibility** and can be retired in a later phase once V3 surfaces replace them.

## 5. Verification checklist

- [ ] Run `npx tsc --noEmit` — clean
- [ ] Run `npm run lint` — clean
- [ ] Run `npm run build` — succeeds
- [ ] SQL: student INSERT into `posts` is rejected by RLS
- [ ] SQL: campus_admin can post Announcement at campus scope, **not** global
- [ ] SQL: matrix edit (e.g. allow student discussion) takes effect immediately
- [ ] SQL: AI-held post (`status='held'`) invisible to others, visible to moderators
- [ ] SQL: `can_view_post` hides campus posts from other campuses
- [ ] Old role users have correct `admin_grants` after backfill
- [ ] New signup auto-creates a `profiles` row (trigger)

## 6. Rollback

Keep a pre-migration backup. Reverting = restore backup; the code in this repo expects V3, so roll back both together.
