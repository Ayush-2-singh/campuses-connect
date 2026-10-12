# ConnectToCampus — Final Analysis & Go-To-Market

> Data-backed verdict on the business, competitors, economics and the one path
> to start. Sources are linked; where a host blocked fetching, the figure is
> from the search-result snippet and marked *(snippet)*.

## 1. Is the thesis valid? Yes — conditionally

| Signal | Data | Implication |
|---|---|---|
| Tier-2/3 hiring rising | Campus recruitment at tier-2/3 colleges **+30% YoY** (Naukri Campus, snippet) | Growing segment |
| Tier-2/3 is the market | ~85% of engineering grads are from tier-3 colleges (LinkedIn, snippet) | Huge supply pool |
| Mid-tier college pain | Tier-2: **50–75% placement, ₹3–8 LPA** vs Tier-1: 80–90%, ₹12–25 LPA (FutureCareerSchool) | The pain is real and measurable |
| Hiring is going **skills-first** | Bulk fresher hiring drying up; firms now use "specialized **assessments**, hackathons, internship-to-hire" — Crescendo, 2025 | ✅ Validates the screening moat |
| Fee norms | India recruitment agencies: **8.33%–15%** of first-year CTC; entry-level 8.33%–12% (TCS iON, Savannahr, PlugScale) | 8.33% is standard and defensible |
| Marketplace rule | Chicken-and-egg is the #1 marketplace killer; seed supply → **concierge MVP** → liquidity before monetization (NFX, JourneyH, Prometora) | Concierge-first is the correct playbook |

**Condition:** the *generic* version is a graveyard. Only a **narrow, service-led
wedge** works.

## 2. Competitive reality

| Player | Scale | Model | Threat |
|---|---|---|---|
| **Unstop** | ~6M students, 20,000+ colleges, ~$5M raised (Mynavi, Coursera) | Company-paid; contests/hackathons/hiring | High — do not out-community them |
| **Internshala** | Acquired by upGrad (90% stock swap) | Employer-paid internships | High |
| **Superset** | "Placements automation for universities + gateway for employers" | B2B2C | High — closest to the college-tools idea |
| **Naukri / LinkedIn** | Massive | Job boards | Medium |

**Wedge:** verified-skill SWE freshers, delivered **fast as a service** to
startups — not a self-serve job board.

## 3. Unit economics (₹6 LPA entry package)

| Line | Value |
|---|---|
| Mandate fee | ₹5,000 |
| Success fee (8.33% × ₹6L) | ₹50,000 |
| **Revenue per hire** | **₹55,000** |
| Cost per hire | ~₹0 cash (time + free Piston judge + Gemini) |

₹1L/mo = 2 hires · ₹5L/mo = 9 hires · ₹10L/mo = 18 hires. A high-margin service
business, viable at small scale.

## 4. Risks

1. **Cold start** → concierge (you are the marketplace at first).
2. **Collection risk** → mandate fee upfront + signed terms.
3. **Proof gap** → free first batch.
4. **Incumbent copy** → go narrow + fast; they optimise for scale.
5. **Founder dependency** → productize after 3–5 hires.

## 5. Monetization model (locked)

- **Recruiters pay from day 1** — ₹5–10k mandate + 8.33% CTC success fee.
- **Students never pay.**
- **Colleges pay later** (Phase 3) for tools/analytics/NAAC reports — **never** for
  their students' placement priority.
- **Demo hook:** one-time coupon = a **batch of 10 pre-screened students**.

## 6. The way to go

| Phase | When | Do | Code |
|---|---|---|---|
| **0 — Supply** | Weeks 1–2 | 1–2 tier-2/3 colleges → 30–50 students → screen with the judge → top 15–20 in a sheet | None |
| **1 — Concierge capture** | Weeks 2–4 | `/hire` landing + demo-request form → deliver a batch of 10 by hand → Razorpay link on hire | ✅ **done** |
| **2 — Productize** | Month 2–3 | Recruiter console + admin back-office + billing | |
| **3 — Second revenue** | Month 4–6 | "Campus Partner" tier for colleges | |

**Target: 1 paid hire within 30 days.**

## Verdict

- **Good business?** ✅ Validated demand, real pain, standard 8.33% economics,
  skills-first tailwind.
- **Billion-dollar?** Only at scale; realistically a high-margin ₹1–50 Cr business
  first — a strong start.
- **Paid from day 1?** ✅ Mandate + success fee, recruiter-side only.
- **Biggest risk:** cold start → solved by the concierge MVP.
- **One line:** *Concierge-first — pre-vetted SWE freshers → startups,
  recruiter-paid 8.33%, 1 college + 15 founders, `/hire` + payment link, first
  paid hire in 30 days.*

## Sources
- Crescendo, "Why Entry-Level Hiring Is Drying Up in Top Indian Firms" (2025)
- Naukri Campus, FutureCareerSchool, LinkedIn (tier-2/3 stats — snippets)
- TCS iON, Savannahr, PlugScale (India recruitment fee norms — snippets)
- NFX "19 Marketplace Tactics", JourneyH, Prometora (chicken-and-egg / concierge)
- YourStory / LinkedIn (Unstop, Internshala/upGrad) — snippets

**Limitation:** several hosts (PlugScale, Savannahr, Naukri, GetWork, TheHireHub)
blocked direct fetching, so those figures are from search snippets, not full
pages. The strongest fully-read source (Crescendo) supports the screening thesis.
