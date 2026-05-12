'use client'

import { useEffect, useState } from 'react'

const SESSION_KEY = 'f1versus-intro-played'
const LIGHT_COUNT = 5
const STEP_MS = 200
// Spec timings (ms from sequence start):
//   0   → light 1 on
//   200 → light 2 on
//   400 → light 3 on
//   600 → light 4 on
//   800 → light 5 on (all red)
//   1100 → green flash begins (80ms)
//   1180 → fade out begins (150ms)
//   1400 → onComplete + sessionStorage flag
const FLASH_AT_MS = 1100
const FLASH_DURATION_MS = 80
const FADE_AT_MS = 1180
const FADE_DURATION_MS = 150
const COMPLETE_AT_MS = 1400

type Phase = 'idle' | 'lighting' | 'go' | 'done'

interface Props {
  // Fires once the sequence (or skip) finishes. The host uses this to
  // reveal the ranking list at full opacity.
  onComplete: () => void
}

// F1 race-start light sequence. Renders once per browser session above
// the ranking list. Respects prefers-reduced-motion. The host owns
// ranking visibility — this component only emits onComplete and renders
// the lights themselves.
export function RaceStartLights({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  // `litCount` walks from 0 → LIGHT_COUNT during the lighting phase so
  // each square fills in turn without per-light setTimeout chains.
  const [litCount, setLitCount] = useState(0)
  // Tracks the fade-out animation independently so the green flash and
  // the fade aren't both driven by the same flag.
  const [faded, setFaded] = useState(false)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let alreadyPlayed = false
    try {
      alreadyPlayed = sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      // Storage blocked — accept replay every visit; not worth bailing on.
    }

    if (reduced || alreadyPlayed) {
      setPhase('done')
      // Microtask, not setTimeout(0), so we don't introduce a paint gap
      // for returning users — the ranking shows up on the same tick.
      queueMicrotask(onComplete)
      return
    }

    setPhase('lighting')

    const timers: number[] = []
    // Each light comes on at i * STEP_MS. We pre-schedule all 5 here
    // so any prop/identity changes don't disturb the cadence.
    for (let i = 0; i < LIGHT_COUNT; i++) {
      timers.push(window.setTimeout(() => setLitCount(i + 1), i * STEP_MS))
    }
    timers.push(window.setTimeout(() => setPhase('go'), FLASH_AT_MS))
    timers.push(window.setTimeout(() => setFaded(true), FADE_AT_MS))
    timers.push(
      window.setTimeout(() => {
        setPhase('done')
        try {
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // Storage blocked — sequence will replay next reload.
        }
        onComplete()
      }, COMPLETE_AT_MS),
    )

    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
    // onComplete is intentionally omitted — we want the sequence to
    // schedule exactly once on mount even if the parent passes a new
    // callback identity on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'done' || phase === 'idle') return null

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="flex justify-center items-center py-4"
      style={{
        gap: 12,
        opacity: faded ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
      }}
    >
      {Array.from({ length: LIGHT_COUNT }).map((_, i) => {
        const lit = i < litCount
        let background = 'transparent'
        if (phase === 'go') {
          background = 'var(--color-sector-green)'
        } else if (lit) {
          background = 'var(--color-curb-red)'
        }
        return (
          <span
            key={i}
            className="block border border-border-strong"
            style={{
              width: 16,
              height: 16,
              background,
              // Fast color transition so individual lights *snap* on rather
              // than easing in — the F1 sequence is instantaneous per light.
              transition: `background-color ${
                phase === 'go' ? FLASH_DURATION_MS : 60
              }ms linear`,
            }}
          />
        )
      })}
    </div>
  )
}
