/**
 * recipeToThree — converts a MeshRecipe into R3F JSX.
 *
 * Each semantic primitive in the recipe is turned into Three.js geometry,
 * then rendered as a <mesh> using the material from the MaterialMap.
 * Geometry parameters are scaled by the active quality level.
 *
 * Convention for geometry orientation:
 *  - Recipe space: +X = part axis (link / barrel forward), +Z = up at origin.
 *  - Three.js cylinder / cone geometries are along +Y; we rotate -π/2 about Z
 *    so the local +Y axis points along the recipe +X axis.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type {
  MeshRecipe,
  MeshPrimitive,
  BarrelPrimitive,
  CapPrimitive,
  BandPrimitive,
  SeamPrimitive,
  FastenerPrimitive,
  CollarPrimitive,
  PlatePrimitive,
  BossPrimitive,
  TubePrimitive,
  PanelPrimitive,
  LabelPrimitive,
  StatusLEDPrimitive,
  ProfileExtrusionPrimitive,
} from './recipes'
import type { MaterialMap } from './MaterialRegistry'
import { qualitySpecs, type MeshQuality } from '../../design/machineTokens'

interface RecipeToThreeProps {
  recipe: MeshRecipe
  materials: MaterialMap
  quality: MeshQuality
  castShadow?: boolean
  receiveShadow?: boolean
}

// ── Orientation helpers ──────────────────────────────────────────────────────

/** Quaternion that rotates the local +Y axis to point along `targetAxis`. */
function quatFromYToAxis(targetAxis: THREE.Vector3): THREE.Quaternion {
  const from = new THREE.Vector3(0, 1, 0)
  const to = targetAxis.clone().normalize()
  return new THREE.Quaternion().setFromUnitVectors(from, to)
}

/** Quaternion that rotates the local +Z axis to point along `targetNormal`. */
function quatFromZToNormal(targetNormal: THREE.Vector3): THREE.Quaternion {
  const from = new THREE.Vector3(0, 0, 1)
  const to = targetNormal.clone().normalize()
  return new THREE.Quaternion().setFromUnitVectors(from, to)
}

/** Build a 2D Shape for a profile cross-section in the YZ plane. */
function buildProfileShape(
  profile: 'rounded_rect' | 'capsule' | 'hex',
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
): THREE.Shape {
  const shape = new THREE.Shape()
  if (profile === 'hex') {
    const r = Math.max(halfWidth, halfHeight)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return shape
  }
  const r =
    profile === 'capsule'
      ? Math.min(halfWidth, halfHeight)
      : Math.min(cornerRadius, halfWidth, halfHeight)
  const w = halfWidth
  const h = halfHeight
  shape.moveTo(-w + r, -h)
  shape.lineTo(w - r, -h)
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(w, h - r)
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-w + r, h)
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-w, -h + r)
  shape.absarc(-w + r, -h + r, r, Math.PI, (3 * Math.PI) / 2, false)
  shape.closePath()
  return shape
}

// ── Per-primitive renderers ──────────────────────────────────────────────────

interface NodeProps<P extends MeshPrimitive> {
  prim: P
  mat: THREE.Material
  q: (typeof qualitySpecs)[MeshQuality]
  castShadow?: boolean
  receiveShadow?: boolean
}

function BarrelNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<BarrelPrimitive>) {
  const total = prim.halfLength * 2
  return (
    <mesh
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[prim.radius, prim.radius, total, q.radialSegments]} />
    </mesh>
  )
}

function CapNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<CapPrimitive>) {
  return (
    <mesh
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[prim.radius, prim.radius, prim.thickness, q.radialSegments]} />
    </mesh>
  )
}

function BandNode({ prim, mat, q, receiveShadow }: NodeProps<BandPrimitive>) {
  const r = Math.max(prim.outerRadius - prim.depth, prim.outerRadius * 0.85)
  return (
    <mesh
      position={[prim.axialPosition, 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={false}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[r, r, prim.width, q.radialSegments]} />
    </mesh>
  )
}

function SeamNode({ prim, mat }: NodeProps<SeamPrimitive>) {
  return (
    <mesh
      rotation={[prim.angle, 0, 0]}
      castShadow={false}
      receiveShadow={false}
      material={mat}
    >
      <boxGeometry args={[prim.length, prim.width, prim.depth]} />
    </mesh>
  )
}

function FastenerNode({ prim, mat }: NodeProps<FastenerPrimitive>) {
  const q4 = quatFromYToAxis(new THREE.Vector3(...prim.normal))
  return (
    <mesh
      position={prim.position}
      quaternion={[q4.x, q4.y, q4.z, q4.w]}
      castShadow={false}
      receiveShadow={false}
      material={mat}
    >
      <cylinderGeometry args={[prim.diameter / 2, prim.diameter / 2, prim.depth, 8]} />
    </mesh>
  )
}

function CollarNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<CollarPrimitive>) {
  return (
    <mesh
      position={[prim.axialPosition, 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[prim.outerRadius, prim.outerRadius, prim.width, q.radialSegments]} />
    </mesh>
  )
}

function PlateNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<PlatePrimitive>) {
  if (prim.shape === 'square') {
    return (
      <mesh
        position={[prim.axialPosition, 0, 0]}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        material={mat}
      >
        <boxGeometry args={[prim.thickness, prim.radius * 2, prim.radius * 2]} />
      </mesh>
    )
  }
  return (
    <mesh
      position={[prim.axialPosition, 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[prim.radius, prim.radius, prim.thickness, q.radialSegments]} />
    </mesh>
  )
}

function BossNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<BossPrimitive>) {
  const axis = new THREE.Vector3(...prim.axis).normalize()
  const q4 = quatFromYToAxis(axis)
  // Place cylinder centre at offset + axis * (length/2) so base sits at offset.
  const centre = new THREE.Vector3(...prim.offset).add(axis.clone().multiplyScalar(prim.length / 2))
  return (
    <mesh
      position={[centre.x, centre.y, centre.z]}
      quaternion={[q4.x, q4.y, q4.z, q4.w]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry args={[prim.radius, prim.radius, prim.length, q.radialSegments]} />
    </mesh>
  )
}

function TubeNode({ prim, mat, q, receiveShadow }: NodeProps<TubePrimitive>) {
  const geom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(prim.points.map((p) => new THREE.Vector3(...p)))
    return new THREE.TubeGeometry(curve, Math.max(8, q.radialSegments * 2), prim.radius, 8, false)
  }, [prim.points, prim.radius, q.radialSegments])
  return (
    <mesh castShadow={false} receiveShadow={receiveShadow} material={mat}>
      <primitive object={geom} attach="geometry" />
    </mesh>
  )
}

