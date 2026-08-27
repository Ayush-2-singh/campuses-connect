# 🎓 CampusConnect

**The all-in-one campus platform** — where students connect, compete, collaborate, and grow together.

> Built with Next.js 15, Supabase, Tailwind CSS, and deployed on Vercel.

---

## 📋 Changelog

| Date | Change | Details |
|------|--------|---------|
| Aug 2026 | **N+1 query fixes** | Events & Connections batch attendee/unread counts |
| Aug 2026 | **AI Brain premium gating** | Free users see upgrade prompt, premium gets full access |
| Aug 2026 | **Middleware optimization** | Skip getUser() for 90% of public routes |
| Aug 2026 | **Feature flags caching** | localStorage cache (5 min TTL) — 95% fewer DB queries |
| Aug 2026 | **Feed pagination** | Load More button — 30 posts per page |
| Aug 2026 | **Events campus filter** | Students see only their campus events |
| Aug 2026 | **ThemeToggle dedup** | Removed duplicate toggle from 6 pages |
| Aug 2026 | **PostCard optimization** | Replaced 11 dynamic imports with static import |
| Aug 2026 | **Error boundaries** | Reusable component + Next.js error.tsx for all major pages |
| Aug 2026 | **Messages Realtime fix** | Removed redundant 8s polling — Realtime handles live updates |
| Aug 2026 | **Saved page fix** | Fixed stale closure causing failed initial query |
| Aug 2026 | **Compete error handling** | Added try/catch to prevent silent crashes |
| Aug 2026 | **Polls optimization** | Per-poll vote loading instead of full table scan |
| Aug 2026 | **Global pagination** | Load More for global feed |
| Aug 2026 | **Talent search debounce** | 300ms debounce — 5x fewer DB queries |
| Aug 2026 | **Skeleton loaders** | Professional shimmer loading across all pages |
| Aug 2026 | **Error handling** | try/catch on all page loads and actions |
| Aug 2026 | **Lost&Found UX** | Admin hint for regular users |
| Aug 2026 | **Security headers** | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Aug 2026 | **Navigation prefetch** | Pages prefetch on hover for instant navigation |
| Aug 2026 | **Asset caching** | Images cached 30 days, public assets 7 days |
| Aug 2026 | **Pull-to-refresh** | Mobile gesture component for feed pages |

---

## 🌟 What is CampusConnect?

CampusConnect is a **full-featured campus management and social platform** that brings together everything a student needs — from academic tools to social networking, from job hunting to AI-powered learning. Think of it as your college's own LinkedIn + Discord + LeetCode + Course Hero — all in one place.

---

## 📱 Features Overview

### 🏠 1. Smart Feed (Home)
- **Personalized campus feed** with category filters (Academics, Social, Events, Notes, Compete, Tech)
- **Global Feed** — see posts from all campuses across the country
- **Post composer** — create text posts with rich formatting
- **Like, comment, share, save** — full interaction system
- **Trending posts** — discover what's hot on campus
- **Content visibility controls** — campus-only or global reach

### 🧠 2. AI Brain
- **Personal academic memory** — upload your notes and ask AI anything
- **Smart Q&A** — get instant answers from your study material
- **Context-aware responses** — AI understands your course, semester, and subjects
- **Powered by Google Gemini** — cutting-edge AI at your fingertips

### 📝 3. Notes Library
- **Subject-wise notes** organized by branch, semester, and subject
- **PYQs (Previous Year Questions)** — browse and download
- **Study materials** — share resources with your batch
- **Ratings & reviews** — students rate notes quality
- **Upload & share** — contribute to the community

### 🏆 4. Compete (DSA Arena)
- **Daily DSA challenges** — solve problems, climb the leaderboard
- **Campus Clash** — compete against other campuses
- **Weekly contests** — timed challenges with rankings
- **Problem tracker** — track your progress across Easy/Medium/Hard
- **College rankings** — see which campus dominates DSA

### 📊 5. Leaderboard
- **4 tabs**: 🏆 Overall | 🐙 GitHub | 🧩 LeetCode | ⭐ Karma
- **Combined score** = Karma×1 + Contributions×0.5 + LeetCode×0.3 + Rating×0.2 + Streak×2
- **Integration stats** — shows your connected GitHub & LeetCode profiles
- **Weekly & all-time** rankings

