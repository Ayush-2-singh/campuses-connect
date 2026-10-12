# ConnectToCampus V4 — Campus Hiring Infrastructure

> **Positioning:** the layer that connects **companies to campuses**.
> Verified student skill graph in, pre-screened talent out. The campus is the
> channel; recruiters and colleges are the payers.
>
> Supersedes V3 (CSE community platform). V3's social layer is removed or
> repurposed; V3's identity, verification, ATS and judge infrastructure is kept.

---

## 1. One-sentence product

**Run a college's placement season end-to-end:** verified student profiles →
assessments → shortlists → drives → offers → placement reports (NAAC/NBA),
with a recruiter console on the other side of the same pipeline.

## 1b. Business model — **recruiters are the only payer**

This is a **B2B recruitment business**, not a consumer website. Students are
inventory (sourced by us / by TPOs), never customers.

- **Niche:** pre-vetted entry-level **software engineers** (freshers, 0–1 yr)
  from **tier-2/3 Indian colleges**, sold to **seed–Series A startups** hiring
  their 1st–10th engineer.
- **Moat:** the DSA judge + GitHub/LeetCode verification → a credible,
  automated screening signal the student already agreed to.
- **Pricing (paid from day 1):** ₹5–10k upfront **mandate fee** +
  **~8.33% of annual CTC** on hire. Standard, low-risk for the recruiter.
- **Acquisition hook:** a **one-time demo coupon** unlocks a batch of **10
  pre-screened students** — a coupon, not a free tier; every batch after bills.
