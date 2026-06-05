/**
 * MotionEnvelope — UI overlay showing the allowable rotation range of a
 * revolute joint.
 *
 * Design intent: this is a diagnostic OVERLAY, not a physical machine part.
 * It should read as a HUD annotation — neon, dainty, clearly 2-D — rather
 * than anything that looks like it's attached to the robot.
 *
 *  - Thin smoked-glass ring sector for the sweep area
 *  - Small neon tick notches at the outer rim only, every 15° (not full spokes)
 *  - Compact neon stop-pins at the hard limits
 *  - A slim neon current-angle needle
 *
 * All geometry lives at `zOffset` beneath the joint origin so it peeks out
 * from behind the actuator mesh rather than projecting from it.
 *
 * Callers: ArmCanvas wraps each envelope in
 *   `<group matrix={preJointMatrix} matrixAutoUpdate={false}>`.
 * The envelope is NOT rendered unless `showLimits` is true on ArmCanvas.
 */
import { useMemo } from 'react'
import * as THREE from 'three'

// Neon HUD colours — deliberately not from the lab_instrument palette so
// the overlay is visually distinct from machine materials.
const NEON_ARC   = '#7dd3fc'  // sky-blue 300 — smoked arc tint
const NEON_TICK  = '#38bdf8'  // sky-blue 400 — tick notches
const NEON_STOP  = '#f0abfc'  // fuchsia 300 — hard-stop pins
const NEON_PTR   = '#a78bfa'  // violet 400 — current-angle needle

const ARC_SEGS = 80

interface MotionEnvelopeProps {
  innerRadius: number
  outerRadius: number
  lowerRad: number
  upperRad: number
  /** If provided, draws the current-angle needle. */
  currentRad?: number
  /** Tick spacing in radians. Default π/12 = 15°. */
  tickStepRad?: number
  /** Z offset — place envelope slightly below the joint mesh. */
  zOffset?: number
}

/** Returns null if the sweep is too wide to be informative (≥ 340°). */
function useSweep(lo: number, hi: number) {
  return useMemo(() => {
    const span = hi - lo
    if (span <= 0 || span >= Math.PI * (340 / 180)) return null
    return { lower: lo, span: Math.min(span, Math.PI * 2) }
  }, [lo, hi])
}

/** Build tick angles (multiples of `step` inside [lo, hi]). */
function useTicks(lo: number, hi: number, step: number, sweepValid: boolean) {
  return useMemo(() => {
    if (!sweepValid) return []
    const out: number[] = []
    const start = Math.ceil(lo / step) * step
    for (let a = start; a <= hi + 1e-9; a += step) out.push(a)
    return out
  }, [lo, hi, step, sweepValid])
}

export function MotionEnvelope({
  innerRadius,
  outerRadius,
  lowerRad,
  upperRad,
  currentRad,
  tickStepRad = Math.PI / 12,
  zOffset = -0.003,
}: MotionEnvelopeProps) {
  const sweep = useSweep(lowerRad, upperRad)
  const ticks = useTicks(lowerRad, upperRad, tickStepRad, sweep !== null)

  // ── Shared materials (stable references, never re-created) ───────────────
  const arcMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: NEON_ARC,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  const tickMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: NEON_TICK,
    transparent: true,
    opacity: 0.70,
    depthWrite: false,
  }), [])

  const stopMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: NEON_STOP,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }), [])

  const ptrMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: NEON_PTR,
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
  }), [])

  if (!sweep) return null

  const band = outerRadius - innerRadius

  // ── Tick geometry: tiny notch at the OUTER rim only, not a full-band spoke.
  // A notch is 12% of band depth × 3% wide — clearly a graduation mark.
  const notchDepth  = band * 0.14
  const notchWidth  = band * 0.03
  const notchHeight = 0.001   // flat
  const notchR      = outerRadius - notchDepth / 2   // centred near outer edge

  // ── Stop pins: compact T-shaped indicator at each hard-stop angle.
  // 50% band radial span, very narrow tangentially.
  const stopLen = band * 0.55
  const stopW   = band * 0.055
  const stopR   = innerRadius + band * 0.50   // midpoint

  // ── Current-angle needle: thin line from inner to slightly past outer.
  const needleLen = band * 1.05
  const needleW   = band * 0.045
  const needleR   = innerRadius + needleLen / 2

  return (
    <group position={[0, 0, zOffset]}>
      {/* Smoked-glass arc */}
      <mesh renderOrder={1} material={arcMat}>
        <ringGeometry args={[innerRadius, outerRadius, ARC_SEGS, 1, sweep.lower, sweep.span]} />
      </mesh>

      {/* Tick notches — tiny marks at the outer rim, one per degree-step */}
      {ticks.map((a, i) => (
        <mesh
          key={i}
          renderOrder={2}
          position={[Math.cos(a) * notchR, Math.sin(a) * notchR, 0.0005]}
          rotation={[0, 0, a]}
          material={tickMat}
        >
          {/* box: X = radial depth, Y = tangential width, Z = flat height */}
          <boxGeometry args={[notchDepth, notchWidth, notchHeight]} />
        </mesh>
      ))}

      {/* Hard-stop pins at lower and upper limits */}
      {[lowerRad, upperRad].map((a, i) => (
        <mesh
          key={i}
          renderOrder={3}
          position={[Math.cos(a) * stopR, Math.sin(a) * stopR, 0.001]}
          rotation={[0, 0, a]}
          material={stopMat}
        >
          <boxGeometry args={[stopLen, stopW, 0.002]} />
        </mesh>
      ))}

      {/* Current-angle needle */}
      {currentRad !== undefined && (
        <mesh
          renderOrder={4}
          position={[Math.cos(currentRad) * needleR, Math.sin(currentRad) * needleR, 0.0015]}
          rotation={[0, 0, currentRad]}
          material={ptrMat}
        >
          <boxGeometry args={[needleLen, needleW, 0.002]} />
        </mesh>
      )}
    </group>
  )
}
