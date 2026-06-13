/**
 * SkeuomorphicMotor
 *
 * A 2D SVG representation of a stepper-like actuator.
 *
 * Visual elements:
 *  - Outer housing ring (anodised aluminium feel)
 *  - Stator teeth rendered as inset rectangles
 *  - Rotor disc that physically rotates with `position` (rad)
 *  - Shaft extending from rotor centre
 *  - Purple accent glow ∝ |current|
 *  - Red heat tint overlay ∝ temperature (kicks in above 30 °C)
 *  - Target indicator needle (shows commanded position)
 *  - Interactive: drag the rotor ring to jog position
 */

import React, { useRef, useCallback, type CSSProperties } from 'react'
import { color } from '../design/tokens'

interface Props {
  /** Current position in radians */
  position: number
  /** Commanded / target position in radians (shown as needle) */
  targetPosition: number
  /** Motor phase current (A) — drives glow intensity */
  current: number
  /** Motor temperature (°C) — drives heat tint */
  temperature: number
  /** Whether a fault is latched */
  faulted: boolean
  /** Whether the sim is ready */
  ready: boolean
  /** Called when user drags to a new position (radians) */
  onJog: (angle: number) => void
  style?: CSSProperties
}

const SIZE = 300
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER_R = 130
const HOUSING_R = 128
const STATOR_INNER_R = 90
const ROTOR_R = 78
const SHAFT_R = 12
const SHAFT_LEN = 60

const TEETH = 12

function polarToXY(angleDeg: number, r: number, cx = CX, cy = CY) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function wrapAngleRad(angle: number): number {
  const twoPi = Math.PI * 2
  return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
}

