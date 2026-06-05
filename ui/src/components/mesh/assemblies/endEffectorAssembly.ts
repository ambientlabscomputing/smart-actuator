/**
 * buildEndEffectorAssembly — lab_instrument-family tool flange.
 *
 * A small adapter flange + tool collar + dome cap. When `active`, the dome
 * uses the `eeActive` material so it glows and stays visible above other
 * geometry (matching the legacy drag-cap behaviour).
 */
import type { MachineTokens } from '../../../design/machineTokens'
import type {
  MeshRecipe,
  PlatePrimitive,
  CollarPrimitive,
  CapPrimitive,
  FastenerPrimitive,
} from '../recipes'

export interface EndEffectorAssemblyOptions {
  /** Visual radius of the parent link. */
  linkRadius: number
  /** When true, switch tip cap to active/glow material. */
  active?: boolean
  tokens: MachineTokens
}

export function buildEndEffectorAssembly(opts: EndEffectorAssemblyOptions): MeshRecipe {
  const { linkRadius, active = false, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const flangeRadius = linkRadius * p.toolCapRadiusToLinkRadius * 1.4
  const flangeThickness = Math.max(0.004, linkRadius * 0.10)
  const collarRadius = linkRadius * p.toolCapRadiusToLinkRadius * 0.85
  const collarWidth = Math.max(0.006, linkRadius * 0.18)
  const tipRadius = linkRadius * p.toolCapRadiusToLinkRadius * 0.55
  const tipThickness = Math.max(0.005, linkRadius * 0.14)
  const bevel = linkRadius * t.bevel.sm

  const primitives: MeshRecipe['primitives'] = []

  // ── Flange (shell, square) — bolts up to the link's end plate ─────────────
  const flange: PlatePrimitive = {
    kind: 'plate',
    axialPosition: flangeThickness / 2,
    radius: flangeRadius,
    thickness: flangeThickness,
    shape: 'square',
    role: 'shell',
  }
  primitives.push(flange)

  // ── Bolt circle on the flange (4 corner bolts) ───────────────────────────
  if (t.fasteners.diameter > 0) {
    const boltDia = Math.max(0.005, linkRadius * 0.14)
    const boltDepth = flangeThickness * 0.6
    const off = flangeRadius * 0.78
    for (const [y, z] of [
      [+off, +off],
      [+off, -off],
      [-off, +off],
      [-off, -off],
    ] as Array<[number, number]>) {
      const bolt: FastenerPrimitive = {
        kind: 'fastener',
        position: [flangeThickness, y, z],
        normal: [+1, 0, 0],
        diameter: boltDia,
        depth: boltDepth,
        role: 'fastener',
      }
      primitives.push(bolt)
    }
  }

  // ── Collar between flange and tip — jointHousing for visual contrast ─────
  const collar: CollarPrimitive = {
    kind: 'collar',
    axialPosition: flangeThickness + collarWidth / 2,
    outerRadius: collarRadius,
    width: collarWidth,
    bevel,
    role: 'jointHousing',
  }
  primitives.push(collar)

  // ── Tip cap — eeActive when drag/active, otherwise ee ────────────────────
  const tip: CapPrimitive = {
    kind: 'cap',
    radius: tipRadius,
    thickness: tipThickness,
    bevel: bevel * 0.5,
    centreMarkRadius: 0,
    role: active ? 'eeActive' : 'ee',
  }
  // Cap sits at the very front (along +X) past the collar.
  // Renderer doesn't accept axialPosition on `cap`; wrap call-site handles
  // placement by translating the recipe group instead. For now, the
  // wrapper places the EE recipe at the EE frame and the cap stacks naturally
  // because the renderer centres caps at the local origin.
  // To keep the cap at +X past the collar, we add it last; the wrapper
  // (`EndEffectorMesh`) will continue to set the group origin at the tool tip.
  primitives.push(tip)

  const totalLength = flangeThickness + collarWidth + tipThickness
  return {
    primitives,
    bbox: { length: totalLength, radius: flangeRadius * Math.SQRT2 },
  }
}