- **Never monetize students:** no student premium, no ads, no sponsorships.
  (Migration 043's `user_premium` is deprecated for this reason.)
- **Billing:** Razorpay (INR, GST invoices, payment links, subscription + one-off).

**Revenue-critical surfaces** (build before the marketing site): the recruiter
console, the admin back-office that builds the inventory, and billing.

## 2. Three planes

| Plane | Who | What they get |
|---|---|---|
| **Student** | verified college student | Skill Passport, assessments, AI mock interviews, jobs |
| **Campus (TPO)** | Training & Placement Officer | Drive manager, eligibility engine, placement analytics, accreditation export |
| **Recruiter** | company TA / founder | Talent search, shortlists, drives, verified skill signals |

Platform plane (admin/moderation/billing) underpins all three.

## 3. Keep / Cut / Repurpose map

Action legend: **KEEP** (unchanged) · **REPURPOSE** (same code, new purpose) ·
**CUT** (remove route + API + tables).

### 3.1 Identity & trust — KEEP
| Area | Routes | Tables |
|---|---|---|
| Auth | `auth/login|signup|forgot-password|reset-password`, `verify-email` | `auth.users` |
| Profile | `profile`, `profile/[username]` | `profiles`, `profile_skills` |
| Campus / college | `campus-change`, `admin/campuses`, `api/colleges/search` | `campuses`, `colleges`, `campus_change_requests` |
| Email/ID verify | `api/verify-college-email` | `college_email_verifications` |

Rationale: **verified campus identity is the core moat.** Nothing here changes.

### 3.2 Skill graph — KEEP (becomes a paid signal)
| Area | Routes | Tables |
|---|---|---|
| GitHub / LeetCode | `integrations`, `api/integrations/*` | integration tables (037) |
| Skill score | `leaderboard` | `leaderboard` / score RPCs (038, 021) |

**Add:** `skill_scores` materialized view + public **Skill Passport** page.

### 3.3 Hiring loop — KEEP (this was already the aligned half)
| Area | Routes | Tables |
|---|---|---|
| Companies | `companies`, `companies/[slug]` | `companies` (039) |
| Jobs | `jobs`, `jobs/[id]` | `jobs` |
| Applications | `applications`, `api/applications` | `applications` |
| Interview experiences | `experiences`, `api/experiences` | `interview_experiences` |
| Opportunities | `opportunities`, `api/opportunities/*` | opportunities tables |

**Add:** recruiter orgs, drives, shortlists, offers (see §5).

### 3.4 Assessments & interviews — REPURPOSE
| Existing | Becomes |
|---|---|
| Compete / DSA judge (`compete`, `api/compete/*`, `015_dsa_compete.sql`) | **Coding assessment engine** (judge = Piston, hidden tests already correct) |
| AI Brain (`brain`, `api/brain/*`, `lib/brain.ts`, `011_ai_brain.sql`) | **AI mock interview + placement coach** |
| Live voice (`live-voice-chat`, `api/live-voice-chat/token`) | **Voice mock interviews** (LiveKit token route reused verbatim) |

Rationale: the judge, the Gemini RAG/JSON pipeline and the LiveKit token minting
are the three most valuable assets in the repo. Delete none of them.

### 3.5 Admin / platform — KEEP (pruned)
`admin`, `admin/analytics`, `api/admin/*`, `feature_flags`, `platform_settings`,
`audit_log`, `admin_grants`, `rate_limits`, `notifications`, `reminders`, `more`,
`about`, `privacy`, `terms`.

> **Deprecated for B2B:** `user_premium` (043) and the `/premium` page — students
> never pay. Reuse `user_premium`'s plumbing for **recruiter** mandates/billing
> (migration 059) instead.

Prune: AI admin **copilot** (`api/admin/copilot/*`) — it moderates social posts
that are being cut. Keep the code path but disable its flags, or cut with posts.

### 3.6 CUT — the social / engagement layer

| Route(s) | Tables / migrations | Why |
|---|---|---|
| `/` home feed, `/global`, `/post/[id]` | `posts`, `post_comments`, `post_reactions`, `saved_posts` | social feed, not hiring |
| `/community`, `/communities`, `/communities/[slug]` | `communities`, `community_members`, `content_categories`, `content_permissions` | community social |
| confessions (`/community?view=confessions`) | `confessions` (20261023) | anonymous social |
| `/polls` | `polls`, `poll_votes` (010) | social |
| `/chat`, `/messages`, `/connections`, `/groups` | `conversations`, `messages`, `connections`, `groups` (029, 20261017) | social DMs — replace with recruiter↔candidate messaging |
| `/live-voice-chat`, `/meetings` | `live_voice_chat_*` (20260920), `meetings` (008) | social voice — **keep the token route** for interviews |
| `/games`, `/watch` | `game_rooms`, `tournaments`, `typing_battle`, aura (045–049, 2026110x) | esports / video wall |
| `/saved`, `/weekly`, `/badges` | `saved_posts`, weekly wrap, `badges`/streak (040) | engagement, not hiring |
| `/teams` | teams tables | hackathon teams |
| (README-only, no route) notes / ask / events / travel / lost-found | `notes`, `ask_senior`, `events`, `travel`, `lost_found` | already unrouted — drop tables |

> **Note:** several V3 features listed in `README.md` (notes, events, ask, travel,
> lost&found) have **no route** in `src/app` — the README is stale. Only their
> tables exist to drop.

### 3.7 Message replacement
Social DMs are cut. Add **`/messages`** back as a **job-scoped recruiter thread**:
a conversation exists only between a recruiter and an applicant on a `job`/`drive`.
Same `messages` plumbing, new scope and RLS (participants = recruiter org member
+ applicant).

---

## 4. Target information architecture

**Student nav (mobile bottom bar):** `Jobs · Assess · Passport · Profile`
**☰ menu:** Applications · Interviews · Experiences · Notifications · Premium

**Recruiter console** (own shell, `/recruiter/*`): Dashboard · Talent · Shortlists · Drives · Jobs
**TPO console** (own shell, `/placements/*`): Drives · Students · Eligibility · Reports · Assessment builder

**Public:** `/` landing (recruiting pitch), `/passport/[handle]` (shareable), `/jobs`, `/companies`

## 5. New data model (add migrations)

All under `supabase/migrations/`, numbered, RLS on every table, `SECURITY DEFINER`
RPCs with `SET search_path TO 'public'` (house convention).

```sql
-- 055_hire_leads.sql            ✅ (Phase 1 concierge capture)
hire_leads         (id, company, contact_name, email, role_title, positions,
                    notes, source, status, created_at)

-- 056_batches.sql               ✅ (recruiter shortlist delivery)
batches            (id, lead_id, token, title, status, created_by, created_at)
batch_students     (batch_id, user_id, position)

-- 057_recruiter_layer.sql
recruiter_orgs     (id, name, domain, logo_url, verified, created_by, created_at)
recruiter_members  (org_id, user_id, role, created_at)          -- role: owner|member
drives             (id, org_id, campus_id, title, description,
                    opens_at, closes_at, status, config jsonb)
drive_registrations(drive_id, user_id, status, created_at)       -- applied→shortlisted→offer
shortlists         (id, drive_id, org_id, created_by, note, created_at)
shortlist_items    (shortlist_id, user_id, added_at)
offers             (id, drive_id, user_id, package_lpa, role,
                    status, released_at, accepted_at)
skill_scores       (user_id, github_score, leetcode_score, assessment_score,
                    interview_score, composite, updated_at)      -- or a matview

-- 058_assessments.sql   (see prior design)
assessments · assessment_sections · assessment_questions
assessment_invites · assessment_attempts · assessment_answers
-- answer_key / test_cases are HIDDEN: service-role only, exactly like dsa_problems

-- 059_interviews.sql
interview_templates · interview_sessions · interview_turns · interview_scorecards
-- interview_sessions.call_id reuses the live-voice-chat LiveKit token route

-- 060_skill_passport.sql · 061_business.sql (recruiter monetisation)

-- 062_drop_social.sql
-- ordered DROP TABLE ... CASCADE for every table in §3.6
```

## 6. API surface

**Kept / repurposed**
`api/applications` · `api/companies/*` · `api/jobs` · `api/experiences` ·
`api/integrations/*` · `api/brain/*` (→ coach) · `api/compete/submit` (→ assessment judge) ·
`api/live-voice-chat/token` (→ interview room) · `api/admin/*` · `api/notifications/push` ·
`api/reminders` · `api/colleges/search` · `api/verify-college-email`

**New**
| Route | Guard | Purpose |
|---|---|---|
| `POST /api/assessments/[id]/start` | `requireAuthLite` | attempt + questions (no keys) |
| `POST /api/assessments/[id]/answer` | `requireAuthLite` | autosave + auto-grade MCQ |
| `POST /api/assessments/[id]/code` | `requireAuthLite` | Piston judge (reuse) |
| `POST /api/assessments/[id]/submit` | `requireAuthLite` | AI-grade subjective + finalize |
| `GET  /api/assessments/[id]/results` | `requireAdmin` + `scopeFilterFor` | TPO view (own campus) |
| `POST /api/interviews/start` | `requireAuthLite` | session + LiveKit room |
| `POST /api/interviews/turn` | `requireAuthLite` | Gemini next-Q + score |
| `POST /api/interviews/score` | `requireAuthLite` | scorecard |
| `POST /api/recruiter/drives` | `requireRecruiter` | create drive |
| `POST /api/recruiter/shortlists` | `requireRecruiter` | shortlist candidates |
| `GET  /api/recruiter/talent` | `requireRecruiter` | search verified students |
| `GET  /api/placements/report` | `requirePlacement` | NAAC/NBA export |

**New guards** (extend `lib/api/middleware.ts`): `requireRecruiter` (reads
`recruiter_members`), `requirePlacement` (reads `admin_grants` with a new
`admin_type = 'placement_admin'`).

## 7. Authorization additions

Reuse `admin_grants` for the campus plane: add `admin_type = 'placement_admin'`
scoped by `campus_id`/`college_id` (the existing `scopeFilterFor` already matches
on these columns). Recruiters get their own table (`recruiter_members`) rather
than overloading `admin_grants`.

## 8. Phased roadmap

| Phase | Deliverable | Reuses |
|---|---|---|
| **0** | This doc + cut list sign-off | — |
| **1** | `058_drop_social.sql` + route/API/nav removals + homepage rewrite | — |
| **2** | `055_recruiter_layer.sql` + recruiter console + TPO drive manager | jobs/applications |
| **3** | `056_assessments.sql` + MCQ→coding assessment flow | Piston judge |
| **4** | `057_interviews.sql` + AI mock interview (text → voice) | Gemini + LiveKit |
| **5** | Skill Passport + composite score + billing | premium, feature-flags |

## 9. Risks & guardrails

- **Destructive migration.** `058_drop_social.sql` is irreversible in prod. Ship a
  `dumps/schema` backup (existing `scripts/backup-db.sh`) before running it.
- **Feature-flag first.** Every cut can be staged by flipping the existing
  `feature_flags` rows to `enabled = false` before physical deletion — this is the
  reversible path and is recommended for phase 1.
- **Don't delete the three crown jewels:** `lib/brain.ts`, `api/compete/submit`,
  `api/live-voice-chat/token`.
- **Homepage + nav must change together** with route removal or the app dead-links.
