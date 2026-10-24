'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
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
 *  • The hub used to be a stranger's photograph (i.pravatar.cc) captioned
 *    "Full-Stack Developer", and the copy promised to make you a "Top 1% SDE".
 *    That is a bootcamp claim, not this product: the site is round-by-round
 *    interview write-ups, the companies behind them, and the practice that goes
 *    with them. The hub is now a STRUCTURED diagram of a drive's rounds — the
 *    thing the rest of the page is about — and no avatar, stock photo or
 *    third-party image host is loaded on the landing at all.
 *  • Copy now matches the page's own metadata ("Campus placement, round by
 *    round"), so a visitor is told the same thing by the hero and the <title>.
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

function OrbitRing({
  items,
  radius,
  duration,
  reverse = false,
}: {
  items: OrbitItem[]
  radius: number
  duration: number
  reverse?: boolean
}) {
  return (
    <motion.div
      className="orbit-ring"
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
  return (
    <section className="orbit-hero">
      <div className="orbit-copy">
        <span className="orbit-eyebrow">READ · PRACTISE · WRITE</span>
        <h1>
          Campus placement,
          <br />
          <span>round by round.</span>
        </h1>
        <p>
          Read how a drive actually went at your campus, then practise the problems that round asked. Free for Indian
          engineering students.
        </p>
        <div className="orbit-actions">
          <Link href="/experiences" className="orbit-primary">
            Read experiences
            <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/live-voice-chat" className="orbit-secondary">
            Join a room
          </Link>
        </div>
      </div>

      <div className="orbit-visual" aria-label="Rotating technology and company orbits around a drive's rounds">
        {/* Outer orbit: the tech stack (15 marks, so it gets the long
            circumference — crowding them onto the inner ring overlapped the
            labels). */}
        <OrbitRing items={technologies} radius={46} duration={45} />

        {/* Inner orbit: companies (9 marks) stay legible on the short ring. */}
        <OrbitRing items={companies} radius={29} duration={32} reverse />

        {/* Structured hub: the four rounds a drive is read in. */}
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
      </div>
    </section>
  )
}
