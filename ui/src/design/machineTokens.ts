/**
 * Machine design tokens — pure numbers consumed by procedural mesh generators.
 *
 * No Three.js imports. No React. Safe to import from Vitest tests.
 *
 * Every magic number that would otherwise be scattered through mesh files
 * lives here as a named token. Mesh functions receive a `MachineTokens`
 * object and must not invent additional literal constants.
 */

// ── Quality levels ───────────────────────────────────────────────────────────

export type MeshQuality = 'low' | 'medium' | 'hero'

export interface QualitySpec {
  /** Radial segments for barrels / cylinders */
  radialSegments: number
  /** Number of ring steps per bevel edge */
  bevelSegments: number
  /** Divisions along a seam slot */
  seamSegments: number
  /** Cap face subdivisions (per disc) */
  capSegments: number
}

export const qualitySpecs: Record<MeshQuality, QualitySpec> = {
  low: {
    radialSegments: 8,
    bevelSegments: 1,
    seamSegments: 1,
    capSegments: 1,
  },
  medium: {
    radialSegments: 18,
    bevelSegments: 2,
    seamSegments: 2,
    capSegments: 1,
  },
  hero: {
    radialSegments: 36,
    bevelSegments: 3,
    seamSegments: 4,
    capSegments: 2,
  },
}

// ── Geometry tokens ──────────────────────────────────────────────────────────

export interface GeometryTokens {
  /** Bevel chamfer sizes (fraction of joint radius) */
  bevel: {
    sm: number
    md: number
    lg: number
  }
  seam: {
    /** Width of the longitudinal groove (metres, relative to radius 1) */
    width: number
    /** Depth of the groove (same units) */
    depth: number
  }
  insetBand: {
    /** Width of the inset band at joint attachment points (fraction of link length) */
    width: number
    /** Inset depth (fraction of radius) */
    depth: number
  }
  fasteners: {
    /** Decorative fastener diameter (fraction of radius) */
    diameter: number
    /** Depth of countersink (fraction of radius) */
    depth: number
  }
}

// ── Proportion tokens ────────────────────────────────────────────────────────

export interface ProportionTokens {
  /**
   * Ratio of link barrel radius to link length.
   * Controls how "chunky" vs "thin" links look independent of `radius` prop.
   * At 1 the passed `radius` is used as-is; <1 thins the barrel at the token level.
   */
  linkRadiusScale: number
  /** Hub barrel radius relative to the link radius */
  hubToLinkRadius: number
  /** Hub barrel half-length relative to the link radius */
  hubHalfLengthToRadius: number
  /** Tool cap disc radius relative to link radius */
  toolCapRadiusToLinkRadius: number
  /** Tool cap disc thickness relative to link radius */
  toolCapThicknessToRadius: number
  /** Centre-mark inset radius on the tool cap (fraction of cap radius) */
  toolCapCentreMarkRadius: number
}

// ── Full machine token set ───────────────────────────────────────────────────

export interface MachineTokens {
  geometry: GeometryTokens
  proportions: ProportionTokens
}

// ── Preset token values ──────────────────────────────────────────────────────

/**
 * `baseline` — token values that reproduce the current plain-primitive look.
 * Zero chamfers and seams so the mesh matches what ArmCanvas rendered before
 * Box 2. Useful as a reference / rollback in Mesh Lab.
 */
export const baselineTokens: MachineTokens = {
  geometry: {
    bevel: { sm: 0, md: 0, lg: 0 },
    seam: { width: 0, depth: 0 },
    insetBand: { width: 0, depth: 0 },
    fasteners: { diameter: 0, depth: 0 },
  },
  proportions: {
    linkRadiusScale: 1.0,
    hubToLinkRadius: 1.6,
    hubHalfLengthToRadius: 1.0,
    toolCapRadiusToLinkRadius: 0.6,
    toolCapThicknessToRadius: 0.35,
    toolCapCentreMarkRadius: 0.3,
  },
}

/**
 * `machined` — the Box 2 default. Adds chamfered ends, a subtle seam, and
 * inset bands at joint attachment points. Looks machined without being busy.
 */
export const machinedTokens: MachineTokens = {
  geometry: {
    bevel: { sm: 0.08, md: 0.14, lg: 0.22 },
    seam: { width: 0.06, depth: 0.04 },
    insetBand: { width: 0.12, depth: 0.06 },
    fasteners: { diameter: 0.08, depth: 0.05 },
  },
  proportions: {
    linkRadiusScale: 1.0,
    hubToLinkRadius: 1.55,
    hubHalfLengthToRadius: 0.85,
    toolCapRadiusToLinkRadius: 0.55,
    toolCapThicknessToRadius: 0.30,
    toolCapCentreMarkRadius: 0.28,
  },
}

/**
 * `skeletonized` — maximum open geometry. Wider seams, deeper inset bands,
 * smaller barrels. Good for reveal animations or future articulated frames.
 */
export const skeletonizedTokens: MachineTokens = {
  geometry: {
    bevel: { sm: 0.06, md: 0.12, lg: 0.20 },
    seam: { width: 0.18, depth: 0.12 },
    insetBand: { width: 0.22, depth: 0.14 },
    fasteners: { diameter: 0.10, depth: 0.07 },
  },
  proportions: {
    linkRadiusScale: 0.85,
    hubToLinkRadius: 1.35,
    hubHalfLengthToRadius: 0.70,
    toolCapRadiusToLinkRadius: 0.45,
    toolCapThicknessToRadius: 0.22,
    toolCapCentreMarkRadius: 0.25,
  },
}
