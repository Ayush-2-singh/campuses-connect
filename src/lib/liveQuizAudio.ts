'use client'

/**
 * LIVE QUIZ AUDIO — the room's sound.
 *
 * Music is one looping bed for the whole match (waiting, question, pause), so
 * the room never goes silent and the energy stays up. Two sources, in order:
 *
 *   1. `public/audio/live-bed.mp3` if it exists — a track the site owner has the
 *      right to serve. Nothing is bundled with the repository.
 *   2. A synthesised bed otherwise: no assets, no licensing, no network.
 *
 * The old bed had a sub-octave drone and the wrong-answer cue was a sawtooth,
 * which read as an eerie hum under the whole match. Both are gone; what is left
 * is a bright major arpeggio with a soft pulse.
 *
 * Autoplay policy: a context only makes sound after a user gesture, so the
 * context is created lazily and `unlockLiveAudio()` retries from a real tap.
 * The mute preference persists, and nothing can start while muted.
 */

import { useCallback, useEffect, useState } from 'react'

const MUTE_KEY = 'cc-live-audio-muted'

/** Drop a licensed loop here to replace the synthesised bed. */
const BED_URL = '/audio/live-bed.mp3'

// G4 C5 E5 G5 E5 C5 — bright, no minor seconds, no sub-bass drone.
const BED_NOTES = [392.0, 523.25, 659.25, 783.99, 659.25, 523.25]

export type LiveSfx = 'tick' | 'correct' | 'wrong' | 'start' | 'join' | 'podium'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let bedTimer: ReturnType<typeof setTimeout> | null = null
let bedStep = 0
let bedEl: HTMLAudioElement | null = null
let bedFileFailed = false
let bedFilePlaying = false
let bedWanted = false

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

// Every mounted screen has its own `useLiveAudio`, but mute is global: one
// toggle has to silence (and restart) music everywhere on the page.
const muteListeners = new Set<(muted: boolean) => void>()

export function setLiveAudioMuted(muted: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* private mode — the toggle still works for this page */
    }
  }
  if (muted) stopMatchMusic()
  for (const listener of muteListeners) listener(muted)
}

function ensureContext(): AudioContext | null {
  const Ctor = audioCtor()
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
  }
  return ctx
}

function note(
  frequency: number,
  delay: number,
  duration: number,
  type: OscillatorType = 'triangle',
  level = 0.14
): void {
  const c = ensureContext()
  if (!c || !master) return
  const start = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
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
      note(784, 0, 0.07, 'sine', 0.07)
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
      // Triangle, not sawtooth: a buzzer that corrects without startling.
      note(392, 0, 0.14, 'triangle', 0.11)
      note(329.63, 0.12, 0.22, 'triangle', 0.09)
      break
    case 'podium':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.13, 0.32, 'triangle', 0.14))
      break
  }
}

// ── Synthesised bed ───────────────────────────────────────────────────────

function synthStep(): void {
  const f = BED_NOTES[bedStep % BED_NOTES.length]
  bedStep += 1
  note(f, 0, 0.36, 'sine', 0.045)
  note(f * 1.5, 0, 0.28, 'triangle', 0.018)
  // A gentle pulse on the bar, not a drone: it keeps time without humming.
  if (bedStep % 3 === 1) note(130.81, 0, 0.14, 'sine', 0.03)
  bedTimer = setTimeout(synthStep, 560)
}

function startSynthBed(): void {
  if (bedTimer) return
  synthStep()
}

function stopSynthBed(): void {
  if (bedTimer) {
    clearTimeout(bedTimer)
    bedTimer = null
  }
}

// ── Optional licensed file ────────────────────────────────────────────────

function bedElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!bedEl) {
    bedEl = new Audio(BED_URL)
    bedEl.loop = true
    bedEl.preload = 'auto'
    bedEl.volume = 0.4
    bedEl.addEventListener('error', () => {
      // No file (or unplayable) — fall back instead of going silent.
      bedFileFailed = true
      bedFilePlaying = false
      if (bedWanted && !liveAudioMuted()) startSynthBed()
    })
  }
  return bedEl
}

/** Start the match bed. Safe to call repeatedly and from any room state. */
export function startMatchMusic(): void {
  if (liveAudioMuted()) return
  bedWanted = true
  const c = ensureContext()
  if (c?.state === 'suspended') void c.resume()

  const el = bedElement()
  if (el && !bedFileFailed) {
    el.muted = false
    const playing = el.play()
    if (playing) {
      playing
        .then(() => {
          bedFilePlaying = true
          stopSynthBed()
        })
        .catch((err: unknown) => {
          // NotAllowedError means "wait for a gesture", not "missing file".
          if ((err as { name?: string })?.name === 'NotAllowedError') return
          bedFileFailed = true
          startSynthBed()
        })
    }
    return
  }
  startSynthBed()
}

export function stopMatchMusic(): void {
  bedWanted = false
  bedFilePlaying = false
  if (bedEl) {
    bedEl.pause()
    try {
      bedEl.currentTime = 0
    } catch {
      /* not seekable yet */
    }
  }
  stopSynthBed()
}

/** Call from a real user gesture (tap/click) to satisfy autoplay policy. */
export function unlockLiveAudio(): void {
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  // A bed requested before the first gesture could only be refused; retry now.
  if (bedWanted && !bedFilePlaying && !liveAudioMuted()) startMatchMusic()
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
    const apply = (next: boolean) => setMuted(next)
    muteListeners.add(apply)
    setMuted(liveAudioMuted())
    return () => {
      muteListeners.delete(apply)
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !liveAudioMuted()
    setLiveAudioMuted(next)
    if (!next) unlockLiveAudio()
  }, [])

  return { muted: muted ?? true, ready: muted !== null, toggle }
}
