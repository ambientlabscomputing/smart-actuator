/**
 * Pure-IR decorators — append shape-grammar detail to an existing recipe.
 *
 * Each decorator returns a NEW recipe (immutable) with extra primitives. The
 * input recipe's bbox is preserved unless the decorator explicitly extends it.
 * Decorators are Vitest-friendly: they manipulate plain data, no Three.js.
 */
import type {
  MeshRecipe,
  MeshPrimitive,
  MeshRole,
  FastenerPrimitive,
  CollarPrimitive,
  StatusLEDPrimitive,
  LabelPrimitive,
  TubePrimitive,
  BandPrimitive,
} from '../recipes'

function append(r: MeshRecipe, prims: MeshPrimitive[]): MeshRecipe {
  return { primitives: [...r.primitives, ...prims], bbox: r.bbox }
}

// ── Bolt circle ─────────────────────────────────────────────────────────────

export interface BoltCircleOptions {
  /** Axial position along +X of the bolt-circle plane. */
  axialPosition: number
  /** Distance from the X axis to each bolt centre. */
  circleRadius: number
  /** Number of bolts evenly spaced around the circle. */
  count: number
  /** Bolt-head diameter. */
  diameter: number
  /** Bolt-head depth. */
  depth: number
  /** Direction the bolt head faces (unit vector). Default +X. */
  normal?: [number, number, number]
  role?: MeshRole
  /** Starting angle offset (radians). Default 0. */
  phase?: number
}

/** Append a circle of fastener primitives in the YZ plane. */
export function addBoltCircle(r: MeshRecipe, opts: BoltCircleOptions): MeshRecipe {
  const { axialPosition, circleRadius, count, diameter, depth } = opts
  const normal: [number, number, number] = opts.normal ?? [+1, 0, 0]
  const role: MeshRole = opts.role ?? 'fastener'
  const phase = opts.phase ?? 0
  const bolts: FastenerPrimitive[] = []
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2
    bolts.push({
      kind: 'fastener',
      position: [axialPosition, Math.cos(a) * circleRadius, Math.sin(a) * circleRadius],
      normal,
      diameter,
      depth,
      role,
    })
  }
  return append(r, bolts)
}

// ── Gasket ring ─────────────────────────────────────────────────────────────

export interface GasketOptions {
  axialPosition: number
  outerRadius: number
  width: number
  /** Default role = 'rubber'. */
  role?: MeshRole
}

/** Append a thin rubber-roled collar to mark a seal between two parts. */
export function addGasketRing(r: MeshRecipe, opts: GasketOptions): MeshRecipe {
  const gasket: CollarPrimitive = {
    kind: 'collar',
    axialPosition: opts.axialPosition,
    outerRadius: opts.outerRadius,
    width: opts.width,
    bevel: 0,
    role: opts.role ?? 'rubber',
  }
  return append(r, [gasket])
}

// ── Status LED ──────────────────────────────────────────────────────────────

export interface StatusLEDOptions {
  position: [number, number, number]
  normal: [number, number, number]
  radius: number
  active: boolean
}

/** Append a single status LED; uses emissiveAccent when active, else innerFrame. */
export function addStatusLED(r: MeshRecipe, opts: StatusLEDOptions): MeshRecipe {
  const led: StatusLEDPrimitive = {
    kind: 'statusLED',
    position: opts.position,
    normal: opts.normal,
    radius: opts.radius,
    intensity: opts.active ? 1.0 : 0.0,
    role: opts.active ? 'emissiveAccent' : 'innerFrame',
  }
  return append(r, [led])
}

// ── Label plate ─────────────────────────────────────────────────────────────

export interface LabelOptions {
  position: [number, number, number]
  normal: [number, number, number]
  rotation?: number
  width: number
  height: number
  text: string
  role?: MeshRole
}

export function addLabelPlate(r: MeshRecipe, opts: LabelOptions): MeshRecipe {
  const label: LabelPrimitive = {
    kind: 'label',
    position: opts.position,
    normal: opts.normal,
    rotation: opts.rotation ?? 0,
    width: opts.width,
    height: opts.height,
    text: opts.text,
    role: opts.role ?? 'innerFrame',
  }
  return append(r, [label])
}

// ── Cable route ─────────────────────────────────────────────────────────────

export interface CableRouteOptions {
  points: [number, number, number][]
  radius: number
  role?: MeshRole
}

export function addCableRoute(r: MeshRecipe, opts: CableRouteOptions): MeshRecipe {
  const cable: TubePrimitive = {
    kind: 'tube',
    points: opts.points,
    radius: opts.radius,
    role: opts.role ?? 'cable',
  }
  return append(r, [cable])
}

// ── Alignment ticks ─────────────────────────────────────────────────────────

export interface AlignmentTicksOptions {
  /** Outer radius the ticks sit on. */
  outerRadius: number
  /** Axial position of the tick band. */
  axialPosition: number
  /** Tick thickness along +X. */
  width: number
  /** Tick depth (radial sink). */
  depth: number
  role?: MeshRole
}

/** A single etched ring used as an alignment / index mark. */
export function addAlignmentTicks(r: MeshRecipe, opts: AlignmentTicksOptions): MeshRecipe {
  const band: BandPrimitive = {
    kind: 'band',
    axialPosition: opts.axialPosition,
    outerRadius: opts.outerRadius,
    width: opts.width,
    depth: opts.depth,
    role: opts.role ?? 'shadowInset',
  }
  return append(r, [band])
}
