/**
 * AI Admin Copilot — Gemini moderation helpers.
 *
 * Uses the same `completeText` transport as the AI Brain (Gemini 2.5 Flash
 * with JSON mode). Verdicts are parsed defensively: a Gemini failure NEVER
 * blocks content — callers treat `reviewContent` errors as "allow".
 */

import { completeText } from '@/lib/brain'

export interface AiVerdict {
  /** true = should be held/removed */
  flagged: boolean
  /** e.g. ['harassment', 'spam', 'nsfw'] */
  categories: string[]
  /** low | medium | high */
  severity: string
  /** human-readable explanation for the admin + author */
  reason: string
  /** suggested action */
  action: 'allow' | 'hold' | 'remove'
}

export const ALLOW_VERDICT: AiVerdict = {
  flagged: false,
  categories: [],
  severity: 'low',
  reason: '',
  action: 'allow',
}

const SYSTEM_PROMPT = `You are ConnectMyCampus's AI content moderator for a college student community.
Review the content and decide whether it violates campus community rules.

RULES — content is NOT allowed when it contains:
- harassment, hate speech, personal attacks, or bullying
- explicit sexual content (NSFW)
- spam, scams, phishing, or promotion of illegal activity
- academic dishonesty that endangers others (e.g. selling exam papers)
- doxxing (sharing private personal info like phone numbers, addresses)
- dangerous/harmful advice

Content IS allowed when it is:
- casual college chat, memes, humor, opinions, or debate (even heated)
- notes/study help, event promos, club announcements, internships, Q&A
- complaints about food/hostel/faculty (constructive venting is fine)

Output ONLY valid JSON with exactly these keys:
- "flagged": true if the content violates any rule
- "categories": array of violated rule names (empty when not flagged)
- "severity": "low" | "medium" | "high"
- "reason": one short sentence explaining the decision
- "action": "allow" | "hold" | "remove" ("hold" for low/medium, "remove" for high)
No markdown, no explanations.`

/** Review a piece of content. Throws on transport failure (caller decides fallback). */
export async function reviewContent(text: string, contentType: string): Promise<AiVerdict> {
  const user = `Content type: ${contentType}\n\nContent:\n"""\n${text.slice(0, 2500)}\n"""\n\nVerdict:`
  const raw = await completeText(SYSTEM_PROMPT, user, { jsonMode: true, temperature: 0.1, maxTokens: 400 })
  return parseVerdict(raw)
}

/** Defensive parse — never throw on bad model output. */
export function parseVerdict(raw: string): AiVerdict {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      const flagged = !!obj.flagged
      const action = obj.action === 'remove' ? 'remove' : obj.action === 'hold' ? 'hold' : 'allow'
      return {
        flagged,
        categories: Array.isArray(obj.categories) ? obj.categories.map(String).slice(0, 6) : [],
        severity: ['low', 'medium', 'high'].includes(obj.severity) ? obj.severity : 'low',
        reason: String(obj.reason || '').slice(0, 400),
        action: flagged ? (action === 'allow' ? 'hold' : action) : 'allow',
      }
    }
  } catch {
    // fall through
  }
  return { ...ALLOW_VERDICT }
}

/** Human summary of the open queue for the admin dashboard digest. */
export async function summarizeQueue(items: { type: string; preview: string; reason: string }[]): Promise<string> {
  if (!items.length) return 'The moderation queue is empty. Nothing to do — great community! 🎉'
  const list = items
    .slice(0, 40)
    .map((i, n) => `${n + 1}. [${i.type}] ${i.preview.slice(0, 140)}${i.preview.length > 140 ? '…' : ''} — reason: ${i.reason || 'n/a'}`)
    .join('\n')

  const prompt = `You are the AI Admin Copilot for a college community app. Here is the open moderation queue. Write a short, friendly digest for the admin: 2-4 bullet points covering what's most common, what needs urgent attention, and any suggestions (e.g. "3 spam posts look like the same account — consider a quick ban"). Keep it under 120 words.\n\nQUEUE:\n${list}`
  return completeText('You are a concise, helpful admin copilot. Output only the digest, no preamble.', prompt, {
    temperature: 0.3,
    maxTokens: 400,
  })
}
