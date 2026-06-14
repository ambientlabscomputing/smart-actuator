import { useEffect, useRef, useState } from 'react'

/** Minimum angle change (radians) considered intentional motion, not noise. */
const MOTION_THRESHOLD = 0.0005

/** How long (ms) the active flag stays lit after the last detected motion. */
const DECAY_MS = 500

/**
 * useActiveJoints — returns a boolean[] flagging which joints are currently moving.
 *
 * Compares each value in `anglesRad` against the previous render. When a joint
 * moves beyond MOTION_THRESHOLD the flag becomes true and stays true for DECAY_MS
 * after motion stops. Works for joint-space jog AND cartesian/IK jog — any joint
 * that physically changes angle is flagged.
 */
export function useActiveJoints(anglesRad: number[]): boolean[] {
  const prevRef = useRef<number[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const [active, setActive] = useState<boolean[]>([])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = [...anglesRad]

    anglesRad.forEach((angle, i) => {
      const prevAngle = prev[i] ?? angle
      if (Math.abs(angle - prevAngle) <= MOTION_THRESHOLD) return

      // Mark joint active immediately (avoid re-render if already active)
      setActive(a => {
        const n = anglesRad.length
        const base = a.length === n ? a : Array<boolean>(n).fill(false)
        if (base[i]) return base
        const next = [...base]
        next[i] = true
        return next
      })

      // Reset / extend the decay timer for this joint
      const existing = timers.current.get(i)
      if (existing !== undefined) clearTimeout(existing)
      timers.current.set(i, setTimeout(() => {
        setActive(a => {
          if (a.length <= i || !a[i]) return a
          const next = [...a]
          next[i] = false
          return next
        })
        timers.current.delete(i)
      }, DECAY_MS))
    })
  }, [anglesRad])

  // Cleanup all pending timers on unmount
  useEffect(() => () => {
    timers.current.forEach(t => clearTimeout(t))
  }, [])

  return active.length === anglesRad.length ? active : anglesRad.map(() => false)
}
