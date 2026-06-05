/**
 * Prismatic joint mesh — STUB (RFD-12 owns the full visual treatment).
 *
 * Re-emits the existing rail + carriage geometry descriptors so the
 * 3-axis gantry template keeps working without regression.
 * TODO(RFD-12): replace this stub with a full token-driven recipe.
 */
import type { MachineTokens } from '../../design/machineTokens'
import type { MeshRecipe, BarrelPrimitive } from './recipes'

export interface PrismaticRecipeOptions {
  /** Total travel distance (limit_upper − limit_lower) in metres. */
  travelM: number
  /** Visual radius of the adjacent link barrel. */
  linkRadius: number
  tokens: MachineTokens
}

export function buildPrismaticRecipe(opts: PrismaticRecipeOptions): MeshRecipe {
  const { travelM, linkRadius, tokens } = opts
  const railRadius = linkRadius * tokens.proportions.linkRadiusScale * 0.35

  // Emit a minimal barrel so the recipe is non-empty and has a sane bbox.
  // ArmCanvas still renders the real rail/carriage meshes directly;
  // this recipe is a placeholder for the Mesh Lab preview only.
  const rail: BarrelPrimitive = {
    kind: 'barrel',
    halfLength: travelM / 2,
    radius: railRadius,
    bevelStart: 0,
    bevelEnd: 0,
    role: 'prismatic',
  }

  return {
    primitives: [rail],
    bbox: { length: travelM, radius: linkRadius * 1.2 },
  }
}