export function SkeuomorphicMotor({
  position,
  targetPosition,
  current,
  temperature,
  faulted,
  ready,
  onJog,
  style,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  // Continuous-jog drag state: the raw atan2 angle has a 2π discontinuity at
  // the 9-o'clock seam. We track the last raw sample and accumulate the
  // *wrapped* delta onto the live target so the setpoint follows the pointer
  // smoothly across the seam instead of teleporting ~2π.
  const lastRaw = useRef(0)
  const accum = useRef(0)

  // ── Derived visual values ────────────────────────────────────────────────

  // Glow: 0–1 based on |current| (saturates at 8A)
  const glowIntensity = clamp(Math.abs(current) / 8, 0, 1)
  const glowRadius = 10 + glowIntensity * 25
  const glowOpacity = 0.15 + glowIntensity * 0.55

  // Heat tint: 0–1 kicks in above 30°C, saturates at 80°C
  const heatIntensity = clamp((temperature - 30) / 50, 0, 1)
  const heatColor = faulted
    ? color.danger
    : `rgba(251,146,60,${heatIntensity * 0.4})`  // orange heat wash

  // Fault pulsing ring
  const faultOpacity = faulted ? 0.9 : 0

  // ── Stator teeth ─────────────────────────────────────────────────────────

  const teeth = Array.from({ length: TEETH }, (_, i) => {
    const angleDeg = (360 / TEETH) * i
    const outer = polarToXY(angleDeg, HOUSING_R - 1)
    const inner = polarToXY(angleDeg, STATOR_INNER_R + 4)
    const halfW = 6
    const normal = ((angleDeg - 90) * Math.PI) / 180
    const nx = Math.cos(normal)
    const ny = Math.sin(normal)
    const tx = -ny
    const ty = nx
    // Rectangle vertices
    const pts = [
      [outer.x + tx * halfW, outer.y + ty * halfW],
      [outer.x - tx * halfW, outer.y - ty * halfW],
      [inner.x - tx * halfW, inner.y - ty * halfW],
      [inner.x + tx * halfW, inner.y + ty * halfW],
    ]
    return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  })

  // ── Pointer drag → angle ──────────────────────────────────────────────────

  const svgAngle = useCallback((e: PointerEvent | React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    return Math.atan2(dy, dx) + Math.PI / 2 // atan2 with 0 = up
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!ready) return
      dragging.current = true
      // Anchor the continuous accumulator at the current target so dragging
      // moves relative to where the needle already is.
      lastRaw.current = svgAngle(e)
      accum.current = targetPosition
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    [ready, svgAngle, targetPosition],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const raw = svgAngle(e)
      // Shortest-path delta avoids the ±π seam discontinuity.
      const delta = wrapAngleRad(raw - lastRaw.current)
      lastRaw.current = raw
      accum.current += delta
      onJog(accum.current)
    },
    [onJog, svgAngle],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // ── Rotation transforms ────────────────────────────────────────────────────

  const rotorDeg = (wrapAngleRad(position) * 180) / Math.PI
  const targetDeg = (wrapAngleRad(targetPosition) * 180) / Math.PI

  return (
    <svg
      ref={svgRef}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ userSelect: 'none', cursor: ready ? 'grab' : 'default', ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        {/* Radial gradient for housing */}
        <radialGradient id="housingGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#3a3f44" />
          <stop offset="100%" stopColor="#1c1f22" />
        </radialGradient>
        {/* Radial gradient for rotor */}
        <radialGradient id="rotorGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#4a4f58" />
          <stop offset="100%" stopColor="#22262e" />
        </radialGradient>
        {/* Accent glow filter */}
        <filter id="accentGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Fault glow filter */}
        <filter id="faultGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Outer housing shadow ──────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={OUTER_R + 4} fill="rgba(0,0,0,0.5)" />

      {/* ── Housing ring ──────────────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={OUTER_R} fill="url(#housingGrad)" />
      <circle
        cx={CX} cy={CY} r={OUTER_R}
        fill="none" stroke="#555a62" strokeWidth={1.5}
      />
      {/* Housing inner chamfer */}
      <circle
        cx={CX} cy={CY} r={STATOR_INNER_R + 1}
        fill="none" stroke="#1a1c20" strokeWidth={3}
      />

      {/* ── Stator teeth ──────────────────────────────────────────────────── */}
      {teeth.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="#2b2f38"
          stroke="#3a3f48"
          strokeWidth={0.8}
        />
      ))}

      {/* ── Stator inner ring ─────────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={STATOR_INNER_R} fill="#1e2128" />

      {/* ── Accent glow ring (current intensity) ─────────────────────────── */}
      {glowIntensity > 0.02 && (
        <circle
          cx={CX} cy={CY} r={STATOR_INNER_R - 2}
          fill="none"
          stroke={color.accent}
          strokeWidth={4}
          opacity={glowOpacity}
          filter="url(#accentGlow)"
        />
      )}

      {/* ── Heat overlay ─────────────────────────────────────────────────── */}
      {heatIntensity > 0 && (
        <circle cx={CX} cy={CY} r={STATOR_INNER_R} fill={heatColor} />
      )}

      {/* ── Rotor (rotates with position) ────────────────────────────────── */}
      <g transform={`rotate(${rotorDeg}, ${CX}, ${CY})`}>
        {/* Rotor disc */}
        <circle cx={CX} cy={CY} r={ROTOR_R} fill="url(#rotorGrad)" />
        <circle cx={CX} cy={CY} r={ROTOR_R} fill="none" stroke="#454b56" strokeWidth={1} />

        {/* Rotor pole pieces (4 poles) */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180
          const x = CX + (ROTOR_R - 14) * Math.cos(rad)
          const y = CY + (ROTOR_R - 14) * Math.sin(rad)
          return (
            <ellipse
              key={deg}
              cx={x} cy={y}
              rx={10} ry={16}
              transform={`rotate(${deg}, ${x}, ${y})`}
              fill="#2e333d"
              stroke="#4a5060"
              strokeWidth={0.8}
            />
          )
        })}

        {/* Rotor winding indicator line */}
        <line
          x1={CX} y1={CY - SHAFT_R}
          x2={CX} y2={CY - ROTOR_R + 8}
          stroke={color.accent}
          strokeWidth={2}
          opacity={0.7}
        />

        {/* Shaft (vertical, up) */}
        <rect
          x={CX - SHAFT_R}
          y={CY - ROTOR_R - SHAFT_LEN}
          width={SHAFT_R * 2}
          height={SHAFT_LEN}
          fill="#3a3f44"
          stroke="#555a62"
          strokeWidth={1}
          rx={SHAFT_R}
        />
        {/* Shaft key (flat indicator) */}
        <rect
          x={CX - 2}
          y={CY - ROTOR_R - SHAFT_LEN + 4}
          width={4}
          height={SHAFT_LEN - 12}
          fill="#1c1f22"
          rx={1}
        />
      </g>

      {/* ── Centre bearing ────────────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={SHAFT_R + 4} fill="#1a1d22" stroke="#5a6070" strokeWidth={1.5} />
      <circle cx={CX} cy={CY} r={SHAFT_R} fill="#2a2e35" />
      <circle cx={CX} cy={CY} r={4} fill="#9fa6ad" />

      {/* ── Target position needle ─────────────────────────────────────────── */}
      <g transform={`rotate(${targetDeg}, ${CX}, ${CY})`}>
        <line
          x1={CX} y1={CY - OUTER_R + 8}
          x2={CX} y2={CY - OUTER_R + 22}
          stroke="#facc15"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </g>

      {/* ── Fault ring ────────────────────────────────────────────────────── */}
      <circle
        cx={CX} cy={CY} r={OUTER_R + 2}
        fill="none"
        stroke={color.danger}
        strokeWidth={3}
        opacity={faultOpacity}
        filter="url(#faultGlow)"
      />

      {/* ── Bolt heads (decorative, 6 positions) ─────────────────────────── */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const { x, y } = polarToXY(deg, OUTER_R - 10)
        return <circle key={deg} cx={x} cy={y} r={4.5} fill="#1c1f22" stroke="#4a5060" strokeWidth={1} />
      })}

      {/* ── Not-ready overlay ────────────────────────────────────────────── */}
      {!ready && (
        <g>
          <circle cx={CX} cy={CY} r={OUTER_R} fill="rgba(8,6,13,0.7)" />
          <text
            x={CX} y={CY + 6}
            textAnchor="middle"
            fill={color.textSecondary}
            fontSize={13}
            fontFamily="system-ui, sans-serif"
            letterSpacing={1.5}
          >
            INITIALIZING
          </text>
        </g>
      )}
    </svg>
  )
}
