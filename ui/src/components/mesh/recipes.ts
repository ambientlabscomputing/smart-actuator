/**
 * Mesh recipe IR — semantic intermediate representation for procedural meshes.
 *
 * Pure TypeScript, no Three.js. Generators build a MeshRecipe; `recipeToThree`
 * in the React layer converts it to BufferGeometry instances. This separation
 * lets Vitest smoke-test geometry logic without a DOM or WebGL context.
 *
 * Coordinate convention: all dimensions in metres; +X = link axis,
 * +Z = joint rotation axis (matching the DH/brain convention).
 */

// ── Primitive types ──────────────────────────────────────────────────────────

/** A round barrel section (link body or joint hub). */
export interface BarrelPrimitive {
  kind: 'barrel'
  /** Half-length of the barrel (total = 2 × halfLength). */
  halfLength: number
  radius: number
  /** Bevel chamfer on the −X end (0 = sharp square edge). */
  bevelStart: number
  /** Bevel chamfer on the +X end. */
  bevelEnd: number
  /** Semantic role driving material selection. */
  role: MeshRole
}

/** A flat disc cap (end-effector face, hub cap, shoulder disc). */
export interface CapPrimitive {
  kind: 'cap'
  radius: number
  thickness: number
  /** Bevel chamfer on the outer rim. */
  bevel: number
  /** Optional inset centre mark radius (0 = no mark). */
  centreMarkRadius: number
  role: MeshRole
}

/** A narrow ring around a barrel at a fixed axial position (etched groove or accent). */
export interface BandPrimitive {
  kind: 'band'
  /** Axial position of the band centre along +X from the parent barrel origin. */
  axialPosition: number
  /** Outer radius of the band ring (renderer uses this to size geometry). */
  outerRadius: number
  /** Band axial width (thickness along +X). */
  width: number
  /** Radial inset depth (how far the band sinks into the barrel surface). */
  depth: number
  role: MeshRole
}

/** A single longitudinal groove along a barrel surface. */
export interface SeamPrimitive {
  kind: 'seam'
  /** Angular position of the seam centre (radians around +X axis). */
  angle: number
  width: number
  depth: number
  /** Actual length of the groove in metres (not a fraction). */
  length: number
  role: MeshRole
}

/** A countersunk decorative fastener dot on a flat face. */
export interface FastenerPrimitive {
  kind: 'fastener'
  /** Position in the parent frame. */
  position: [number, number, number]
  /** Direction the screw head points (unit vector). */
  normal: [number, number, number]
  diameter: number
  depth: number
  role: MeshRole
}

/** A wider ring section at a barrel end — visually marks the bolted attachment. */
export interface CollarPrimitive {
  kind: 'collar'
  /** Axial position along +X where the collar centres. */
  axialPosition: number
  /** Outer radius (typically > the barrel's radius). */
  outerRadius: number
  /** Axial length of the collar. */
  width: number
  /** Bevel chamfer on the outer rim. */
  bevel: number
  role: MeshRole
}

/** A flat bolted flange perpendicular to a barrel axis. */
export interface PlatePrimitive {
  kind: 'plate'
  /** Axial position along +X where the plate sits. */
  axialPosition: number
  /** Outer radius / half-extent of the plate. */
  radius: number
  /** Thickness along +X. */
  thickness: number
  /** When 'circle', renders as a disc; when 'square', as a rounded square. */
  shape: 'circle' | 'square'
  role: MeshRole
}

/** An off-axis cylindrical bump (motor pod, encoder cap). */
export interface BossPrimitive {
  kind: 'boss'
  /** Centre offset from the parent frame origin (metres). */
  offset: [number, number, number]
  /** Boss axis direction — unit vector. The cylinder extends from offset along +axis by `length`. */
  axis: [number, number, number]
  radius: number
  length: number
  /** Bevel chamfer on the exposed end. */
  bevel: number
  role: MeshRole
}

/** A thin extruded spline (cable, hose). */
export interface TubePrimitive {
  kind: 'tube'
  /** Polyline of points in the parent frame. */
  points: [number, number, number][]
  radius: number
  role: MeshRole
}

