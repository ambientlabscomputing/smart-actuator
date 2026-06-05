/**
 * buildLinkRecipe — procedural link barrel.
 *
 * Produces a MeshRecipe for a link of the given `length` (DH parameter `a`).
 * The barrel extends along +X from the origin; bevel chamfers are added at
 * each end; a single longitudinal seam runs along the top; an inset band is
 * placed at each joint-attachment point.
 *
 * Pure TypeScript — no Three.js dependency.
 */
import type { MachineTokens } from '../../design/machineTokens'
import type {
  MeshRecipe,
  BarrelPrimitive,
  BandPrimitive,
  SeamPrimitive,
} from './recipes'

export type JointKind = 'revolute' | 'prismatic' | 'none'

export interface LinkRecipeOptions {
  /** DH link length `a` in metres. */
  length: number
  /** Joint type attached at the −X (start) end. */
  startJoint: JointKind
  /** Joint type attached at the +X (end) end. */
  endJoint: JointKind
  /** Visual radius of the link barrel (metres). */
  radius: number
  /** Token set driving proportions and detail. */
  tokens: MachineTokens
  /** Link index — used to pick role from the colour rotation. Not stored here;
   *  the React wrapper maps index → role externally. */
}

export function buildLinkRecipe(opts: LinkRecipeOptions): MeshRecipe {
  const { length, radius, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const r = radius * p.linkRadiusScale
  const halfLength = length / 2
  const bevelSize = r * t.bevel.sm

  const primitives: MeshRecipe['primitives'] = []

  // ── Main barrel ────────────────────────────────────────────────────────────
  const barrel: BarrelPrimitive = {
    kind: 'barrel',
    halfLength,
    radius: r,
    bevelStart: bevelSize,
    bevelEnd: bevelSize,
    role: 'link',
  }
  primitives.push(barrel)

  // ── Inset bands at each end (where the joint hub attaches) ─────────────────
  if (t.insetBand.width > 0 && t.insetBand.depth > 0) {
    const bandHalfWidth = r * t.insetBand.width * 0.5
    const startBand: BandPrimitive = {
      kind: 'band',
      axialPosition: -halfLength + bandHalfWidth + bevelSize,
      outerRadius: r,
      width: r * t.insetBand.width,
      depth: r * t.insetBand.depth,
      role: 'shadowInset',
    }
    const endBand: BandPrimitive = {
      kind: 'band',
      axialPosition: halfLength - bandHalfWidth - bevelSize,
      outerRadius: r,
      width: r * t.insetBand.width,
      depth: r * t.insetBand.depth,
      role: 'shadowInset',
    }
    primitives.push(startBand, endBand)
  }

  // ── Longitudinal seam ──────────────────────────────────────────────────────
  if (t.seam.width > 0 && t.seam.depth > 0) {
    const seam: SeamPrimitive = {
      kind: 'seam',
      angle: 0, // top of the barrel
      width: r * t.seam.width,
      depth: r * t.seam.depth,
      length: length * 0.80,
      role: 'shadowInset',
    }
    primitives.push(seam)
  }

  return {
    primitives,
    bbox: { length, radius: r },
  }
}
