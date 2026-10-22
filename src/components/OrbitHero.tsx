'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
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
 * OrbitHero — two counter-rotating rings of logos around the student's card.
 *
 * ── Notes on the port ───────────────────────────────────────────────────────
 *  • Radius is expressed in `cqw`, and `.orbit-visual` is a size container
 *    (`container-type: size`). With `%` the translate resolved against the 1px
 *    anchor each badge sits on, so all badges piled into the centre.
 *  • The demo profile is picked AFTER mount. Picking it during render gives the
 *    server and the browser different names and React reports a hydration
 *    mismatch, so the first paint shows a fixed profile and randomises on the
 *    next tick.
 *  • Company and tech lists are props, so the landing can pass its own data.
 */

type OrbitItem = { name: string; Icon: React.ComponentType<{ className?: string }>; color: string }

type OrbitProfile = { name: string; image?: string | null; role?: string | null }

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

const demoProfiles = [
  { name: 'Aarav Sharma', img: 12 },
  { name: 'Priya Verma', img: 47 },
  { name: 'Rahul Singh', img: 13 },
  { name: 'Ananya Gupta', img: 44 },
  { name: 'Arjun Patel', img: 14 },
  { name: 'Aisha Khan', img: 49 },
  { name: 'Rohan Mehta', img: 15 },
  { name: 'Sneha Das', img: 45 },
]

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
              <Icon className="orbit-icon" />
              <span className="orbit-label">{name}</span>
            </motion.div>
          </div>
        )
      })}
    </motion.div>
  )
}

export default function OrbitHero({
  user = null,
  technologies: customTechnologies,
  companies: customCompanies,
}: {
  user?: OrbitProfile | null
  technologies?: OrbitItem[]
  companies?: OrbitItem[]
}) {
  // Deterministic first paint, randomised once the component is on the client.
  const [demo, setDemo] = useState(demoProfiles[0])
  const [me, setMe] = useState<OrbitProfile | null>(user)

  useEffect(() => {
    setDemo(demoProfiles[Math.floor(Math.random() * demoProfiles.length)])
  }, [])

  // Signed-in visitor: show THEIR card, fetched on the client so the landing
  // stays a static page (a server-side session read would make it dynamic for
  // everybody, including the guests it mostly serves).
  useEffect(() => {
    if (user) return
    let cancelled = false
    const load = async () => {
      try {
        const sb = createClient()
        const {
          data: { user: authUser },
        } = await sb.auth.getUser()
        if (!authUser || cancelled) return
        const { data } = await sb
          .from('profiles')
          .select('full_name, username, avatar_url, headline')
          .eq('id', authUser.id)
          .maybeSingle()
        if (cancelled) return
        setMe({
          name: data?.full_name || data?.username || authUser.email?.split('@')[0] || 'Student',
          image: data?.avatar_url ?? null,
          role: data?.headline ?? null,
        })
      } catch {
        /* a guest keeps the demo card */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user])

  const profileName = me?.name || demo.name
  const profileImage = me?.image || `https://i.pravatar.cc/180?img=${demo.img}`

  const techItems = customTechnologies || technologies
  const companyItems = customCompanies || companies

  return (
    <section className="orbit-hero">
      <div className="orbit-copy">
        <span className="orbit-eyebrow">BUILD • LEARN • GROW</span>
        <h1>
          Become the
          <br />
          <span>Top 1% SDE</span>
        </h1>
        <p>
          Master the technologies, build real-world projects, and prepare for opportunities at leading tech companies.
        </p>
        <div className="orbit-actions">
          <Link href="/experiences" className="orbit-primary">
            Read experiences ↗
          </Link>
          <Link href="/live-voice-chat" className="orbit-secondary">
            Join a room
          </Link>
        </div>
      </div>

      <div className="orbit-visual" aria-label="Rotating technology and company orbits">
        {/* Outer company orbit */}
        <OrbitRing items={companyItems} radius={46} duration={45} />

        {/* Inner technology orbit */}
        <OrbitRing items={techItems} radius={29} duration={32} reverse />

        {/* Static center profile */}
        <div className="orbit-profile">
          <div className="orbit-avatar-wrap">
            <img
              src={profileImage}
              alt={`${profileName}'s profile`}
              className="orbit-avatar"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  profileName
                )}&background=e8efff&color=245bdb&size=180`
              }}
            />
            <span className="orbit-online" />
          </div>
          <h2>{profileName}</h2>
          <p>{me?.role || 'Full-Stack Developer'}</p>
        </div>
      </div>
    </section>
  )
}
