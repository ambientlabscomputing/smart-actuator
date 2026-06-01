/**
 * fk.ts — pure-TypeScript forward kinematics for the DH chain.
 *
 * Mirrors the convention in ArmCanvas.tsx and brain/service/dh_fk.py:
 *     T_i = T_{i-1} · Rz(θ_offset + θ_i) · Tz(d) · Tx(a) · Rx(α)
 *
 * No three.js dependency — uses flat 16-element row-major 4×4 matrices so
 * it's safe to import from non-canvas contexts (jog panels, hooks, etc.).
 */
import type { DHJointValues } from './types'

const DEG = Math.PI / 180

/** 4×4 identity matrix as a flat 16-element row-major array. */
function identity(): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

/** Multiply two 4×4 row-major matrices. */
function mul(A: number[], B: number[]): number[] {
  const C = new Array<number>(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j]
      C[i * 4 + j] = s
    }
  }
  return C
}

function rotZ(theta: number): number[] {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}
function rotX(theta: number): number[] {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
}
function trans(x: number, y: number, z: number): number[] {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
}

/**
 * Compute joint-origin world positions and the end-effector position
 * for a DH chain at the given joint angles.
 *
 * @param joints  DH joint specs in chain order
 * @param anglesRad  Joint angles (rad), same order as `joints`. Missing values default to 0.
 * @returns        Object with `jointOrigins` (one per joint) and `ee` (end-effector).
 */
export function forwardKinematics(
  joints: DHJointValues[],
  anglesRad: number[],
): { jointOrigins: [number, number, number][]; ee: [number, number, number] } {
  let T = identity()
  const jointOrigins: [number, number, number][] = []

  for (let i = 0; i < joints.length; i++) {
    const j = joints[i]
    const theta = j.theta_offset * DEG + (anglesRad[i] ?? 0)

    // T_joint = T · Rz(theta) · Tz(d)
    const linkFrameMatrix = mul(mul(T, rotZ(theta)), trans(0, 0, j.d))
    jointOrigins.push([linkFrameMatrix[3], linkFrameMatrix[7], linkFrameMatrix[11]])

    // Next base: link tip · Rx(alpha)
    T = mul(mul(linkFrameMatrix, trans(j.a, 0, 0)), rotX(j.alpha * DEG))
  }

  return {
    jointOrigins,
    ee: [T[3], T[7], T[11]],
  }
}
