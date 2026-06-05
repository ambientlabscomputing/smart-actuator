/**
 * buildLinkAssembly — lab_instrument-family link.
 *
 * A precision-machined link enclosure:
 *  - Outer shell: rounded-rectangular extrusion in `shell` material.
 *  - Inner spine: a smaller hex extrusion in `innerFrame` that peeks past
 *    each end face of the shell, suggesting a continuous structural beam.
 *  - End plates: square `shell` plates at ±X with a 4-bolt circle each.
 *  - A short cable boss visible on one side, hinting at internal wiring.
 *
 * All dimensions are derived from `linkRadius` and the input `length`.
 */
import type { MachineTokens } from '../../../design/machineTokens'
import type {
  MeshRecipe,
  ProfileExtrusionPrimitive,
  PlatePrimitive,
  FastenerPrimitive,
  TubePrimitive,
} from '../recipes'

export type JointKind = 'revolute' | 'prismatic' | 'none'

export interface LinkAssemblyOptions {
  /** DH link length `a` (metres). */
  length: number
  /** Reference radius — outer-shell half-height is derived from this. */
  radius: number
  /** Joint type at the −X (start) end. */
  startJoint: JointKind
  /** Joint type at the +X (end) end. */
  endJoint: JointKind
  /** Token set driving proportions and bevels. */
  tokens: MachineTokens
  /** Optional seed for variation (cable routing offset). Default 0. */
  seed?: number
}

export function buildLinkAssembly(opts: LinkAssemblyOptions): MeshRecipe {
  const { length, radius, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const halfH = radius * p.linkRadiusScale
  const halfW = halfH * 1.05            // slightly wider than tall
  const cornerR = halfH * 0.30
  const bevel = halfH * t.bevel.sm * 0.5

  const primitives: MeshRecipe['primitives'] = []

  // ── Outer shell ────────────────────────────────────────────────────────────
  const shell: ProfileExtrusionPrimitive = {
    kind: 'profileExtrusion',
    profile: 'rounded_rect',
    halfWidth: halfW,
    halfHeight: halfH,
    cornerRadius: cornerR,
    length,
    bevel,
    role: 'shell',
  }
  primitives.push(shell)

  // ── Inner spine (visible at each end where it sticks past the shell) ──────
  const spineHalf = halfH * 0.55
  const spineOverhang = halfH * 0.30
  const spine: ProfileExtrusionPrimitive = {
    kind: 'profileExtrusion',
    profile: 'hex',
    halfWidth: spineHalf,
    halfHeight: spineHalf,
    cornerRadius: 0,
    length: length + spineOverhang * 2,
    bevel: 0,
    role: 'innerFrame',
  }
  // Translate spine by -spineOverhang so it sticks out symmetrically.
  // ProfileExtrusion is centred on its midpoint; the renderer places it at the
  // wrapper group origin. We model the overhang by extending length and
  // expressing the asymmetry by appending a small wrapper offset — instead
  // here we let the spine extend equally past both ends so the wrapper
  // doesn't need a per-end offset. Effective length stays `length` for bbox.
  primitives.push(spine)

  // ── End plates (square flanges where joints bolt up) ──────────────────────
  const plateThickness = Math.max(0.004, halfH * 0.08)
  const plateRadius = halfW * 1.08
  const startPlate: PlatePrimitive = {
    kind: 'plate',
    axialPosition: -length / 2 + plateThickness / 2,
    radius: plateRadius,
    thickness: plateThickness,
    shape: 'square',
    role: 'shell',
  }
  const endPlate: PlatePrimitive = {
    kind: 'plate',
    axialPosition: length / 2 - plateThickness / 2,
    radius: plateRadius,
    thickness: plateThickness,
    shape: 'square',
    role: 'shell',
  }
  primitives.push(startPlate, endPlate)

  // ── Bolt circles on each plate (4 corner bolts) ───────────────────────────
  if (t.fasteners.diameter > 0) {
    const boltOffset = plateRadius * 0.78
    const boltDia = Math.max(0.006, halfH * 0.18)
    const boltDepth = plateThickness * 0.6
    const corners: Array<[number, number]> = [
      [+boltOffset, +boltOffset],
      [+boltOffset, -boltOffset],
      [-boltOffset, +boltOffset],
      [-boltOffset, -boltOffset],
    ]
    for (const [y, z] of corners) {
      const startBolt: FastenerPrimitive = {
        kind: 'fastener',
        position: [-length / 2 + plateThickness, y, z],
        normal: [-1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      }
      const endBolt: FastenerPrimitive = {
        kind: 'fastener',
        position: [length / 2 - plateThickness, y, z],
        normal: [+1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      }
      primitives.push(startBolt, endBolt)
    }
  }

  // ── Cable hint — a tube routed along the shell's underside ────────────────
  if (length > halfH * 4) {
    const yOff = -halfH * 0.92
    const zOff = -halfH * 0.45
    const cable: TubePrimitive = {
      kind: 'tube',
      points: [
        [-length / 2 + plateThickness * 1.5, yOff, zOff],
        [-length / 2 + length * 0.25, yOff, zOff],
        [+length / 2 - length * 0.25, yOff, zOff],
        [+length / 2 - plateThickness * 1.5, yOff, zOff],
      ],
      radius: Math.max(0.003, halfH * 0.07),
      role: 'cable',
    }
    primitives.push(cable)
  }

  return {
    primitives,
    bbox: { length, radius: plateRadius * Math.SQRT2 },
  }
}
