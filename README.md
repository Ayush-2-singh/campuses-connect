# 🎓 ConnectMyCampus

**Predict the skills. Train the students. Place the best.**

> Built with Next.js 15, Supabase, Tailwind CSS, deployed on Vercel.

---

## 🔥 The Problem

India's campus hiring is broken:

| Stat | Number | Source |
|------|--------|--------|
| Undergraduates unplaced | **84%** | Unstop Talent Report 2026 |
| Interview conversion rate | **2-3%** | CareerHelp 2026 |
| Youth unemployment | **13.8%** | PeopleMatters 2026 |
| Applications per job (doubled since 2022) | **200+** | Times of India 2026 |
| Students expecting ₹5LPA+ | **73%** | Unstop 2026 |
| Students actually getting ₹5LPA+ | **40%** | Unstop 2026 |

**Unstop has 30M students. Scaler trains 10K/year. Masai recovered from a model crash.**
Yet **84% students are still unplaced.** Existing platforms are failing the majority.

---

## 💡 The Solution

**Skill Prediction + Training + Direct Placement Pipeline**

```
10,00,000 students
    ↓ "Ye skills 3 months baad companies puchegi — seekh lo"
50 interview
    ↓ Top performers get direct company access
20 shortlist
    ↓ Pre-screened, trained, ready
2 selected
    ↓ "Platform kaam karta hai" — social proof = viral
```

**How it works:**

1. **Skill Forecast Engine** — scrape LinkedIn, Naukri, GitHub, Glassdoor data to predict which skills companies will need in 3 months
2. **Training Bootcamp** — 3-month intensive program on predicted high-demand skills (DSA, System Design, AI/ML, React etc)
3. **Company Pipeline** — pre-screened candidates directly introduced to hiring managers
4. **Social Proof Loop** — 2 placements per cycle → "Dekho inka platform kaam karta hai" → more students join

---

## 📊 The Funnel

| Stage | Users | What Happens |
|-------|-------|-------------|
| **Awareness** | 10,00,000 | Content marketing: skill reports, YouTube, Reddit, WhatsApp groups |
| **Engagement** | 50,000 | Free skill assessment, "Tumhara current level: 3/10" |
| **Commitment** | 5,000 | Paid bootcamp (₹5K-10K), daily DSA + project challenges |
| **Interview** | 50 | Top performers get mock interviews + direct company intro |
| **Shortlist** | 20 | Companies review pre-screened profiles |
| **Placement** | 2 | Selected candidates start jobs |

---

## 💰 Revenue Model

| Stream | Price | Who Pays |
|--------|-------|----------|
| Skill Reports | Free | Students (acquisition) |
| Skill Assessment | ₹199 | Students |
| 3-Month Bootcamp | ₹5,000-10,000 | Students |
| Company Access (pre-screened talent) | ₹50K-2L per batch | Companies |
| Premium Analytics | ₹499/month | Students |

**Per Cycle (3 months):** ₹75-80 Lakh revenue
**Per Year (4 cycles):** ₹3-3.2 Crore
**Annual Cost:** ₹90 Lakh
**Profit:** ₹2.1-2.3 Crore/year ✅

---

## 🔍 Skill Prediction Engine

**Data Sources (all free/public):**

| Source | What It Gives |
|--------|---------------|
| LinkedIn Job Postings | Which skills companies are hiring for NOW |
| Naukri/Internshala | Trending skills, salary data |
| GitHub Trending | What's being built in the industry |
| Google Trends | Search demand for skills |
| Glassdoor | Interview questions companies ask |
| Company Earnings Calls | "We're hiring for AI/ML" signals |

**Logic:** If a skill's demand grows 20%+ per month → "HIGH DEMAND IN 3 MONTHS"

---

## 🏆 Why This Beats Existing Platforms

| Factor | Unstop/Scaler/Masai | ConnectMyCampus |
|--------|---------------------|---------------|
| Focus | Generic hiring/training | **Skill prediction + targeted training** |
| Model | Mass market, low conversion | **Scarcity = premium, high conversion** |
| Value | "We have jobs" | **"We KNOW what jobs are coming"** |
| Proof | 84% still unplaced | **Direct pipeline: 50 → 2** |
| Revenue | Subscription/commission | **Bootcamp + company access** |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| AI | Google Gemini API |
| Deployment | Vercel |
| PWA | Service Worker, Web App Manifest |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm/yarn/pnpm
- Supabase account (free tier works)
- Google Gemini API key (for AI Brain)

### Installation

```bash
git clone https://github.com/Ayush-2-singh/campuses-connect.git
cd campuses-connect
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase keys
npm run dev
```

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
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
│   │   ├── brain/             # AI Brain assistant
│   │   ├── notes/             # Notes library
│   │   ├── compete/           # DSA arena
│   │   ├── leaderboard/       # Rankings
│   │   ├── companies/         # Company profiles
│   │   ├── jobs/              # Job listings
│   │   ├── connections/       # Network
│   │   ├── messages/          # Real-time chat
│   │   ├── events/            # Events & hackathons
│   │   ├── profile/           # User profiles
│   │   ├── admin/             # Admin panel
│   │   ├── auth/              # Authentication
│   │   └── api/               # API routes
│   ├── components/            # Reusable React components
│   ├── lib/                   # Utility functions
│   └── types/                 # TypeScript types
├── supabase/
│   └── migrations/           # Database migrations (001-040)
├── public/
│   ├── sw.js                 # Service worker (PWA)
│   └── manifest.json         # PWA manifest
└── package.json
```

---

## 🚀 Deployment

```bash
npm run build
npm start
```

Deployed on **Vercel** with automatic deployments from `main` branch.

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