function PanelNode({ prim, mat, q, castShadow, receiveShadow }: NodeProps<PanelPrimitive>) {
  return (
    <mesh
      position={[prim.axialPosition, 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      material={mat}
    >
      <cylinderGeometry
        args={[
          prim.radius,
          prim.radius,
          prim.length,
          q.radialSegments,
          1,
          true,
          prim.thetaStart,
          prim.thetaLength,
        ]}
      />
    </mesh>
  )
}

function LabelNode({ prim, mat }: NodeProps<LabelPrimitive>) {
  const normal = new THREE.Vector3(...prim.normal)
  const baseQ = quatFromZToNormal(normal)
  const spinQ = new THREE.Quaternion().setFromAxisAngle(normal.clone().normalize(), prim.rotation)
  const q4 = spinQ.multiply(baseQ)
  return (
    <mesh
      position={prim.position}
      quaternion={[q4.x, q4.y, q4.z, q4.w]}
      castShadow={false}
      receiveShadow={false}
      material={mat}
    >
      <planeGeometry args={[prim.width, prim.height]} />
    </mesh>
  )
}

function StatusLEDNode({ prim, mat }: NodeProps<StatusLEDPrimitive>) {
  const q4 = quatFromYToAxis(new THREE.Vector3(...prim.normal))
  return (
    <mesh
      position={prim.position}
      quaternion={[q4.x, q4.y, q4.z, q4.w]}
      castShadow={false}
      receiveShadow={false}
      material={mat}
    >
      <cylinderGeometry args={[prim.radius, prim.radius, prim.radius * 0.4, 16]} />
    </mesh>
  )
}

function ProfileExtrusionNode({
  prim,
  mat,
  q,
  castShadow,
  receiveShadow,
}: NodeProps<ProfileExtrusionPrimitive>) {
  const geom = useMemo(() => {
    const shape = buildProfileShape(prim.profile, prim.halfWidth, prim.halfHeight, prim.cornerRadius)
    const settings: THREE.ExtrudeGeometryOptions = {
      depth: prim.length,
      bevelEnabled: prim.bevel > 0,
      bevelSize: prim.bevel,
      bevelThickness: prim.bevel,
      bevelSegments: 2,
      curveSegments: Math.max(8, q.radialSegments),
    }
    const g = new THREE.ExtrudeGeometry(shape, settings)
    // ExtrudeGeometry runs along +Z; rotate to +X and centre.
    g.rotateY(Math.PI / 2)
    g.translate(-prim.length / 2, 0, 0)
    return g
  }, [
    prim.profile,
    prim.halfWidth,
    prim.halfHeight,
    prim.cornerRadius,
    prim.length,
    prim.bevel,
    q.radialSegments,
  ])
  return (
    <mesh castShadow={castShadow} receiveShadow={receiveShadow} material={mat}>
      <primitive object={geom} attach="geometry" />
    </mesh>
  )
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function PrimitiveNode({
  prim,
  materials,
  quality,
  castShadow,
  receiveShadow,
}: {
  prim: MeshPrimitive
  materials: MaterialMap
  quality: MeshQuality
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const q = qualitySpecs[quality]
  const mat = materials[prim.role] ?? materials.link

  const common = { mat, q, castShadow, receiveShadow }

  switch (prim.kind) {
    case 'barrel':
      return <BarrelNode prim={prim} {...common} />
    case 'cap':
      return <CapNode prim={prim} {...common} />
    case 'band':
      return <BandNode prim={prim} {...common} />
    case 'seam':
      return <SeamNode prim={prim} {...common} />
    case 'fastener':
      return <FastenerNode prim={prim} {...common} />
    case 'collar':
      return <CollarNode prim={prim} {...common} />
    case 'plate':
      return <PlateNode prim={prim} {...common} />
    case 'boss':
      return <BossNode prim={prim} {...common} />
    case 'tube':
      return <TubeNode prim={prim} {...common} />
    case 'panel':
      return <PanelNode prim={prim} {...common} />
    case 'label':
      return <LabelNode prim={prim} {...common} />
    case 'statusLED':
      return <StatusLEDNode prim={prim} {...common} />
    case 'profileExtrusion':
      return <ProfileExtrusionNode prim={prim} {...common} />
    default:
      return null
  }
}

/**
 * Renders a MeshRecipe as a flat list of R3F mesh nodes.
 * Wrap this in a <group> with the appropriate frame matrix at the call site.
 */
export function RecipeNodes({
  recipe,
  materials,
  quality,
  castShadow,
  receiveShadow,
}: RecipeToThreeProps) {
  return (
    <>
      {recipe.primitives.map((prim, i) => (
        <PrimitiveNode
          key={i}
          prim={prim}
          materials={materials}
          quality={quality}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  )
}
