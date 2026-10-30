'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient, getBootUser } from '@/lib/supabase/client'
import {
  SiGoogle,
  SiMeta,
  SiApple,
  SiNetflix,
  SiNvidia,
  SiUber,
  SiTcs,
  SiReact,
  SiNextdotjs,
  SiNodedotjs,
  SiJavascript,
  SiTypescript,
  SiPython,
  SiCplusplus,
  SiGithub,
  SiGit,
  SiPostgresql,
  SiMysql,
  SiTailwindcss,
  SiSupabase,
  SiFirebase,
} from 'react-icons/si'
// react-icons v5 dropped a few brand glyphs from the Simple Icons set, so the
// three that went missing are taken from Font Awesome instead of being faked.
import { FaAmazon, FaMicrosoft, FaJava } from 'react-icons/fa6'

import './orbit-hero.css'

/**
 * OrbitHero — two counter-rotating rings around the HUB that names what the
 * product is: a drive, round by round.
 *
 * ── What changed, and why ──────────────────────────────────────────────────
 *  • The middle ring used to carry a dozen OTHER members' photos. A signed-out
 *    visitor has no reason to be shown strangers' faces on a landing page, so
 *    that ring is gone. The hub is now the ONE face this page may show: the
 *    reader's own — their photo if they uploaded one, otherwise a monogram of
 *    their name — and it links to /profile. Signed out, the server-rendered
 *    hub (the drive's four rounds) stays exactly as it was, so the static page
 *    never flickers or shows a placeholder person.
 *  • The hub itself used to be a stranger's photograph (i.pravatar.cc)
 *    captioned "Full-Stack Developer", and the copy promised to make you a
 *    "Top 1% SDE". That is a bootcamp claim, not this product: the site is
 *    round-by-round interview write-ups, the companies behind them, and the
 *    practice that goes with them.
 *
 * ── Notes on the orbit (unchanged) ─────────────────────────────────────────
 *  • Radius is expressed in `cqw`, and `.orbit-visual` is an inline-size
 *    container (`container-type: inline-size`). With `%` the translate resolved
 *    against the 1px anchor each badge sits on, so all badges piled into the
 *    centre.
 *  • Badges are centred with `translate`, not `transform`: framer-motion writes
 *    `transform: rotate()` inline on the counter-rotated badge and would wipe a
 *    `translate(-50%,-50%)` transform.
 *  • No state, no effects, no hydration-sensitive content: the same markup is
 *    painted on the server and in the browser.
 */

type OrbitItem = { name: string; Icon: React.ComponentType<{ className?: string }>; color: string }

const companies: OrbitItem[] = [
  { name: 'Google', Icon: SiGoogle, color: '#4285F4' },
  { name: 'Amazon', Icon: FaAmazon, color: '#232F3E' },
  { name: 'Meta', Icon: SiMeta, color: '#0866FF' },
  { name: 'Apple', Icon: SiApple, color: '#111827' },
  { name: 'Netflix', Icon: SiNetflix, color: '#E50914' },
  { name: 'Microsoft', Icon: FaMicrosoft, color: '#00A4EF' },
  { name: 'NVIDIA', Icon: SiNvidia, color: '#76B900' },
  { name: 'TCS', Icon: SiTcs, color: '#EE3984' },
  { name: 'Uber', Icon: SiUber, color: '#111827' },
]

const technologies: OrbitItem[] = [
  { name: 'React', Icon: SiReact, color: '#61DAFB' },
  { name: 'Next.js', Icon: SiNextdotjs, color: '#111827' },
  { name: 'Node.js', Icon: SiNodedotjs, color: '#339933' },
  { name: 'JavaScript', Icon: SiJavascript, color: '#D6AD00' },
  { name: 'TypeScript', Icon: SiTypescript, color: '#3178C6' },
  { name: 'Python', Icon: SiPython, color: '#3776AB' },
  { name: 'Java', Icon: FaJava, color: '#E76F00' },
  { name: 'C++', Icon: SiCplusplus, color: '#00599C' },
  { name: 'GitHub', Icon: SiGithub, color: '#111827' },
  { name: 'Git', Icon: SiGit, color: '#F05032' },
  { name: 'PostgreSQL', Icon: SiPostgresql, color: '#4169E1' },
  { name: 'MySQL', Icon: SiMysql, color: '#4479A1' },
  { name: 'Tailwind', Icon: SiTailwindcss, color: '#06B6D4' },
  { name: 'Supabase', Icon: SiSupabase, color: '#3ECF8E' },
  { name: 'Firebase', Icon: SiFirebase, color: '#FFCA28' },
]

/** The hub's ladder — the same four-round shape the panels below describe. */
const HUB_ROUNDS = ['R1', 'R2', 'R3', 'R4']

