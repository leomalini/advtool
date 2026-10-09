'use client'

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * A number that counts up from zero the first time it arrives — the
 * dashboard's entrance. Only once per mount: a refetch that turns 12 into 13
 * just shows 13, a count running again would read as "something happened".
 *
 * Returns the raw interpolated value (the caller rounds and formats), or
 * `null` while `target` is. Whoever asks the system for less motion gets the
 * number at once.
 */
export function useCountUp(target: number | null, durationMs = 900): number | null {
  // 0 → 1 over the entrance; starts at 1 when there is nothing to animate.
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0))
  const done = useRef(false)
  const ready = target !== null

  useEffect(() => {
    if (!ready || done.current || prefersReducedMotion()) return
    let frame = 0
    const start = performance.now()
    const tick = (time: number) => {
      const elapsed = Math.min(1, (time - start) / durationMs)
      setProgress(elapsed)
      if (elapsed < 1) frame = requestAnimationFrame(tick)
      else done.current = true
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ready, durationMs])

  if (target === null) return null
  return progress >= 1 ? target : target * easeOutCubic(progress)
}
