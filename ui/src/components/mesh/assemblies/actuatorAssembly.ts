/**
 * buildActuatorAssembly — lab_instrument-family revolute joint.
 *
 * A short hex housing (jointHousing) with a polished bearing collar on each
 * exposed face, two end caps with 6-bolt circles, a motor pod boss on −Y, an
 * encoder pod on +Y, and a status LED on +Z that glows when the joint is
 * active. The whole assembly is centred on the link frame origin and shares
 * the +X-axis convention with the legacy hub builder.
 */
import type { MachineTokens } from '../../../design/machineTokens'
import type {
  MeshRecipe,
  ProfileExtrusionPrimitive,
  CollarPrimitive,
  PlatePrimitive,
  FastenerPrimitive,
  BossPrimitive,
  StatusLEDPrimitive,
} from '../recipes'

export interface ActuatorAssemblyOptions {
  /** Visual radius of the adjacent link (metres) — hub radius is derived. */
  linkRadius: number
  /** When true, light the status LED on top of the housing. */
  active?: boolean
  /** Token set driving proportions. */
  tokens: MachineTokens
}

export function buildActuatorAssembly(opts: ActuatorAssemblyOptions): MeshRecipe {
  const { linkRadius, active = false, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const hubRadius = linkRadius * p.hubToLinkRadius
  const hubHalfLength = hubRadius * p.hubHalfLengthToRadius
  const bevel = hubRadius * t.bevel.md

  const primitives: MeshRecipe['primitives'] = []

  // ── Main hex housing ─────────────────────────────────────────────────────
  const housing: ProfileExtrusionPrimitive = {
    kind: 'profileExtrusion',
    profile: 'hex',
    halfWidth: hubRadius,
    halfHeight: hubRadius,
    cornerRadius: 0,
    length: hubHalfLength * 2,
    bevel,
    role: 'jointHousing',
  }
  primitives.push(housing)

  // ── Bearing collars at each end face ─────────────────────────────────────
  const bearingRadius = hubRadius * 0.85
  const bearingWidth = Math.max(0.004, hubRadius * 0.10)
  const startBearing: CollarPrimitive = {
    kind: 'collar',
    axialPosition: -hubHalfLength - bearingWidth / 2,
    outerRadius: bearingRadius,
    width: bearingWidth,
    bevel: bevel * 0.4,
    role: 'bearing',
  }
  const endBearing: CollarPrimitive = {
    kind: 'collar',
    axialPosition: +hubHalfLength + bearingWidth / 2,
    outerRadius: bearingRadius,
    width: bearingWidth,
    bevel: bevel * 0.4,
    role: 'bearing',
  }
  primitives.push(startBearing, endBearing)

  // ── End-cap plates (jointHousing) holding the bearings ───────────────────
  const capRadius = hubRadius * 0.72
  const capThickness = Math.max(0.004, hubRadius * 0.10)
  const startCap: PlatePrimitive = {
    kind: 'plate',
    axialPosition: -hubHalfLength - bearingWidth - capThickness / 2,
    radius: capRadius,
    thickness: capThickness,
    shape: 'circle',
    role: 'jointHousing',
  }
  const endCap: PlatePrimitive = {
    kind: 'plate',
    axialPosition: +hubHalfLength + bearingWidth + capThickness / 2,
    radius: capRadius,
    thickness: capThickness,
    shape: 'circle',
    role: 'jointHousing',
  }
  primitives.push(startCap, endCap)

  // ── Hex-bolt circles on each cap ────────────────────────────────────────
  if (t.fasteners.diameter > 0) {
    const boltDia = Math.max(0.005, hubRadius * 0.16)
    const boltDepth = capThickness * 0.7
    const boltCircleR = capRadius * 0.72
    const count = 6
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const y = Math.cos(a) * boltCircleR
      const z = Math.sin(a) * boltCircleR
      primitives.push({
        kind: 'fastener',
        position: [-hubHalfLength - bearingWidth - capThickness, y, z],
        normal: [-1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      } satisfies FastenerPrimitive)
      primitives.push({
        kind: 'fastener',
        position: [+hubHalfLength + bearingWidth + capThickness, y, z],
        normal: [+1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      } satisfies FastenerPrimitive)
    }
  }

  // ── Motor pod boss (−Y face) ─────────────────────────────────────────────
  const motor: BossPrimitive = {
    kind: 'boss',
    offset: [0, -hubRadius * 0.95, 0],
    axis: [0, -1, 0],
    radius: hubRadius * 0.40,
    length: hubRadius * 0.55,
    bevel: bevel * 0.5,
    role: 'jointHousing',
  }
  primitives.push(motor)

  // ── Encoder pod (+Y face) — smaller, with a bearing cap on top ───────────
  const encoder: BossPrimitive = {
    kind: 'boss',
    offset: [0, +hubRadius * 0.95, 0],
    axis: [0, +1, 0],
    radius: hubRadius * 0.30,
    length: hubRadius * 0.38,
    bevel: bevel * 0.5,
    role: 'jointHousing',
  }
  primitives.push(encoder)

  // ── Status LED on +Z, lit when active ───────────────────────────────────
  const led: StatusLEDPrimitive = {
    kind: 'statusLED',
    position: [0, 0, +hubRadius * 1.02],
    normal: [0, 0, +1],
    radius: hubRadius * 0.12,
    intensity: active ? 1.0 : 0.0,
    role: active ? 'emissiveAccent' : 'innerFrame',
  }
  primitives.push(led)

  // bbox: hub axial extent (+ caps + bearings) and worst-case radial reach
  const axialExtent = hubHalfLength * 2 + (bearingWidth + capThickness) * 2
  const radialReach = Math.max(hubRadius, hubRadius * 0.95 + hubRadius * 0.55)
  return {
    primitives,
    bbox: { length: axialExtent, radius: radialReach },
  }
}
