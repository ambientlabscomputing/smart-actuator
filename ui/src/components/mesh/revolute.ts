/**
 * buildRevoluteRecipe — procedural revolute joint hub.
 *
 * Produces a MeshRecipe for a revolute joint: a short barrel oriented along
 * the joint's rotation axis (+Z in DH convention), with a visible inset ring
 * indicating the rotation axis direction, a tokenized seam line, and an
 * optional accent band when the joint is `active`.
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

export interface RevoluteRecipeOptions {
  /** Visual radius of the adjacent link barrel (metres).
   *  The hub radius is derived from this via `hubToLinkRadius` token. */
  linkRadius: number
  /** When true, add an accent band (for Box 7 active-state extension). */
  active?: boolean
  /** Token set driving proportions and detail. */
  tokens: MachineTokens
}

export function buildRevoluteRecipe(opts: RevoluteRecipeOptions): MeshRecipe {
  const { linkRadius, active = false, tokens } = opts
  const t = tokens.geometry
  const p = tokens.proportions

  const hubRadius = linkRadius * p.hubToLinkRadius
  const hubHalfLength = hubRadius * p.hubHalfLengthToRadius
  const bevel = hubRadius * t.bevel.md

  const primitives: MeshRecipe['primitives'] = []

  // ── Main hub barrel ────────────────────────────────────────────────────────
  const barrel: BarrelPrimitive = {
    kind: 'barrel',
    halfLength: hubHalfLength,
    radius: hubRadius,
    bevelStart: bevel,
    bevelEnd: bevel,
    role: 'revolute',
  }
  primitives.push(barrel)

  // ── Inset ring (rotation-axis indicator) ───────────────────────────────────
  if (t.insetBand.width > 0 && t.insetBand.depth > 0) {
    const ring: BandPrimitive = {
      kind: 'band',
      axialPosition: 0, // equator
      outerRadius: hubRadius,
      width: hubRadius * t.insetBand.width * 0.8,
      depth: hubRadius * t.insetBand.depth,
      role: 'shadowInset',
    }
    primitives.push(ring)
  }

  // ── Seam ──────────────────────────────────────────────────────────────────
  if (t.seam.width > 0 && t.seam.depth > 0) {
    const seam: SeamPrimitive = {
      kind: 'seam',
      angle: Math.PI / 4, // 45° from top
      width: hubRadius * t.seam.width,
      depth: hubRadius * t.seam.depth,
      length: hubHalfLength * 2 * 0.70,
      role: 'shadowInset',
    }
    primitives.push(seam)
  }

  // ── Active accent band (Box 7 hook; static appearance here) ───────────────
  if (active && t.insetBand.width > 0) {
    const accentBand: BandPrimitive = {
      kind: 'band',
      axialPosition: hubHalfLength * 0.55,
      outerRadius: hubRadius,
      width: hubRadius * t.insetBand.width * 0.5,
      depth: hubRadius * t.insetBand.depth * 0.4,
      role: 'revolute', // rendered in accent colour via MaterialRegistry in Box 4
    }
    primitives.push(accentBand)
  }

  return {
    primitives,
    bbox: {
      // Hub barrel is oriented along the joint axis (not the link +X axis).
      // Length here is the hub's axial extent for the renderer to size its geometry.
      length: hubHalfLength * 2,
      radius: hubRadius,
    },
  }
}