### 💼 6. Company & Recruiter Portal
- **Company profiles** — Google, Microsoft, Amazon, Apple, Meta, Flipkart, etc.
- **Job postings** — internships, full-time, remote, PPO
- **Apply directly** — submit applications with cover notes
- **Application tracker** — Applied → Shortlisted → Interview → Offer pipeline
- **Interview experiences** — verified student reviews with tips & difficulty ratings
- **Follow companies** — get notified of new openings

### 🔗 7. Integrations
- **GitHub Integration** — connect your GitHub profile
  - Auto-fetch repos, contributions, languages, top projects
  - Contribution graph displayed on profile
- **LeetCode Integration** — connect your LeetCode profile
  - Auto-fetch solved problems (Easy/Medium/Hard)
  - Contest rating, recent solves, streak data
- **Sync anytime** — refresh data with one click

### 💬 8. Connections (LinkedIn-style Network)
- **Send connection requests** — build your professional network
- **Accept/reject requests** — manage your connections
- **Real-time messaging** — chat with connections instantly
- **Connection suggestions** — discover people from your campus
- **Activity feed** — see what your connections are up to

### 📨 9. Messages
- **Real-time chat** — powered by Supabase Realtime
- **Group conversations** — chat with multiple people
- **Read receipts** — see when messages are read
- **Message requests** — accept/reject DMs from non-connections
- **Online status** — see who's online now

### 📅 10. Events & Hackathons
- **Campus events** — workshops, seminars, fests
- **Hackathon listings** — find and register for hackathons
- **Event memories** — photos and recaps from past events
- **RSVP system** — mark attendance, get reminders

### 🗳️ 11. Campus Polls
- **Create polls** — ask your campus anything
- **Vote & discuss** — see real-time results
- **Poll categories** — academics, social, campus life

### 👥 12. Communities
- **Global communities** — DSA, Web Dev, Startups, AI/ML, Design
- **Join & participate** — share knowledge, ask doubts
- **Community leaders** — top contributors get recognition

### 🤝 13. Find Teammates
- **Hackathon team formation** — find teammates with complementary skills
- **Skill matching** — based on your profile skills
- **Team creation** — form teams and manage members

### 📚 14. Ask a Senior
- **Doubt solving** — get help from seniors in your college
- **Verified seniors** — trusted answers from experienced students
- **Category-wise** — branch, semester, topic filters

### 🎯 15. Talent Discovery
- **Discover students** by skill — find collaborators for projects
- **Skill-based search** — React, Python, DSA, Design, etc.
- **Portfolio showcase** — see projects, GitHub, achievements

### 🧳 16. Travel Buddies
- **Find campus mates** on the same route
- **Shared rides** — save money, travel together
- **Route matching** — auto-suggest travel partners

### 🔍 17. Lost & Found
- **Report lost items** — help find your stuff
- **Return found items** — be a good samaritan
- **Status tracking** — claimed/unclaimed updates

### 📌 18. Saved Posts
- **Bookmark posts** — save for later reading
- **Organized collection** — access your saved content anytime

### 📊 19. Weekly Wrap
- **Weekly digest** — summary of campus activity
- **Top posts, events, achievements** — catch up in one view
- **Personalized stats** — your weekly activity summary

### 🏅 20. Badges & Streak Rewards
- **17 badges** across 5 tiers:
  - 🥉 Bronze: 3-day streak, 10 posts, 25 comments, 100 karma
  - 🥈 Silver: 7-day streak, 50 posts, 100 comments, 500 karma
  - 🥇 Gold: 14-day streak, 100 posts, 1000 karma
  - 💎 Platinum: 30-day streak
  - 👑 Diamond: 100-day streak
- **30-day activity calendar** — green squares for active days
- **Feature unlocks** — badges unlock platform features
- **Streak tracking** — daily login streaks with milestones

### ⏰ 21. Smart Reminders
- **Deadline reminders** — hackathon, assignment, exam deadlines
- **Event reminders** — never miss campus events
- **Streak reminders** — maintain your daily streak
- **Goal reminders** — custom reminders for personal goals
- **Recurring reminders** — daily, weekly, monthly
- **Push notifications** — get notified in real-time

### 🔔 22. Push Notifications
- **Real-time notifications** — instant updates
- **Push subscription** — browser push notifications
- **Smart prioritization** — important notifications first
- **Customizable** — choose what notifications you receive

