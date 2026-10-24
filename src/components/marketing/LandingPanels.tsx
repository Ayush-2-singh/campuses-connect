import { Icon } from '@/components/icons'

/**
 * LandingPanels — the STRUCTURED visuals on the public landing.
 *
 * Each panel is drawn in the product's own vocabulary (the same rows, tags and
 * window chrome an inner page uses) rather than as illustration: no stock
 * photos, no borrowed screenshots, no invented people. A panel that shows a
 * shape — a drive's rounds, a timed set, a live room — is labelled
 * "Structure" / "Schematic" in its header so it can never be read as live data.
 * Real rows are passed in by the page (see src/app/page.tsx).
 */

type Problem = { title: string; slug: string; difficulty: string | null; topics: string[] | null }

const DIFF_TAG: Record<string, string> = {
  easy: 'hl-tag hl-tag--easy',
  medium: 'hl-tag hl-tag--medium',
  hard: 'hl-tag hl-tag--hard',
}
const tagFor = (difficulty?: string | null) =>
  (difficulty && DIFF_TAG[difficulty.toLowerCase()]) || 'hl-tag hl-tag--type'

/* ── 1. The anatomy of a drive ─────────────────────────────────────────────
   What a write-up records, round by round. It is a map of the format, not a
   claim about any one company's process, so nothing here is a statistic. */
const DRIVE_ROUNDS = [
  { n: '01', name: 'Online assessment', facet: 'the set and the cut-off' },
  { n: '02', name: 'Coding round', facet: 'the problems and the clock' },
  { n: '03', name: 'Technical interview', facet: 'the questions, in order' },
  { n: '04', name: 'HR / culture', facet: 'the pitch and the result' },
]

export function RoundAnatomy() {
  return (
    <figure className="hl-panel hl-anatomy">
      <div className="hl-panel-head">
        <span className="hl-panel-title">
          <Icon name="layers" size={16} />A drive, round by round
        </span>
        <span className="hl-demo">Structure</span>
      </div>

      <ol className="hl-anatomy-list">
        {DRIVE_ROUNDS.map((r) => (
          <li className="hl-anatomy-row" key={r.n}>
            <span className="hl-anatomy-n" aria-hidden="true">
              {r.n}
            </span>
            <span className="hl-anatomy-main">
              <b>{r.name}</b>
              <em>{r.facet}</em>
            </span>
          </li>
        ))}
      </ol>

      <figcaption className="hl-panel-foot">
        Every write-up keeps its own rounds, campus and batch — the same company runs a different process at a different
        college.
      </figcaption>
    </figure>
  )
}

/* ── 2. A timed set, scored ─────────────────────────────────────────────────
   The real problems come from the page; the clock and the pass marks are the
   shape of a set, which is why the header says Schematic. */
export function ArenaPanel({ problems }: { problems: Problem[] }) {
  const rows = problems.slice(0, 4)
  return (
    <figure className="hl-panel hl-arena">
      <div className="hl-panel-head">
        <span className="hl-panel-title">
          <Icon name="zap" size={16} />
          Compete
        </span>
        <span className="hl-demo">Schematic</span>
      </div>

      <div className="hl-arena-clock">
        <span className="hl-arena-clock-l">
          <Icon name="clock" size={14} />
          Saturday clash
        </span>
        <b>60:00</b>
      </div>

      <div className="hl-arena-rows">
        {rows.length > 0 ? (
          rows.map((p, i) => (
            <div className="hl-arena-row" key={p.slug}>
              <span className="hl-arena-dot" data-pass={i < 3 ? 'yes' : 'no'} aria-hidden="true" />
              <span className="hl-arena-name">{p.title}</span>
              <span className={tagFor(p.difficulty)}>{p.difficulty || 'set'}</span>
            </div>
          ))
        ) : (
          <div className="hl-arena-row">
            <span className="hl-arena-dot" aria-hidden="true" />
            <span className="hl-arena-name">Problems appear here as they go live</span>
            <span className={tagFor(null)}>—</span>
          </div>
        )}
      </div>

      <div className="hl-arena-foot">
        <span>Scored on the test cases a solution passes</span>
        <span className="hl-arena-rank">
          <Icon name="trophy" size={13} />
          Ranked
        </span>
      </div>
    </figure>
  )
}

/* ── 3. Inside a live room ─────────────────────────────────────────────────
   Seat tiles, a raised hand and the shared pad — the three surfaces a call has
   beyond the audio. Nobody is named: this is the room's furniture. */
