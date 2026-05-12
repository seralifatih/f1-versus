'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const SESSION_KEY = 'f1versus-intro-played'
const STEP_MS = 200
const HOLD_MS = 300
const FLASH_MS = 100
const LIGHT_COUNT = 5

type Phase =
  | 'idle' // before mount decision
  | 'arming' // lights illuminating left → right
  | 'hold' // all red, holding
  | 'go' // green flash
  | 'done' // sequence finished, children revealed

interface Props {
  children: ReactNode
}

// Race-start light sequence played once per session above the ranking.
// Children stay invisible (but mounted) until the sequence completes so
// row animations don't fire concurrently with the lights. Respects
// prefers-reduced-motion + sessionStorage gate.
export function StartLights({ children }: Props) {
  // SSR/first paint default: done. We flip to 'arming' in an effect once
  // we've checked sessionStorage + reduced-motion. This avoids a flash of
  // the lights for returning users whose session storage already has the
  // played flag set.
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let alreadyPlayed = false
    try {
      alreadyPlayed = sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      // sessionStorage blocked — treat as not played; sequence runs every visit.
    }
    if (reduced || alreadyPlayed) {
      setPhase('done')
      return
    }

    setPhase('arming')
    const timers: number[] = []
    const armingDuration = STEP_MS * LIGHT_COUNT
    timers.push(window.setTimeout(() => setPhase('hold'), armingDuration))
    timers.push(window.setTimeout(() => setPhase('go'), armingDuration + HOLD_MS))
    timers.push(
      window.setTimeout(() => {
        setPhase('done')
        try {
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // Storage blocked — accept the cost of replaying next navigation.
        }
      }, armingDuration + HOLD_MS + FLASH_MS),
    )

    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [])

  const done = phase === 'done'

  return (
    <div className="relative">
      <AnimatePresence>
        {!done && phase !== 'idle' && (
          <motion.div
            key="lights"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden="true"
            className="flex justify-center gap-2 py-4"
          >
            {Array.from({ length: LIGHT_COUNT }).map((_, i) => {
              const litAt = (i + 1) * STEP_MS
              const isLit = phase === 'arming' ? false : true
              return (
                <Light
                  key={i}
                  index={i}
                  phase={phase}
                  litAt={litAt}
                  isLitFromHold={isLit}
                />
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ opacity: done ? 1 : 0 }}>{children}</div>
    </div>
  )
}

function Light({
  phase,
  litAt,
}: {
  index: number
  phase: Phase
  litAt: number
  isLitFromHold: boolean
}) {
  // Per-light state machine.
  //   arming: off → curb-red at litAt
  //   hold:   all curb-red
  //   go:     all sector-green (the flash before going out)
  let background = 'transparent'
  if (phase === 'arming') {
    // Each light is initially transparent, then becomes red after its delay.
    // motion's `animate` with `transition.delay` handles this cleanly.
    background = 'var(--color-curb-red)'
  } else if (phase === 'hold') {
    background = 'var(--color-curb-red)'
  } else if (phase === 'go') {
    background = 'var(--color-sector-green)'
  }
  return (
    <motion.span
      initial={{ background: 'transparent', scale: 0.85 }}
      animate={{ background, scale: 1 }}
      transition={{
        duration: 0.05,
        delay: phase === 'arming' ? litAt / 1000 : 0,
      }}
      className="block h-4 w-4 border border-border-strong"
    />
  )
}
