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

// ── Quaternion helpers (exported for jog panel use) ───────────────────────────

/**
 * Extract quaternion [x, y, z, w] from the rotation part of a row-major 4×4 matrix.
 * Uses Shepperd's method — numerically stable across all configurations.
 */
export function matrixToQuat(m: number[]): [number, number, number, number] {
  const trace = m[0] + m[5] + m[10]
  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    w = 0.25 / s
    x = (m[9] - m[6]) * s
    y = (m[2] - m[8]) * s
    z = (m[4] - m[1]) * s
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10])
    w = (m[9] - m[6]) / s
    x = 0.25 * s
    y = (m[1] + m[4]) / s
    z = (m[2] + m[8]) / s
  } else if (m[5] > m[10]) {
    const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10])
    w = (m[2] - m[8]) / s
    x = (m[1] + m[4]) / s
    y = 0.25 * s
    z = (m[6] + m[9]) / s
  } else {
    const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5])
    w = (m[4] - m[1]) / s
    x = (m[2] + m[8]) / s
    y = (m[6] + m[9]) / s
    z = 0.25 * s
  }
  const len = Math.sqrt(x * x + y * y + z * z + w * w)
  return [x / len, y / len, z / len, w / len]
}

/** Build a unit quaternion [x, y, z, w] for a rotation of `rad` about a canonical axis (0=X, 1=Y, 2=Z). */
export function quatFromAxisAngle(axis: 0 | 1 | 2, rad: number): [number, number, number, number] {
  const s = Math.sin(rad / 2)
  const q: [number, number, number, number] = [0, 0, 0, Math.cos(rad / 2)]
  q[axis] = s
  return q
}

/** Hamilton product of two quaternions [x, y, z, w]. */
export function quatMultiply(
  [x1, y1, z1, w1]: [number, number, number, number],
  [x2, y2, z2, w2]: [number, number, number, number],
): [number, number, number, number] {
  return [
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
  ]
}

/**
 * Convert intrinsic ZYX Euler angles in degrees [roll, pitch, yaw] to a
 * unit quaternion [x, y, z, w].  Inverse of quatToEulerDeg.
 */
export function quatFromEulerDeg(
  roll_deg: number,
  pitch_deg: number,
  yaw_deg: number,
): [number, number, number, number] {
  const r = (roll_deg * Math.PI) / 180
  const p = (pitch_deg * Math.PI) / 180
  const y = (yaw_deg * Math.PI) / 180
  const cr = Math.cos(r / 2), sr = Math.sin(r / 2)
  const cp = Math.cos(p / 2), sp = Math.sin(p / 2)
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ]
}

/**
 * Convert quaternion [x, y, z, w] to intrinsic ZYX Euler angles in degrees
 * returned as [roll (about X), pitch (about Y), yaw (about Z)].
 */
export function quatToEulerDeg(
  [x, y, z, w]: [number, number, number, number],
): [number, number, number] {
  const RAD = 180 / Math.PI
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
  const sinp = 2 * (w * y - z * x)
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  return [roll * RAD, pitch * RAD, yaw * RAD]
}

/**
 * Compute joint-origin world positions and the end-effector position
 * for a DH chain at the given joint angles.
 *
 * Supports both revolute and prismatic joints.  Prismatic joints translate
 * along `jv.axis` ('x' | 'y' | 'z') instead of rotating about Z.
 * Mirrors the axis-based dispatch in brain/service/dh_fk.py and ArmCanvas.tsx.
 *
 * @param joints  DH joint specs in chain order
 * @param anglesRad  Joint values in SI (rad for revolute, metres for prismatic).
 * @returns  Object with `jointOrigins`, `ee` position, and `eeQuat`.
 */
export function forwardKinematics(
  joints: DHJointValues[],
  anglesRad: number[],
): {
  jointOrigins: [number, number, number][]
  ee: [number, number, number]
  eeQuat: [number, number, number, number]
} {
  let T = identity()
  const jointOrigins: [number, number, number][] = []

  for (let i = 0; i < joints.length; i++) {
    const j = joints[i]
    const q = anglesRad[i] ?? 0
    const isPrismatic = (j.type ?? 'revolute') === 'prismatic'
    const axis = j.axis ?? 'z'

    let linkFrameMatrix: number[]

    if (isPrismatic) {
      // Rz(θ_offset) · T_{axis}(q) — mirrors dh_fk.py prismatic dispatch
      const Rz = rotZ(j.theta_offset * DEG)
      if (axis === 'x') {
        linkFrameMatrix = mul(mul(T, Rz), trans(j.a + q, 0, 0))
      } else if (axis === 'y') {
        linkFrameMatrix = mul(mul(T, Rz), trans(0, q, 0))
      } else {
        linkFrameMatrix = mul(mul(T, Rz), trans(0, 0, j.d + q))
      }
      jointOrigins.push([linkFrameMatrix[3], linkFrameMatrix[7], linkFrameMatrix[11]])
      // For prismatic with axis='x', joint frame already consumed 'a'; skip extra Tx(a)
      const extraX = isPrismatic && axis === 'x' ? 0 : j.a
      T = mul(mul(linkFrameMatrix, trans(extraX, 0, 0)), rotX(j.alpha * DEG))
    } else {
      const theta = j.theta_offset * DEG + q
      linkFrameMatrix = mul(mul(T, rotZ(theta)), trans(0, 0, j.d))
      jointOrigins.push([linkFrameMatrix[3], linkFrameMatrix[7], linkFrameMatrix[11]])
      T = mul(mul(linkFrameMatrix, trans(j.a, 0, 0)), rotX(j.alpha * DEG))
    }
  }

  return {
    jointOrigins,
    ee: [T[3], T[7], T[11]],
    eeQuat: matrixToQuat(T),
  }
}