### 📡 23. Offline Mode (PWA)
- **Works offline** — access cached pages without internet
- **Service worker** — pre-caches key pages
- **Stale-while-revalidate** — fresh content when online
- **Offline fallback** — graceful degradation
- **Install as app** — add to home screen on mobile/desktop

### 👤 24. Student Profiles
- **Comprehensive profiles** — bio, skills, links, social media
- **Activity history** — posts, comments, achievements
- **Integration stats** — GitHub contributions, LeetCode solved
- **Skill endorsements** — get endorsed by peers
- **Privacy controls** — control who sees what

### 🏫 25. Campus Change with ID Verification
- **Request campus change** — select new campus from dropdown
- **Upload ID card** — JPEG, PNG, WebP, or PDF (max 5MB)
- **AI verification score** — auto-checks file type, resolution, filename
- **Admin review** — approve/reject with reason from admin panel
- **30-day cooldown** — wait 30 days between changes
- **Max 3 changes per year** — prevents abuse
- **Request tracking** — see status, AI score, rejection reasons

### 🎓 26. Student Onboarding
- **Guided onboarding** — smooth first-time experience
- **Profile setup** — branch, year, skills, interests
- **Interest selection** — personalize your feed from day one

### 🛡️ 27. Admin Panel
A comprehensive platform management dashboard:

#### 📊 Analytics Dashboard
- **Real-time metrics** — users, posts, reactions, comments, views
- **Growth charts** — 30-day user & post growth
- **Activity heatmap** — peak hours visualization
- **Top posts** — ranked by engagement
- **Top colleges** — ranked by activity
- **Feature usage** — track which features are popular

#### ⚡ Feature Flags
- **21 pre-seeded features** — toggle any feature on/off instantly
- **Categories**: Core, Social, Academics, Tools
- **Custom features** — add new features from the UI
- **Instant生效** — no deploy needed, changes apply immediately

#### ⚙️ Platform Settings
- **14 configurable settings** — platform name, tagline, maintenance mode
- **Boolean toggles** — quick on/off switches
- **Text/number editors** — inline editing with save
- **Categories**: General, Appearance, Security, AI

#### 📋 Audit Log
- **Every admin action** is automatically logged
- **Filter by action type** — toggle, update, delete, etc.
- **Full traceability** — who did what and when

#### 👥 User Management
- **View all users** — search, filter, sort
- **Role management** — assign/remove platform_admin
- **User details** — karma, posts, connections, activity

#### 📝 Content Moderation
- **Report queue** — review flagged content
- **Auto-moderation** — spam detection
- **Action buttons** — dismiss, warn, remove, ban

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS, Framer Motion |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **AI** | Google Gemini API |
| **Deployment** | Vercel |
| **PWA** | Service Worker, Web App Manifest |
| **Version Control** | Git, GitHub |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm/yarn/pnpm
- Supabase account (free tier works)
- Google Gemini API key (for AI Brain)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ayush-2-singh/campuses-connect.git
cd campuses-connect

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase keys

# Run development server
npm run dev
```

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI (Google Gemini)
GOOGLE_AI_API_KEY=your_gemini_key
```

### Database Setup

1. Go to Supabase Dashboard → SQL Editor
2. Run all migration files from `supabase/migrations/` in order
3. The latest migration (040) includes all tables and functions

---

## 📁 Project Structure

