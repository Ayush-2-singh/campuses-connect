# ConnectToCampus V4 — Page Map & Information Architecture

> **Recruiter-first campus hiring infrastructure.** Supply = verified students
> (the skill graph). Demand = recruiters and colleges (the payers).
> Public site sells to recruiters; student app is the supply engine.
>
> **Locked decisions:** (1) talent search is **recruiter-only**; (2) recruiter
> signup is **verified-only**; (3) **B2B ONLY — recruiters are the only payer**
> (students never pay); (4) **niche = pre-vetted entry-level software engineers
> (freshers, 0–1 yr) from tier-2/3 colleges, sold to seed–Series A startups**;
> (5) **pricing = ₹5–10k upfront mandate fee + ~8.33% of annual CTC success fee**,
> paid from day 1 — the first **demo batch of 10 students** is a one-time
> **coupon, not a free tier**.

Legend: **KEEP** (exists, unchanged) · **NEW** (build) · **MOVE** (relocate) ·
**REPURPOSE** (exists, re-target) · **GATED** (retired, redirects to `/jobs`).

---

## 1. Roles, shells & post-login routing

| Role | Source | Shell | Lands on |
|---|---|---|---|
| Guest | — | public | `/` |
| Student | `profiles` (default) | `Layout` (student) | `/jobs` |
| Recruiter | `recruiter_members` | `RecruiterShell` (NEW) | `/recruiter` |
| Placement / TPO | `admin_grants.admin_type='placement_admin'` | `PlacementShell` (NEW) | `/placements` |
| Platform admin | `admin_grants.admin_type='platform_admin'` | existing `Layout` | `/admin` |

Post-login redirect resolves the highest role present: platform_admin → `/admin`,
placement_admin → `/placements`, recruiter → `/recruiter`, else → `/jobs`.

**Three new shells**, all reusing `getVerifiedUser*` + `scopeFilterFor`:
`src/components/recruiter/RecruiterShell.tsx`,
`src/components/placements/PlacementShell.tsx`, and a public
`src/components/marketing/PublicShell.tsx` for the storefront pages.

---

## 2. Public pages (no auth) — the recruiter storefront

| Path | Status | Purpose |
|---|---|---|
| `/` | **REPURPOSE** | New landing: "Hire pre-verified talent from tier-2/3 campuses". Hero, how-it-works, trust, CTA **Post a role / Source talent** + `I'm a student`. |
| `/jobs` | KEEP | Public job board (kept hub / gate fallback) |
| `/jobs/[id]` | KEEP | Job detail + apply |
| `/companies` | KEEP | Company directory |
| `/companies/[slug]` | KEEP | Company profile + open roles (recruiter brand page) |
| `/passport/[handle]` | **NEW** | Public **Skill Passport** — verified GitHub/LeetCode/assessment/interview scores. The shareable, viral proof asset. |
| `/blog`, `/blog/[slug]` | KEEP | SEO + interview experiences (acquisition) |
| `/about`, `/privacy`, `/terms` | KEEP | — |
| `/auth/*`, `/verify-email` | KEEP | Auth |

---

## 3. Student app (auth) — the supply engine

| Path | Status | Purpose |
|---|---|---|
| `/jobs`, `/jobs/[id]` | KEEP | Openings + apply |
| `/companies`, `/companies/[slug]` | KEEP | Explore employers |
| `/applications` | KEEP | Pipeline: applied → shortlisted → interview → offer |
| `/experiences`, `/experiences/[id]` | KEEP | Interview experiences |
| `/opportunities` | KEEP | Internships/opportunities feed |
| `/passport` | **NEW** | Own Skill Passport + share/copy link |
| `/assessments` | **NEW** | Assigned + practice assessments list |
| `/assessments/[id]` | **NEW** | Take an assessment (MCQ / coding / subjective) |
| `/assessments/[id]/result` | **NEW** | Score + skill breakdown |
| `/interviews` | **NEW** | Mock-interview hub (AI + human mentor) |
| `/interviews/[id]` | **NEW** | Live session (text → voice via LiveKit) |
| `/interviews/[id]/scorecard` | **NEW** | Rubric feedback |
| `/brain` | **REPURPOSE** | AI Brain → **AI Coach** (resume, JD match, interview prep) |
| `/compete` | **REPURPOSE** | DSA arena → **practice**, feeding the assessment engine |
| `/leaderboard` | **REPURPOSE** | → campus **skill ranking** (verified signals only) |
| `/integrations` | KEEP | Connect GitHub / LeetCode (feeds the passport) |
| `/talent` | **GATED** | Student talent browse retired — talent search is **recruiter-only** (`/recruiter/talent`) |
| `/activity` | **OPTIONAL** | Light hiring feed — **demand-side engagement only**. Skip it in a pure B2B model where you source students yourself; build it only if you want organic student signups. |
| `/messages`, `/messages/[id]` | **RE-ENABLE** | Job-scoped recruiter ↔ candidate threads (currently GATED) |
| `/notifications` | KEEP | Drive/status alerts |
| `/reminders` | KEEP | Deadline reminders |
| `/premium` | KEEP | Student Pro (AI Coach, mock interviews) |
| `/profile`, `/profile/[username]` | KEEP | Identity |
| `/onboarding`, `/campus-change` | KEEP | Verified identity |
| `/more` | KEEP | Feature index (already rebuilt) |

