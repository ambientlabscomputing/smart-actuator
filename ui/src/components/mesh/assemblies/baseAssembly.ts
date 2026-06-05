/**
 * buildBaseAssembly — lab_instrument-family world-anchor base.
 *
 * A large shell disc with a polished bearing ring, a 6-bolt circle, and a
 * darker innerFrame collar suggesting the rotating turret.
 *
 * Convention: the disc lies in the XY plane with its axis along +Z. To keep
 * the primitive vocabulary consistent (which uses +X = part axis), the
 * primitives are emitted in a "+X = up" local frame and the React wrapper
 * rotates the group so +X aligns to world +Z.
 */
import type { MachineTokens } from '../../../design/machineTokens'
import type {
  MeshRecipe,
  PlatePrimitive,
  CollarPrimitive,
  FastenerPrimitive,
} from '../recipes'

export interface BaseAssemblyOptions {
  /** Outer radius of the base disc (metres). */
  radius: number
  /** Disc thickness (metres). */
  thickness: number
  tokens: MachineTokens
}

export function buildBaseAssembly(opts: BaseAssemblyOptions): MeshRecipe {
  const { radius, thickness, tokens } = opts
  const t = tokens.geometry

  const primitives: MeshRecipe['primitives'] = []

  // ── Main disc (shell) ────────────────────────────────────────────────────
  const disc: PlatePrimitive = {
    kind: 'plate',
    axialPosition: thickness / 2,
    radius,
    thickness,
    shape: 'circle',
    role: 'base',
  }
  primitives.push(disc)

  // ── Inner frame collar (the rotating turret stub) ────────────────────────
  const turretR = radius * 0.55
  const turretH = Math.max(0.005, thickness * 0.6)
  const turret: CollarPrimitive = {
    kind: 'collar',
    axialPosition: thickness + turretH / 2,
    outerRadius: turretR,
    width: turretH,
    bevel: radius * t.bevel.sm * 0.4,
    role: 'innerFrame',
  }
  primitives.push(turret)

  // ── Polished bearing ring on top of the turret ──────────────────────────
  const bearingR = turretR * 0.96
  const bearingW = Math.max(0.003, turretH * 0.35)
  const bearing: CollarPrimitive = {
    kind: 'collar',
    axialPosition: thickness + turretH + bearingW / 2,
    outerRadius: bearingR,
    width: bearingW,
    bevel: radius * t.bevel.sm * 0.2,
    role: 'bearing',
  }
  primitives.push(bearing)

  // ── 6-bolt circle on the disc surface ────────────────────────────────────
  if (t.fasteners.diameter > 0) {
    const boltCircleR = radius * 0.82
    const boltDia = Math.max(0.006, radius * 0.05)
    const boltDepth = thickness * 0.5
    const count = 6
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const y = Math.cos(a) * boltCircleR
      const z = Math.sin(a) * boltCircleR
      const bolt: FastenerPrimitive = {
        kind: 'fastener',
        position: [thickness, y, z],
        normal: [+1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      }
      primitives.push(bolt)
    }
  }

  return {
    primitives,
    bbox: { length: thickness + turretH + bearingW, radius },
  }
}
