# ConnectMyCampus V3 — Architecture

> AI-powered community platform for **Computer Science students in Indian colleges**.
> No faculty. No school students. No exam-prep communities. CSE college students only.

## 1. Product Planes

| Plane | What lives here |
|---|---|
| **Global Communities** | DSA · Web Development · Startups. Any authenticated student can join, read, comment, like, save, share. |
| **College Space** | Per college/campus: Feed, Clubs, Events, Hackathons, Internships, Announcements, Campus Insights, Lost & Found, Study Groups. |
| **Unified Post Model** | One `posts` table. Every post = **1 category × 1 scope** (campus → college_network → global). |
| **Admin Layer** | Platform/Campus/Community admins. Admin Panel with the dynamic Content Permissions matrix. |
| **AI Layer** | `content_moderation` + `opportunity_scam_filter`. Flags → moderation queue → admins resolve. Never bypasses the matrix. |

## 2. Post Categories (data, not code)

`discussion · resource · notes · hackathon · internship · event · announcement · project · opportunity`
— stored in `content_categories`; adding a category = inserting a row (no deploy).

## 3. Universal Post Scope

- **campus** — visible to students of that campus (e.g. PW IOI Lucknow)
- **college_network** — visible to the whole college (PW IOI, all campuses)
- **global** — visible to everyone

Scope hierarchy: `campus(1) < college_network(2) < global(3)`.

## 4. Authorization Model

### Actors
| Actor | Power scope | Assigned via |
|---|---|---|
| Student (implicit) | read / join / like / comment / save / share | signup |
| Community Admin | a specific community | `admin_grants` |
| Campus Admin | a specific campus (or whole college) | `admin_grants` |
| Platform Admin | everywhere | `admin_grants` |

### Dynamic matrix (`content_permissions`)
`(actor_type × category) → max_scope`. NULL = cannot create. V1 seeds disable **student** posting entirely.

The authorization engine is **`can_create_post(user, category, scope, context)`** — a `SECURITY DEFINER` Postgres function used by **both** RLS (INSERT policy on `posts`) and the UI (composer renders only allowed categories/scopes via `list_creatable_categories`). Editing the matrix in the Admin Panel changes behavior **immediately** — no deploy.

## 5. Database

All SQL lives in `supabase/migrations/`:

- `001_v3_core_schema.sql` — tables, `posts` alterations, triggers
- `002_v3_seeds.sql` — categories, communities, admin types, **default matrix**, AI agents, PW IOI demo data, backfills (legacy `role` → `admin_grants`, dropped afterwards)
- `003_v3_authz.sql` — scope helpers, `user_admin_type`, `can_create_post`, `can_view_post`, `can_interact_post`, `has_mod_permission`, full RLS policies, RPCs (`add_karma`, `update_streak`, `my_admin_grants`, `list_creatable_categories`, `log_audit`)

### Key tables
`profiles` (no role; `status` for moderation) · `communities` · `community_members` · `content_categories` · `posts` (unified) · `post_comments` · `post_reactions` · `saved_posts` · `clubs` · `study_groups` · `campus_insights` · `lost_found` · `admin_types` · `admin_grants` · `content_permissions` · `moderation_permissions` · `ai_agents` · `campus_ai_agents` · `moderation_queue` · `content_reports` · `audit_log` · `college_email_verifications`

### Security model
RLS is on for every table. Reads are scope-aware (`can_view_post`). Writes are matrix-aware (`can_create_post`). Admin actions require `has_mod_permission` (platform admins short-circuit to TRUE).

## 6. AI Moderation

1. AI agent scans new content (edge function or DB trigger, driven by `ai_agents` config).
2. Suspicious items → `posts.status = 'held'` + row in `moderation_queue`.
3. Admins with `content.moderation` resolve: publish (`published`) or remove (`removed`).
4. Agents **cannot** publish, pin, or change scope — assist only.
5. Platform admins toggle agents globally (`ai_agents.enabled`) or per campus (`campus_ai_agents`).

## 7. Admin Panel (v3)

```
Overview · Content Permissions · Admins & Agents · Communities
· Colleges · Posts · AI Agents · Moderation
```

- **Content Permissions**: matrix editor (rows = actor types, columns = categories; checkbox + scope dropdown per cell). Live effect.
- **Admins & Agents**: grant/revoke `admin_grants` and granular `moderation_permissions`.
- **AI Agents**: master toggles + per-campus overrides.
- **Moderation**: queue + user reports, resolve/dismiss.

## 8. Navigation

- **Guest**: landing → join/sign in
- **Student**: Communities (3) · My College (feed/clubs/events/hackathons/internships/announcements/insights/lost&found/study groups) · Global feed · Saved · Notifications · Profile · More
- **Admin**: + Admin Panel; composer shows only matrix-allowed categories/scopes

## 9. Why this scales to future student-generated posting

1. **Policy in data, not code** — enabling "students can post Discussions" = one matrix checkbox.
2. **Categories are data** — new content types appear everywhere automatically.
3. **Unified posts** — new kinds reuse comments/reactions/saves/moderation.
4. **Scope ladder generalizes** — can grow upward (state/national) without engine changes.
5. **One engine, two consumers** — RLS and UI both call the same functions; no drift.
6. **AI stays subservient** — volume scales via queue + more admins, not relaxed rules.
