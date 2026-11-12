'use client'

/**
 * LIVE QUIZ AUDIO — the room's sound, built from oscillators.
 *
 * There is no audio file anywhere in the app and Kahoot's music is not ours to
 * ship, so every cue here is synthesised with a few WebAudio oscillators: no
 * assets, no licensing, no network, and a few hundred bytes of runtime.
 *
 * Two rules the browser imposes and Kahoot historically got wrong:
 *   • an AudioContext may not make sound until a user gesture, so the context is
 *     created lazily and resumed by `unlockLiveAudio()` from a real tap;
 *   • people need a mute switch, so the preference is persisted and every cue
 *     checks it. Nothing here can start audio while muted.
 *
 * The lobby bed is a soft six-note loop at very low gain — it should feel like
 * a waiting room, not a jingle. Game cues are short and one-shot.
 */

import { useCallback, useEffect, useState } from 'react'

const MUTE_KEY = 'cc-live-audio-muted'

// A quiet room bed: C4 E4 G4 C5 G4 E4, one note every 620ms.
const LOBBY_NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63]

export type LiveSfx = 'tick' | 'correct' | 'wrong' | 'start' | 'join' | 'podium'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let lobbyTimer: ReturnType<typeof setTimeout> | null = null
let lobbyStep = 0

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function liveAudioMuted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setLiveAudioMuted(muted: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* private mode — the toggle still works for this page */
    }
  }
  if (muted) stopLobbyMusic()
}

function ensureContext(): AudioContext | null {
  const Ctor = audioCtor()
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    master = ctx.createGain()
    // Headroom: cues are mixed well below full scale so a quiet laptop is still
    // audible without clipping on the reveal sting.
    master.gain.value = 0.32
    master.connect(ctx.destination)
  }
  return ctx
}

/** Call from a real user gesture (tap/click) to satisfy autoplay policy. */
export function unlockLiveAudio(): void {
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  if (!liveAudioMuted() && !lobbyTimer && c.state === 'running') {
    // No-op if the caller starts the bed itself; harmless otherwise.
  }
}

function note(
  frequency: number,
  delay: number,
  duration: number,
  type: OscillatorType = 'triangle',
  level = 0.16
): void {
  const c = ensureContext()
  if (!c || !master) return
  const start = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  // Exponential ramps need a non-zero floor.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(level, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

export function playLiveSfx(name: LiveSfx): void {
  if (liveAudioMuted()) return
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume()
    return
  }
  switch (name) {
    case 'tick':
      note(880, 0, 0.08, 'square', 0.09)
      break
    case 'join':
      note(523.25, 0, 0.11)
      note(659.25, 0.09, 0.14)
      break
    case 'start':
      note(392, 0, 0.11)
      note(523.25, 0.11, 0.11)
      note(659.25, 0.22, 0.2)
      break
    case 'correct':
      note(659.25, 0, 0.11)
      note(783.99, 0.09, 0.11)
      note(1046.5, 0.18, 0.24)
      break
    case 'wrong':
      note(311.13, 0, 0.16, 'sawtooth', 0.1)
      note(233.08, 0.13, 0.26, 'sawtooth', 0.1)
      break
    case 'podium':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.13, 0.32, 'triangle', 0.14))
      break
  }
}

/** Start the waiting-room bed. Safe to call repeatedly. */
export function startLobbyMusic(): void {
  if (liveAudioMuted()) return
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  if (lobbyTimer) return
  const step = () => {
    const f = LOBBY_NOTES[lobbyStep % LOBBY_NOTES.length]
    lobbyStep += 1
    note(f, 0, 0.44, 'sine', 0.045)
    note(f / 2, 0, 0.7, 'triangle', 0.025)
    lobbyTimer = setTimeout(step, 620)
  }
  step()
}

export function stopLobbyMusic(): void {
  if (lobbyTimer) {
    clearTimeout(lobbyTimer)
    lobbyTimer = null
  }
}

/**
 * Mute state shared by the host panel and the player screen.
 *
 * `muted` is null until the stored preference has been read, so the toggle
 * never renders a wrong label on the first paint.
 */
export function useLiveAudio() {
  const [muted, setMuted] = useState<boolean | null>(null)

  useEffect(() => {
    setMuted(liveAudioMuted())
  }, [])

  const toggle = useCallback(() => {
    const next = !liveAudioMuted()
    setLiveAudioMuted(next)
    setMuted(next)
    if (next) stopLobbyMusic()
    else unlockLiveAudio()
  }, [])

  return { muted: muted ?? true, ready: muted !== null, toggle }
}
