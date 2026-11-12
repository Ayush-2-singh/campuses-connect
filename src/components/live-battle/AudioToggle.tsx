'use client'

/** Small, shared sound switch for the live quiz screens. */

import { Icon } from '@/components/icons'
import { useLiveAudio } from '@/lib/liveQuizAudio'

export default function AudioToggle() {
  const { muted, ready, toggle } = useLiveAudio()

  return (
    <button
      className="hc-chip"
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      style={{ gap: 6 }}
    >
      <Icon name="volume" size={13} />
      {ready ? (muted ? 'Sound off' : 'Sound on') : 'Sound'}
    </button>
  )
}
