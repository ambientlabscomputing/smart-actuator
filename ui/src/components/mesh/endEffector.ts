/**
 * buildEndEffectorRecipe — procedural end-effector cap.
 *
 * Replaces the plain sphere with a flat disc + chamfered outer rim +
 * optional centre-mark inset, oriented in the tool frame's XY plane.
 * The cap reads as a tool mount (a machined face) rather than a debug marker.
 *
 * Pure TypeScript — no Three.js dependency.
 */
import type { MachineTokens } from '../../design/machineTokens'
import type { MeshRecipe, CapPrimitive } from './recipes'

export interface EndEffectorRecipeOptions {
  /** Visual radius of the adjacent link barrel (metres). */
  linkRadius: number
  /** When true, use active/drag visual role. */
  active?: boolean
  tokens: MachineTokens
}

export function buildEndEffectorRecipe(opts: EndEffectorRecipeOptions): MeshRecipe {
  const { linkRadius, active = false, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const capRadius = linkRadius * p.toolCapRadiusToLinkRadius
  const capThickness = linkRadius * p.toolCapThicknessToRadius
  const bevel = capRadius * t.bevel.sm
  const centreMarkRadius = capRadius * p.toolCapCentreMarkRadius

  const primitives: MeshRecipe['primitives'] = []

  // ── Main disc cap ──────────────────────────────────────────────────────────
  const cap: CapPrimitive = {
    kind: 'cap',
    radius: capRadius,
    thickness: capThickness,
    bevel,
    centreMarkRadius,
    role: active ? 'eeActive' : 'ee',
  }
  primitives.push(cap)

  return {
    primitives,
    bbox: {
      length: capThickness,
      radius: capRadius,
    },
  }
}