/**
 * The reader, if they are signed in. The landing is cached and served to
 * everyone, so this can only be resolved in the browser AFTER mount — which is
 * also why the hub renders the signed-out diagram on the server and only swaps
 * to the viewer's own face on the client, with no hydration mismatch.
 */
type Viewer = { name: string; avatarUrl: string | null; initial: string }

function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    getBootUser(supabase)
      .then(async (user) => {
        if (!user) return null
        const { data } = await supabase
          .from('profiles')
          .select('full_name, username, avatar_url')
          .eq('id', user.id)
          .maybeSingle()
        const name = String(data?.full_name || data?.username || '').trim() || 'Student'
        return { name, avatarUrl: data?.avatar_url ? String(data.avatar_url) : null, initial: name[0].toUpperCase() }
      })
      .then((profile) => {
        if (!cancelled) setViewer(profile)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return viewer
}

function OrbitRing({
  items,
  radius,
  duration,
  reverse = false,
  className = '',
}: {
  items: OrbitItem[]
  radius: number
  duration: number
  reverse?: boolean
  className?: string
}) {
  return (
    <motion.div
      className={`orbit-ring${className ? ` ${className}` : ''}`}
      // cqw, not %: the radius must resolve against the STAGE, not the 1px anchor.
      style={{ '--orbit-radius': `${radius}cqw` } as CSSProperties}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    >
      {items.map(({ name, Icon, color }, index) => {
        const angle = (index / items.length) * 360

        return (
          <div
            className="orbit-item"
            key={name}
            style={{ '--angle': `${angle}deg`, '--item-color': color } as CSSProperties}
          >
            <motion.div
              className="orbit-badge"
              // Counter-rotate so labels stay upright while the ring turns.
              animate={{ rotate: reverse ? 360 : -360 }}
              transition={{ duration, repeat: Infinity, ease: 'linear' }}
              title={name}
            >
              {/* Decorative: the badge already carries an accessible label
                  in <span class="orbit-label">. react-icons sets role="img",
                  which axe reports as an image without a name. */}
              <Icon className="orbit-icon" aria-hidden="true" />
              <span className="orbit-label">{name}</span>
            </motion.div>
          </div>
        )
      })}
    </motion.div>
  )
}

export default function OrbitHero() {
  const viewer = useViewer()

  return (
    <section className="orbit-hero">
      <div className="orbit-copy">
        <span className="orbit-eyebrow">TOP 1% SDE · GROW TOGETHER</span>
        <h1>
          Become the
          <br />
          <span>Top 1% SDE</span>
        </h1>
        <p>
          Read real interview experiences from Indian campuses — round by round, written by students who cleared them —
          then practise exactly what those rounds asked. Make your own study group and grow together. Free for CSE &amp;
          ECE students.
        </p>
        <div className="orbit-actions">
          <Link href="/experiences" className="orbit-primary">
            Read experiences
            <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/live-voice-chat" className="orbit-secondary">
            Create a group
          </Link>
          {/* The network is the newest surface: put it in the hero instead of
              hiding it in the footer. Guests are sent to login first. */}
          <Link href="/messages" className="orbit-secondary">
            Message a senior
          </Link>
        </div>
      </div>

      <div className="orbit-visual" aria-label="Rotating technology and company orbits around a hub">
        {/* Outer orbit: the tech stack (15 marks, so it gets the long
            circumference — crowding them onto the inner ring overlapped the
            labels). */}
        <OrbitRing items={technologies} radius={46} duration={45} />

        {/* Inner orbit: companies (9 marks) stay legible on the short ring. */}
        <OrbitRing items={companies} radius={29} duration={32} reverse className="orbit-ring--inner" />

        {/* Hub. Signed in: the reader's OWN profile — their uploaded photo, or
            a monogram until they add one. Signed out: the structured diagram of
            a drive's four rounds, which is what this page is about. */}
        {viewer ? (
          <Link className="orbit-hub orbit-hub--viewer" href="/profile" aria-label={`Your profile — ${viewer.name}`}>
            {viewer.avatarUrl ? (
              <img className="orbit-hub-avatar" src={viewer.avatarUrl} alt="" decoding="async" />
            ) : (
              <span className="orbit-hub-initial" aria-hidden="true">
                {viewer.initial}
              </span>
            )}
            <span className="orbit-hub-name">{viewer.name}</span>
            <span className="orbit-hub-sub">Your profile ↗</span>
          </Link>
        ) : (
          <div className="orbit-hub">
            <span className="orbit-hub-label">A drive</span>
            <div className="orbit-hub-rounds" aria-hidden="true">
              {HUB_ROUNDS.map((r) => (
                <span className="orbit-hub-round" key={r}>
                  {r}
                </span>
              ))}
            </div>
            <span className="orbit-hub-sub">round by round</span>
          </div>
        )}
      </div>
    </section>
  )
}
