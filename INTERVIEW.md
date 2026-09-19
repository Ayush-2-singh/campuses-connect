# ConnectToCampus — Interview Prep Guide

> Quick-reference doc for revising the full codebase before interviews.
> Covers: tech stack, architecture, features, components, database, AI, design decisions, and common interview questions.

---

## 1. What Is ConnectToCampus?

A **full-stack campus community platform** for Indian CS students — think Reddit + Notion + LeetCode + LinkedIn, built specifically for college campuses.

**Live:** https://www.connecttocampus.com
**Repo:** https://github.com/Ayush-2-singh/campuses-connect

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 15 (App Router) | SSR, RSC, API routes, file-based routing |
| **Language** | TypeScript 5 | Type safety across full stack |
| **UI** | React 19, CSS custom properties (no Tailwind on components) | Dark/light theming via CSS variables |
| **Auth** | Supabase Auth + Google OAuth | Social login, session management via cookies |
| **Database** | Supabase (PostgreSQL) | 55 migrations, RLS policies, RPC functions |
| **Storage** | Cloudflare R2 (S3-compatible) | File uploads (notes, PDFs, images) |
| **AI/ML** | Google Gemini 2.5 Flash, Groq, OpenRouter | RAG pipeline, OCR, study assistant |
| **Embeddings** | Gemini text-embedding-001 (768 dims) | Vector search for notes |
| **Deployment** | Vercel | Edge middleware, automatic deploys |
| **PWA** | Service Worker + manifest | Offline support, installable |
| **Code Quality** | ESLint, Prettier, Husky + lint-staged | Pre-commit hooks |
| **Package Manager** | npm | Standard Node.js |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                    CLIENT                        │
│  React 19 + Next.js App Router (Client Comps)   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Layout   │ │ Pages    │ │ Components       │ │
│  │ (Shell)  │ │ (Routes) │ │ (PostCard, etc.) │ │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
│       │             │                │            │
│  ┌────▼─────────────▼────────────────▼─────────┐ │
│  │        @supabase/ssr (Browser Client)        │ │
│  │   createBrowserClient → cookies in browser   │ │
│  └──────────────────────┬──────────────────────┘ │
└─────────────────────────┼───────────────────────┘
                          │ HTTP (cookies)