export function RoomPanel() {
  return (
    <figure className="hl-panel hl-room">
      <div className="hl-panel-head">
        <span className="hl-panel-title">
          <Icon name="mic" size={16} />
          Study room
        </span>
        <span className="hl-room-live">
          <i className="hl-live-dot" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="hl-room-seats">
        <span className="hl-room-seat hl-room-seat--on">
          <Icon name="mic" size={15} />
        </span>
        <span className="hl-room-seat hl-room-seat--on">
          <Icon name="headphones" size={15} />
        </span>
        <span className="hl-room-seat is-you">You</span>
        <span className="hl-room-seat hl-room-seat--empty">
          <Icon name="plus" size={15} />
        </span>
      </div>

      <div className="hl-room-hand">
        <Icon name="hand" size={14} />
        Hand raised — next to speak
      </div>

      <div className="hl-room-pad">
        <div className="hl-room-pad-bar">
          <span className="hl-room-pad-lang">Python</span>
          <span className="hl-room-pad-share">shared pad</span>
        </div>
        <pre className="hl-room-pad-code">
          <code>{'for n in nums:\n    if n in seen:\n        return n\n    seen.add(n)'}</code>
        </pre>
      </div>

      <figcaption className="hl-panel-foot">
        Chat, the shared pad and the raised hand live inside the call — the room is the study session.
      </figcaption>
    </figure>
  )
}

/* ── 4. The form a write-up is actually filed with ─────────────────────────
   Labels are the fields; the values are placeholders, which is what makes it
   a diagram of the form rather than a claim about any drive. */
const FORM_FIELDS = [
  { label: 'Company', value: 'the one that ran the drive' },
  { label: 'Role', value: 'SDE intern · full-time' },
  { label: 'Rounds', value: 'OA · coding · technical · HR' },
]

export function WriteUpForm() {
  return (
    <figure className="hl-panel hl-form">
      <div className="hl-panel-head">
        <span className="hl-panel-title">
          <Icon name="pencil" size={16} />
          New write-up
        </span>
        <span className="hl-demo">2 min</span>
      </div>

      <div className="hl-form-rows">
        {FORM_FIELDS.map((f) => (
          <span className="hl-form-field" key={f.label}>
            <span>{f.label}</span>
            <b>{f.value}</b>
          </span>
        ))}
        <span className="hl-form-publish">
          Publish
          <Icon name="send" size={13} />
        </span>
      </div>

      <figcaption className="hl-panel-foot">Campus and batch come from your profile — you write the rounds.</figcaption>
    </figure>
  )
}

/* ── 5. The bento tiles' miniatures ────────────────────────────────────────
   Each tile carries a small piece of the real surface it links to, so the
   artwork is information rather than decoration. */
export function SurfaceMock({ kind }: { kind: 'compete' | 'rooms' | 'experiences' | 'profile' }) {
  if (kind === 'compete') {
    return (
      <span className="hl-mock" aria-hidden="true">
        {[
          { rank: '1', w: '92%' },
          { rank: '2', w: '74%' },
          { rank: '3', w: '58%' },
        ].map((r) => (
          <span className="hl-mock-row" key={r.rank}>
            <span className="hl-mock-rank">{r.rank}</span>
            <span className="hl-mock-bar">
              <i style={{ width: r.w }} />
            </span>
          </span>
        ))}
      </span>
    )
  }

  if (kind === 'rooms') {
    return (
      <span className="hl-mock" aria-hidden="true">
        <span className="hl-mock-seats">
          <span className="hl-mock-seat" />
          <span className="hl-mock-seat" />
          <span className="hl-mock-seat" />
          <span className="hl-mock-seat hl-mock-seat--mut" />
        </span>
        <span className="hl-mock-meta">
          <Icon name="hand" size={12} />1 raised
        </span>
      </span>
    )
  }

  if (kind === 'experiences') {
    return (
      <span className="hl-mock" aria-hidden="true">
        {['Online assessment', 'Coding round', 'Technical'].map((r, i) => (
          <span className="hl-mock-line" key={r}>
            <span className="hl-mock-tick" data-on={i < 2 ? 'yes' : 'no'} />
            {r}
          </span>
        ))}
      </span>
    )
  }

  return (
    <span className="hl-mock" aria-hidden="true">
      <span className="hl-mock-head">
        <span className="hl-mock-ava" />
        <span className="hl-mock-lines">
          <i />
          <i />
        </span>
      </span>
      <span className="hl-mock-chips">
        <i>DSA</i>
        <i>React</i>
        <i>SQL</i>
      </span>
    </span>
  )
}