```
campus-connect/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── feed/              # Campus feed
│   │   ├── global/            # Global cross-campus feed
│   │   ├── brain/             # AI Brain assistant
│   │   ├── notes/             # Notes library
│   │   ├── compete/           # DSA arena
│   │   ├── leaderboard/       # Rankings
│   │   ├── companies/         # Company profiles
│   │   ├── jobs/              # Job listings
│   │   ├── applications/      # Application tracker
│   │   ├── experiences/       # Interview experiences
│   │   ├── integrations/      # GitHub & LeetCode
│   │   ├── connections/       # Network (LinkedIn-style)
│   │   ├── messages/          # Real-time chat
│   │   ├── events/            # Events & hackathons
│   │   ├── polls/             # Campus polls
│   │   ├── communities/       # Communities
│   │   ├── teams/             # Find teammates
│   │   ├── ask/               # Ask a senior
│   │   ├── talent/            # Talent discovery
│   │   ├── travel/            # Travel buddies
│   │   ├── lost-found/        # Lost & found
│   │   ├── saved/             # Saved posts
│   │   ├── weekly/            # Weekly wrap
│   │   ├── badges/            # Streak rewards
│   │   ├── reminders/         # Smart reminders
│   │   ├── notifications/     # Notifications
│   │   ├── profile/           # User profiles
│   │   ├── college/           # College pages
│   │   ├── onboarding/        # Student onboarding
│   │   ├── admin/             # Admin panel
│   │   │   └── analytics/     # Analytics dashboard
│   │   ├── auth/              # Authentication
│   │   └── api/               # API routes
│   ├── components/            # Reusable React components
│   │   ├── ui/               # UI primitives
│   │   ├── feed/             # Feed components
│   │   ├── notes/            # Notes components
│   │   └── ...
│   ├── lib/                   # Utility functions
│   │   ├── supabase/         # Supabase client
│   │   └── featureFlags.ts   # Feature flag utilities
│   └── types/                 # TypeScript types
├── supabase/
│   └── migrations/           # Database migrations (001-040)
├── public/
│   ├── sw.js                 # Service worker (PWA)
│   └── manifest.json         # PWA manifest
└── package.json
```

---

## 🎯 Key Highlights

### For Students
- ✅ **One platform for everything** — no need for 10 different apps
- ✅ **AI-powered learning** — ask your notes anything
- ✅ **Compete & grow** — DSA challenges, leaderboards, badges
- ✅ **Job ready** — company portal, application tracker, interview prep
- ✅ **Stay connected** — real-time messaging, connections, events
- ✅ **Works offline** — access content without internet
- ✅ **Personalized** — smart feed, reminders, notifications

### For Admins
- ✅ **Full control** — toggle features, manage settings, all from UI
- ✅ **Real-time analytics** — growth, engagement, heatmaps
- ✅ **Audit trail** — every action logged
- ✅ **No code changes needed** — feature flags for instant updates
- ✅ **Content moderation** — automated + manual tools

---

## 📊 Database

- **40 migration files** — comprehensive schema
- **30+ tables** — users, posts, events, jobs, integrations, etc.
- **20+ RPC functions** — optimized database operations
- **Row Level Security (RLS)** — every table secured
- **Real-time subscriptions** — live updates for chat & notifications

---

## 🌐 Routes

| Route | Page |
|-------|------|
| `/` | Home feed |
| `/global` | Global feed (all campuses) |
| `/brain` | AI Brain assistant |
| `/notes` | Notes library |
| `/compete` | DSA arena |
| `/leaderboard` | Rankings |
| `/companies` | Company profiles |
| `/jobs` | Job listings |
| `/jobs/[id]` | Job detail & apply |
| `/applications` | Application tracker |
| `/experiences` | Interview experiences |
| `/integrations` | GitHub & LeetCode |
| `/connections` | Your network |
| `/messages` | Chat inbox |
| `/messages/[id]` | Conversation |
| `/events` | Events & hackathons |
| `/polls` | Campus polls |
| `/communities` | Communities |
| `/teams` | Find teammates |
| `/ask` | Ask a senior |
| `/talent` | Talent discovery |
| `/travel` | Travel buddies |
| `/lost-found` | Lost & found |
| `/saved` | Saved posts |
| `/weekly` | Weekly wrap |
| `/badges` | Streak rewards |
| `/reminders` | Smart reminders |
| `/notifications` | Notifications |
| `/profile/[id]` | User profile |
| `/college/[id]` | College page |
| `/campus-change` | Campus change request |
| `/admin` | Admin panel |
| `/admin/analytics` | Analytics dashboard |
| `/more` | More options menu |

---

## 🚀 Deployment

The app is deployed on **Vercel** with automatic deployments from `main` branch.

```bash
# Production build
npm run build

# Start production server
npm start
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npx tsc --noEmit` to check for errors
5. Commit with a descriptive message
6. Push and create a Pull Request

---

## 📄 License

This project is for educational purposes. Built with ❤️ for campus communities.

---

## 🙏 Acknowledgments

- **Next.js** — React framework
- **Supabase** — Backend-as-a-service
- **Tailwind CSS** — Utility-first CSS
- **Vercel** — Deployment platform
- **Google Gemini** — AI capabilities
- **Framer Motion** — Animations