Student bottom nav: **Jobs · Assess · Passport · Profile**

---

## 4. Recruiter console `/recruiter/*` (NEW) — the "first choice" workspace

| Path | Purpose |
|---|---|
| `/recruiter` | Dashboard: active drives, pipeline, response rates, matched talent |
| `/recruiter/talent` | Search **verified** students (filter: campus, skills, scores, availability) |
| `/recruiter/talent/[id]` | Candidate profile + Skill Passport + assessment/interview results |
| `/recruiter/shortlists` | Shortlists list |
| `/recruiter/shortlists/[id]` | Shortlist detail: compare, message, advance stage |
| `/recruiter/drives` | Drives (campus hiring drives you own) |
| `/recruiter/drives/[id]` | Drive detail: registrations, stages, offers |
| `/recruiter/jobs` | Your job posts |
| `/recruiter/jobs/new` | Post a role |
| `/recruiter/jobs/[id]` | Applicants + ATS |
| `/recruiter/messages` | Threads with candidates |
| `/recruiter/batches` | Demo batches received + request a new shortlist batch |
| `/recruiter/billing` | Mandate fee, invoices, success-fee status, coupon redemption |
| `/recruiter/settings` | Company profile, team members, verification |

Recruiter sidebar: **Dashboard · Talent · Shortlists · Drives · Jobs · Messages**

**Recruiter onboarding is verified-only.** An org is created in `status='pending'`
and cannot post a job or message candidates until a platform admin verifies it
(`/admin/recruiters`). Until then the console shows a "verification pending"
banner and read-only talent preview. This protects the student/college side
from spam recruiters.

---

## 5. Placement / TPO console `/placements/*` (NEW) — the college buyer

| Path | Purpose |
|---|---|
| `/placements` | Overview: placement %, offers, avg/highest package, companies visited |
| `/placements/drives` | All drives on this campus |
| `/placements/drives/[id]` | Drive detail: eligibility, registered, shortlisted, offers |
| `/placements/students` | Roster: branch/year, status, verified skills, placement state |
| `/placements/assessments` | Assessment list + results |
| `/placements/assessments/new` | Builder (MCQ / coding / subjective) |
| `/placements/assessments/[id]` | Results + ranked shortlist |
| `/placements/companies` | Recruiter relationships & history |
| `/placements/reports` | **NAAC/NBA export** (placement evidence, audit trail) |

TPO sidebar: **Overview · Drives · Students · Assessments · Reports**

---

## 6. Admin back-office `/admin/*` — **where you build the inventory**

The B2B engine room: you (the operator) source, screen and deliver students here,
rather than students self-serving. This is the **highest-priority build**.

| Path | Status | Purpose |
|---|---|---|
| `/admin`, `/admin/analytics`, `/admin/campuses` | KEEP | Existing |
| `/admin/students` | **NEW** | **Inventory**: import/upload student profiles (CSV), manage the roster |
| `/admin/screening` | **NEW** | Run assessments/interviews to qualify students before they enter the pool |
| `/admin/batches` | **NEW** | Assemble a **demo batch of 10** and generate a **one-time coupon code** |
| `/admin/recruiters` | **NEW** | Verify recruiter orgs; view their mandates & hires |
| `/admin/billing` | **NEW** | Mandate fees, success fees, invoices, payouts |
| `/admin/placements` | **NEW** | Grant `placement_admin` (TPO) access per campus |