┌─────────────────────────┼───────────────────────┐
│                    SERVER                        │
│  ┌──────────────────────▼──────────────────────┐ │
│  │           Next.js Middleware                 │ │
│  │  Session refresh, route protection, CORS     │ │
│  │  createServerClient from @supabase/ssr       │ │
│  └──────────────────────┬──────────────────────┘ │
│                         │                         │
│  ┌──────────────────────▼──────────────────────┐ │
│  │         Route Handlers (/api/*)              │ │
│  │  Auth verification, business logic, AI calls │ │
│  │  Service role client (bypasses RLS)          │ │
│  └──────────────────────┬──────────────────────┘ │
│                         │                         │
│  ┌──────────────────────▼──────────────────────┐ │
│  │      Supabase (PostgreSQL + Auth)            │ │
│  │  RLS policies, RPCs, triggers, vectors       │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **All pages are `'use client'`** — Entire app is client-side rendered. SSR is minimal. This simplifies state management but means initial load depends on JS bundle + API calls.

2. **Middleware does fire-and-forget auth** — For public routes (most pages), `getUser()` is called without `await`. This saves ~150ms per navigation but means API routes must read `request.cookies` directly (not `cookies()` from `next/headers`).

3. **Service role for writes** — API routes use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for inserts/updates. Auth is verified separately before any write.

4. **RLS for reads** — Row-Level Security policies on every table ensure users only see data they're allowed to. The browser client respects RLS natively.

5. **No ORM** — Direct Supabase JS client calls. Queries are written inline, not abstracted.

---

## 4. Database Schema (55 Migrations)

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `colleges` | Top-level institutions | name, slug, is_active, is_verified |
| `campuses` | Individual campuses per college | college_id, name, slug |
| `departments` | Departments within campuses | campus_id, name |
| `profiles` | User profiles (extends auth.users) | id, username, campus_id, karma_points, streak_days |
| `posts` | Feed posts with categories | author_id, scope, category_id, status |
| `content_categories` | Post types (discussion, resource, etc.) | key, label, sort_order |
| `comments` | Post comments | post_id, author_id, body |
| `notes` | Library resources | title, subject, resource_type, drive_link |
| `opportunities` | Jobs/internships/hackathons | opp_type, company_org, deadline |
| `communities` | User-created communities | key, visibility, join_test |
| `community_members` | Community membership | community_id, user_id, status |

### Admin & Permissions

| Table | Purpose |
|-------|---------|
| `admin_grants` | Role-based access (platform_admin, campus_admin, community_admin) |
| `content_permissions` | Category-level posting permissions per role |
| `audit_log` | Admin action logging |
| `feature_flags` | Toggle features per key (cached in localStorage) |
| `app_settings` | Global app config |

### Gamification

| Table | Purpose |
|-------|---------|
| `reputation_ledger` | Karma point transactions (immutable) |
| `badges` | Badge definitions |
| `user_badges` | Earned badges |
| `streak_rewards` | Daily streak tracking |
| `dsa_problems` | Coding challenge problems |
| `dsa_submissions` | User submissions with verdicts |
| `game_rooms` | Multiplayer game sessions |

### AI & Intelligence

| Table | Purpose |
|-------|---------|
| `brain_documents` | Uploaded documents for RAG |
| `brain_chunks` | Text chunks with vector embeddings (pgvector) |
| `brain_memories` | Extracted student memories |
| `brain_chat_history` | Conversation history |
| `admin_copilot` | AI-powered admin dashboard |

### Real-time & Communication

| Table | Purpose |
|-------|---------|
| `conversations` | DM threads |
| `conversation_participants` | DM participants |
| `messages` | Direct messages |
| `notifications` | Push + in-app notifications |
| `reminders` | User-set reminders |

### External Integrations

| Table | Purpose |
|-------|---------|
| `integrations` | GitHub, LeetCode profile linking |
| `company_followers` | Company follow tracking |
| `event_attendees` | Event RSVP tracking |

---

## 5. Feature Map (All Pages)

### Core Features

| Route | Feature | Components Used |
|-------|---------|----------------|
| `/feed` | Campus feed (posts, discussions) | PostCard, PostComposer, Layout |
| `/global` | Global feed (all campuses) | PostCard, Layout |
| `/notes` | Notes Library (notes, PYQs, resources) | Layout, EmptyState |
| `/brain` | AI Study Assistant (RAG + chat) | Layout, StreamingText |
| `/compete` | DSA challenges + contests | Layout, CodeEditor |
| `/opportunities` | Jobs, internships, hackathons | Layout |
| `/profile` | User profile + settings | Layout, Avatar |
| `/leaderboard` | Karma + rankings | Layout |
| `/notifications` | Notification center | Layout |
| `/messages` | Direct messages | Layout |

### Community Features

| Route | Feature |
|-------|---------|
| `/communities` | Browse/create communities |
| `/communities/[slug]` | Community detail + members |
| `/college` | Campus classroom (events, polls, schedule) |
| `/events` | Campus events + gallery |
| `/polls` | Polls |
| `/meetings` | Meeting scheduler |

### Social Features

| Route | Feature |
|-------|---------|
| `/connections` | Network connections |
| `/teams` | Team finder for projects |
| `/experiences` | Internship experience sharing |
| `/travel` | Travel buddy finder |
| `/lost-found` | Lost & found |
| `/talent` | Talent discovery board |

### Utility Features

| Route | Feature |
|-------|---------|
| `/jobs` | Job board |
| `/jobs/[id]` | Job detail + apply |
| `/companies` | Company directory |
| `/companies/[slug]` | Company profile |
| `/premium` | Pro/Enterprise subscription |
| `/badges` | Badge showcase |
| `/weekly` | Weekly stats digest |
| `/more` | All features index |

### Admin Features

| Route | Feature |
|-------|---------|
| `/admin` | Admin dashboard |
| `/admin/content` | Content moderation |
| `/admin/messages` | Message moderation |

### Auth & Onboarding

| Route | Feature |
|-------|---------|
| `/auth/login` | Google OAuth login |
| `/auth/signup` | Registration |
| `/onboarding` | Campus selection + profile setup |
| `/verify-email` | Email verification |

---

## 6. Component Architecture

### Layout System

```
Layout.tsx (shared shell)
├── Desktop Sidebar (fixed 240px)
│   ├── Logo + branding
│   ├── Nav items (Home, Classroom, Library, Compete, Opportunities, Connect)
│   ├── Secondary nav (More, Profile)
│   └── User card (avatar, streak, karma)
├── Main Content Area
│   ├── Desktop Top Bar (search pill, notifications, avatar)
│   ├── Mobile Top Bar (logo, search, menu)
│   └── {children} (page content)
├── Mobile Bottom Nav (4 tabs)
├── Mobile Menu (hamburger dropdown)
├── FAB (floating action button)
└── Command Palette (Cmd+K)
```

### Key Components

| Component | Purpose | Used In |
|-----------|---------|---------|
| `Layout.tsx` | App shell with sidebar + nav | Every page |
| `PostCard.tsx` | Feed post display | Feed, Global |
| `PostComposer.tsx` | Create new post | Feed, Global |
| `Avatar.tsx` | User avatar with fallback | Everywhere |
| `CommandPalette.tsx` | Cmd+K search + shortcuts | Layout |
| `Skeleton.tsx` | Loading placeholders | Everywhere |
| `EmptyState.tsx` | No-data states | Everywhere |
| `ErrorBoundary.tsx` | Error catching | Every page |
| `LoadingBar.tsx` | Route transition indicator | Root layout |
| `OfflineIndicator.tsx` | Offline banner | Root layout |
| `Toast.tsx` | Toast notifications | Root layout |
| `ThemeToggle.tsx` | Dark/light mode switch | Top bar |
| `LogoToggle.tsx` | Logo variant switcher | Top bar |
| `PullToRefresh.tsx` | Mobile pull-to-refresh | Feed |
| `MobileBottomNav.tsx` | Bottom tab bar | Mobile |
| `MobileMenu.tsx` | Hamburger menu | Mobile |
| `PremiumGate.tsx` | Paywall component | Premium features |
| `GuestEntry.tsx` | Guest login modal | Landing page |

### Games Components

| Component | Purpose |
|-----------|---------|
| `games/QuickMath.tsx` | Math quiz game |
| `games/CodeEditor.tsx` | CodeMirror-based editor for DSA |

---

## 7. API Routes

### Authentication Pattern

Every API route follows this pattern:

```typescript
// 1. Create SSR client from request cookies
const supabase = createSSRClient(request)

// 2. Verify user
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// 3. Use service role for writes (bypasses RLS)
const admin = getSupabaseAdmin()
await admin.from('table').insert({ ... })
```

### API Route Map

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/notes/submit` | POST | Submit link/resource |
| `/api/notes/upload` | POST | File upload to R2 |
| `/api/notes/presign` | GET | Presigned R2 URL |
| `/api/notes/ask` | POST | AI search notes |
| `/api/brain/*` | POST | AI chat, upload, memories |
| `/api/compete/submit` | POST | DSA submission |
| `/api/admin/*` | GET/DELETE | Admin operations |
| `/api/opportunities` | GET/POST | Job listings |
| `/api/experiences` | GET/POST | Experience sharing |
| `/api/applications` | POST | Job applications |
| `/api/badges` | GET | Badge listing |
| `/api/reminders` | GET/POST/DELETE | Reminder CRUD |
| `/api/notifications/push` | POST | Push notification subscription |
| `/api/companies/*` | GET | Company data |
| `/api/jobs/*` | GET | Job data |

---

## 8. AI System (Brain)

### Architecture

```
User Question
    ↓
┌─────────────────┐
│ Embed Query      │ ← Gemini text-embedding-001 (768 dims)
│ (vector search)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ pgvector cosine  │ ← brain_chunks table
│ similarity search│
└────────┬────────┘
         ↓
┌─────────────────┐
│ Retrieve memories│ ← brain_memories table
│ + chat history   │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Build RAG prompt │ ← sources + memories + history
└────────┬────────┘
         ↓
┌─────────────────┐
│ LLM completion   │ ← Gemini → OpenRouter → Groq (fallback)
│ (streaming SSE)  │
└────────┬────────┘
         ↓
    Response + memory extraction
```

### AI Features

| Feature | Model | Description |
|---------|-------|-------------|
| **RAG Chat** | Gemini 2.5 Flash | Answer from uploaded notes |
| **Embeddings** | Gemini text-embedding-001 | 768-dim vectors for search |
| **OCR** | Gemini Vision | Extract text from handwritten notes |
| **Memory** | Gemini 2.5 Flash | Extract student learning patterns |
| **Streaming** | SSE | Real-time token streaming |
| **Fallback** | OpenRouter (Grok) → Groq (Llama) | Multi-provider redundancy |

### Provider Priority

1. **Gemini** — Primary, generous free tier
2. **OpenRouter / Grok** — Free fallback
3. **Groq / Llama** — Last resort

---

## 9. Security & Auth

### Authentication Flow

1. User clicks "Sign in with Google"
2. Supabase Auth handles OAuth flow
3. Session stored in httpOnly cookies (`sb-<ref>-auth-token`)
4. Middleware refreshes tokens on every request (fire-and-forget for public routes)
5. API routes verify via `request.cookies` → `supabase.auth.getUser()`

### Authorization Levels

| Level | Role | Capabilities |
|-------|------|-------------|
| 0 | Guest | Read-only public content |
| 1 | Student | Post, comment, upload notes |
| 2 | Community Admin | Moderate community content |
| 3 | Campus Admin | Moderate campus-wide content |
| 4 | Platform Admin | Full admin access |

### RLS (Row-Level Security)

Every table has RLS policies. Key patterns:

- **Posts**: Users see posts from their campus + global posts
- **Notes**: Verified notes visible to all; pending only to admins
- **Messages**: Only conversation participants can read
- **Admin actions**: Service role bypasses RLS

### Security Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
```

---

## 10. Performance Optimizations

| Optimization | Where | Impact |
|-------------|-------|--------|
| **Parallel data fetching** | Feed page (`Promise.all`) | No waterfall — auth + posts + stats load simultaneously |
| **Deferred polling** | Layout unread count | 2s delay so page content loads first |
| **Lazy loading** | CommandPalette (`next/dynamic`) | Not loaded until Cmd+K pressed |
| **Feature flag cache** | localStorage (5 min TTL) | No DB hit on every page |
| **Rate limiting** | Postgres RPC (`check_rate_limit`) | Consistent across Vercel instances |
| **Image optimization** | AVIF/WebP, 30-day cache | Smaller images, fewer re-downloads |
| **Static assets** | Immutable 1-year cache | `_next/static/*` never re-fetched |
| **PWA caching** | Service Worker | Offline support, faster repeat visits |
| **Preconnect** | Supabase URL in `<head>` | Faster initial API connection |

---

## 11. Deployment & DevOps

| Aspect | Details |
|--------|---------|
| **Hosting** | Vercel (serverless functions) |
| **CI** | GitHub Actions — typecheck + lint on every PR |
| **Pre-commit** | Husky + lint-staged (ESLint + Prettier) |
| **Database** | Supabase hosted (PostgreSQL 15+) |
| **Storage** | Cloudflare R2 (S3-compatible, free egress) |
| **DNS** | Vercel-managed |
| **PWA** | Service Worker + web manifest |
| **Monitoring** | Vercel Analytics (implied) |

---

## 12. Common Interview Questions & Answers

### "Walk me through the architecture."

> ConnectToCampus is a Next.js 15 App Router application with a Supabase backend. The frontend is entirely client-side rendered (`'use client'`). The middleware handles session refresh and route protection. API routes verify auth via request cookies, then use a service-role client to bypass RLS for writes. The database has 55 migrations covering everything from user profiles to AI embeddings. The AI system uses a RAG pipeline with Gemini for embeddings and completions, with Groq/OpenRouter as fallbacks.

### "How does authentication work?"

> We use Supabase Auth with Google OAuth. The session is stored in httpOnly cookies (`sb-<project-ref>-auth-token`). The middleware creates a Supabase server client on every request to refresh the access token. For public routes, this is fire-and-forget (non-blocking). API routes read cookies directly from `request.cookies` to verify the user, then use a service-role client for database writes.

### "How do you handle authorization?"

> Three-tier system: platform_admin, campus_admin, community_admin. Admin grants are stored in the `admin_grants` table and fetched via the `my_admin_grants` RPC. RLS policies on every table enforce data access. Content categories have per-role permissions controlling who can post what scope (campus, college_network, global).

### "How does the AI Brain work?"

> It's a RAG (Retrieval-Augmented Generation) system. Users upload notes → we extract text (OCR via Gemini Vision for images) → chunk into 300-word segments → embed with Gemini text-embedding-001 (768 dims) → store in pgvector. When a student asks a question, we embed the query, do cosine similarity search, retrieve relevant chunks + student memories + chat history, build a prompt, and stream the response via Gemini with automatic fallback to Groq/OpenRouter.

### "How do you handle real-time features?"

> We use Supabase's realtime capabilities for some features, and polling for others. Notifications poll every 60s (10s on messages page). Messages use Supabase Realtime subscriptions. The multiplayer games use a polling-based approach with room health checks.

### "How do you handle file uploads?"

> Files go to Cloudflare R2 (S3-compatible). The flow: client sends FormData → API route validates file type/size → uploads to R2 with presigned URLs → stores metadata in Supabase. We support PDF, DOC, DOCX, PPT, images, and text files up to 50MB.

### "How do you handle rate limiting?"

> Postgres-backed via the `check_rate_limit` RPC. This is consistent across all Vercel serverless instances (unlike in-memory rate limiting which resets per instance). Fail-open design — if the DB errors, we allow the request rather than locking users out.

### "What would you improve?"

> 1. **Convert to Server Components** — Most pages are client-side only. Moving data fetching to server components would improve initial load time significantly.
> 2. **Add proper caching** — Use `React.cache` and Next.js `revalidate` for frequently-accessed data.
> 3. **Implement proper streaming** — Use React Suspense boundaries for progressive page loading.
> 4. **Add E2E tests** — Currently no test files. Cypress or Playwright for critical flows.
> 5. **Bundle optimization** — The `@aws-sdk` packages are huge. Could use dynamic imports or lighter alternatives.

### "How do you handle the gamification system?"

> Karma points are tracked via an immutable `reputation_ledger` table. Every action (posting, commenting, uploading notes, solving DSA problems) calls an RPC like `reward_note_upload` which atomically inserts a ledger entry and updates the profile's `karma_points`. Streaks track consecutive daily activity. Badges are awarded based on thresholds. DSA problems have a separate scoring system with difficulty multipliers and speed bonuses.

### "Tell me about the multiplayer games."

> QuickMath is a real-time multiplayer math quiz. Players create/join rooms via 6-digit codes. The game has 10 rounds with timed questions (20s easy, 15s medium, 10s hard). Scoring: 100 base points + speed bonus (up to 50 points). The system uses Supabase Realtime for room state synchronization. Max 100 players per room. The code editor uses CodeMirror for DSA submissions with multi-language support.

### "How do you handle the posting permission system?"

> It's a role-based + category-based system. `content_permissions` table maps actor types (student, campus_admin, etc.) to categories with a `max_scope` (campus, college_network, global). The `can_create_post` RPC checks if a user has permission for a given category + scope. The `list_creatable_categories` RPC returns what the user can create. This drives the PostComposer UI — users only see categories they're allowed to post in.

---

## 13. Key Files to Know

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Session refresh, route protection |
| `src/lib/api/middleware.ts` | `requireAuth`, `requireAdmin`, `requireAuthLite` |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client |
| `src/lib/brain.ts` | AI RAG pipeline |
| `src/lib/permissions.ts` | Admin context + post permissions |
| `src/lib/rateLimit.ts` | Postgres rate limiter |
| `src/lib/featureFlags.ts` | Feature flag system |
| `src/components/Layout.tsx` | App shell (sidebar + nav) |
| `src/app/feed/page.tsx` | Main feed (parallel data fetching) |
| `src/app/api/notes/submit/route.ts` | Notes submission (auth pattern) |
| `src/types/index.ts` | All TypeScript types |
| `next.config.ts` | Image optimization, caching headers |

---

## 14. Metrics & Scale

| Metric | Value |
|--------|-------|
| **Database migrations** | 55 |
| **API routes** | 15+ route handlers |
| **Pages/routes** | 40+ |
| **Components** | 27 shared + per-page |
| **AI models used** | 4 (Gemini embed, Gemini flash, Groq, Grok) |
| **External services** | Supabase, Cloudflare R2, Gemini, Groq, OpenRouter |
| **TypeScript coverage** | Full (no JS files in src/) |
| **Git commits** | 100+ |

---

## 15. Quick Reference — What to Say When Asked

| Question | One-liner |
|----------|-----------|
| "What's the stack?" | "Next.js 15, React 19, Supabase (PostgreSQL + Auth), Cloudflare R2, Gemini AI, deployed on Vercel" |
| "How's auth handled?" | "Supabase Auth with Google OAuth, httpOnly cookies, middleware refreshes tokens, API routes verify via request.cookies" |
| "How's the DB structured?" | "55 migrations, RLS on every table, RPC functions for business logic, pgvector for AI embeddings" |
| "How does the AI work?" | "RAG pipeline: upload → chunk → embed → vector search → Gemini completion with Groq/OpenRouter fallback" |
| "What's the hardest problem you solved?" | "The auth cookie issue — middleware's fire-and-forget pattern meant API routes couldn't use cookies() from next/headers, had to read request.cookies directly" |
| "How do you handle permissions?" | "Three-tier admin system with RLS policies + RPC-based permission checks for content creation" |
| "What about security?" | "RLS on every table, service role only in server-side API routes, security headers, rate limiting via Postgres RPC" |