/** A curved shell segment — angular slice of a barrel, with a gap. */
export interface PanelPrimitive {
  kind: 'panel'
  /** Axial position along +X of the panel centre. */
  axialPosition: number
  /** Axial length. */
  length: number
  /** Barrel outer radius the panel wraps. */
  radius: number
  /** Panel thickness (radial). */
  thickness: number
  /** Angular start (radians). */
  thetaStart: number
  /** Angular span (radians). */
  thetaLength: number
  role: MeshRole
}

/** A tiny canvas-texture label plane on a flat face. */
export interface LabelPrimitive {
  kind: 'label'
  /** Position in the parent frame. */
  position: [number, number, number]
  /** Plane normal direction (unit vector). */
  normal: [number, number, number]
  /** In-plane rotation around the normal (radians). */
  rotation: number
  width: number
  height: number
  text: string
  role: MeshRole
}

/** A small emissive disc. */
export interface StatusLEDPrimitive {
  kind: 'statusLED'
  position: [number, number, number]
  /** Normal of the LED face (unit vector). */
  normal: [number, number, number]
  radius: number
  /** Emissive intensity multiplier (0 = off). */
  intensity: number
  role: MeshRole
}

/** Extruded 2D cross-section along a length (rounded-rect / hex / capsule links). */
export interface ProfileExtrusionPrimitive {
  kind: 'profileExtrusion'
  /** Cross-section profile name. */
  profile: 'rounded_rect' | 'capsule' | 'hex'
  /** Half-width of the cross-section bounding box (Y). */
  halfWidth: number
  /** Half-height of the cross-section bounding box (Z). */
  halfHeight: number
  /** Corner radius for rounded_rect / capsule. */
  cornerRadius: number
  /** Total length along +X. */
  length: number
  /** Bevel size on each end face. */
  bevel: number
  role: MeshRole
}

export type MeshPrimitive =
  | BarrelPrimitive
  | CapPrimitive
  | BandPrimitive
  | SeamPrimitive
  | FastenerPrimitive
  | CollarPrimitive
  | PlatePrimitive
  | BossPrimitive
  | TubePrimitive
  | PanelPrimitive
  | LabelPrimitive
  | StatusLEDPrimitive
  | ProfileExtrusionPrimitive

// ── Material roles ───────────────────────────────────────────────────────────

/**
 * Semantic material roles. The MaterialRegistry maps each role to a
 * MeshStandardMaterial with the correct colour / roughness / metalness.
 */
export type MeshRole =
  // Box 2 legacy roles (kept for back-compat)
  | 'link'
  | 'revolute'
  | 'prismatic'
  | 'ee'
  | 'eeActive'
  | 'base'
  | 'shadowInset'
  // Box 2b expanded roles for the lab_instrument family
  | 'shell'           // off-white / pale graphite link bodies
  | 'innerFrame'      // darker structural elements visible through panel gaps
  | 'jointHousing'    // warm grey / dark brushed actuator shells
  | 'bearing'         // polished metal ring
  | 'fastener'        // dark hex screws
  | 'rubber'          // matte black gasket
  | 'cable'           // matte black cable
  | 'glassField'      // translucent smoked glass for motion fields
  | 'emissiveAccent'  // active/selection glow + status LEDs

// ── Bounding box ─────────────────────────────────────────────────────────────

export interface Bbox {
  /** Extent along +X from origin (metres). */
  length: number
  /** Maximum radius from the X axis (metres). */
  radius: number
}

// ── Recipe ───────────────────────────────────────────────────────────────────

/**
 * A complete mesh recipe: an ordered list of primitives plus an overall
 * bounding box. The renderer converts each primitive into Three.js geometry
 * using the active quality level.
 */
export interface MeshRecipe {
  primitives: MeshPrimitive[]
  bbox: Bbox
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the length of the link axis covered by the recipe (metres). */
export function recipeLength(r: MeshRecipe): number {
  return r.bbox.length
}

/** Returns the outermost radius of the recipe (metres). */
export function recipeRadius(r: MeshRecipe): number {
  return r.bbox.radius
}

/** Returns a new recipe with primitives appended. Pure / immutable. */
export function withPrimitives(r: MeshRecipe, extra: MeshPrimitive[]): MeshRecipe {
  return {
    primitives: [...r.primitives, ...extra],
    bbox: r.bbox,
  }
}

/** Empty recipe — useful as a decorator starting point. */
export function emptyRecipe(length = 0, radius = 0): MeshRecipe {
  return { primitives: [], bbox: { length, radius } }
}