Copilot/* content endpoints retire with the social posts.

---

## 7. Retired (GATED → `/jobs`)

`/global` `/community` `/communities` `/chat` `/connections` `/groups`
`/live-voice-chat` `/meetings` `/watch` `/games` `/polls` `/saved` `/weekly`
`/badges` `/teams` `/post/[id]` `/talent`. `/activity` is optional (see §3).
Reversal: `SOCIAL_LAYER_RETIRED` in
`src/lib/featureGates.ts`. `/messages` is removed from this list in phase 4.

---

## 8. New API surface

| Route | Guard | Purpose |
|---|---|---|
| `POST /api/assessments/[id]/start` | `requireAuthLite` | attempt + questions (no keys) |
| `POST /api/assessments/[id]/answer` | `requireAuthLite` | autosave + auto-grade MCQ |
| `POST /api/assessments/[id]/code` | `requireAuthLite` | Piston judge (reuse `compete/submit`) |
| `POST /api/assessments/[id]/submit` | `requireAuthLite` | AI-grade subjective + finalize |
| `GET /api/assessments/[id]/results` | `requirePlacement` | TPO results (campus-scoped) |
| `POST /api/interviews/start` | `requireAuthLite` | session + LiveKit room |
| `POST /api/interviews/turn` | `requireAuthLite` | Gemini next-Q + score |
| `POST /api/interviews/score` | `requireAuthLite` | scorecard |
| `GET /api/recruiter/talent` | `requireRecruiter` | verified talent search |
| `POST /api/recruiter/shortlists` | `requireRecruiter` | shortlist ops |
| `POST /api/recruiter/drives` | `requireRecruiter` | create/manage drives |
| `GET /api/placements/report` | `requirePlacement` | NAAC/NBA export |
| `GET /api/passport/[handle]` | public | Skill Passport data |
| `POST /api/recruiter/billing/mandate` | `requireRecruiter` | Charge the upfront mandate fee (Razorpay) |
| `POST /api/recruiter/billing/success` | `requireRecruiter` | Record a hire → success fee invoice |
| `POST /api/recruiter/batches/redeem` | `requireRecruiter` | Redeem the one-time demo coupon |
| `POST /api/admin/students/import` | `requireAdmin` | Bulk-import the student roster |
| `POST /api/webhooks/razorpay` | signature | Payment/invoice webhook |

New guards in `src/lib/api/middleware.ts`: `requireRecruiter` (reads
`recruiter_members`) and `requirePlacement` (reads `admin_grants` where
`admin_type='placement_admin'`, scoped by `campus_id`/`college_id`).

---

## 9. Data model (migrations, in order)

- `054_retire_social_features.sql` — ✅ done (flag retiral)
- `055_hire_leads.sql` — ✅ done (`hire_leads` — public demo-batch requests)
- `056_batches.sql` — ✅ done (`batches` + `batch_students` — recruiter shortlist delivery)
- `057_recruiter_layer.sql` — `recruiter_orgs` (**`status` pending/verified/suspended**), `recruiter_members`, `drives`,
  `drive_registrations`, `shortlists`, `shortlist_items`, `offers`
- `058_assessments.sql` — `assessments`, `assessment_sections`,
  `assessment_questions`, `assessment_invites`, `assessment_attempts`,
  `assessment_answers` (hidden `answer_key`/`test_cases`)
- `059_interviews.sql` — `interview_templates`, `interview_sessions`,
  `interview_turns`, `interview_scorecards`
- `060_skill_passport.sql` — `skill_scores` (or matview) + passport RPC
- `061_business.sql` — `coupons`, `mandates`, `invoices`, `payments` (recruiter-only revenue)
- `062_drop_social.sql` — ordered `DROP TABLE ... CASCADE` (optional)

---

## 10. Build order — **concierge first, revenue first**

1. **Phase 1 — Concierge capture** ✅ — `/hire` + `/` recruiter landing + `055_hire_leads`
2. **Phase 1 — Batch delivery** ✅ — `056_batches` + `/admin/hire` + public
   `/hire/b/[token]` shortlist (the end-to-end first batch)
3. **Recruiter layer** — `057` + `/recruiter/*` + `requireRecruiter`
4. **Admin back-office** — `/admin/students`, `/admin/screening` + the demo-coupon flow
5. **Billing from day 1** — `061`: mandate fee + success fee + coupon (Razorpay)
6. **Assessments** — `058`, reuses the Piston judge (your screening moat)
7. **Skill Passport (public)** — `060`, the batch's credibility asset
8. **Placement/TPO console** — `/placements/*` + `/admin/placements`
9. **Interviews + repurpose Brain/Compete** — `059`, `/interviews/*`, AI Coach
10. `/activity` — optional light hiring feed

> Rationale: the landing page and student app only matter once recruiters are
> paying. Build the revenue path (recruiter console → back-office → billing)
> before the marketing surface.
