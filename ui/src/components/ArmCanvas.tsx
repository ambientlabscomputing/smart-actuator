/**
 * ArmCanvas — renders a revolute serial chain using standard DH transforms.
 *
 * The chain is built from per-joint DH parameters:
 *   T_i = T_{i-1} · Rz(θ_offset + angle) · Tz(d) · Tx(a) · Rx(α)
 *
 * Each link is a cylinder extending along its joint frame's +X by length a.
 * Joints rotate about their frame's +Z axis. Joint-limit arc wedges are
 * drawn in each joint's XY plane spanning [θ_offset + lower, θ_offset + upper].
 *
 * Backward-compat: callers that pass only `linkLengths` get a synthetic
 * chain with d=α=θ_offset=0, which produces the original planar XY arm.
 */
import { useMemo, useState } from 'react'
import * as THREE from 'three'
import type { DHJointValues, WorkspaceResult } from '../lib/types'

interface ArmCanvasProps {
  /** Current joint angles in radians, one per joint in slot order. */
  anglesRad: number[]
  /** Legacy: per-link length when dhJoints is not provided. */
  linkLengths: number[]
  /** Visual cylinder radius for all links. */
  radius?: number
  /**
   * Optional full DH chain. When provided, supersedes linkLengths and the
   * preview reflects d, alpha, theta_offset, and asymmetric limits.
   */
  dhJoints?: DHJointValues[]
  /** Legacy symmetric travel limits in degrees (one per joint). */
  jointLimitsDeg?: number[]
  /**
   * Called when a joint sphere (actuator) is clicked.
   * index = actuator slot index (0 = shoulder, 1 = elbow, …)
   */
  onJointClick?: (index: number) => void
  /** Pre-computed reachable workspace to render as an overlay hull. */
  workspace?: WorkspaceResult | null
  /** When true, also render the raw sampled point cloud (default false). */
  showWorkspacePoints?: boolean
}

const LINK_COLORS = ['#4fc3f7', '#81d4fa', '#b3e5fc']
const ARC_SEGS = 64
const DEG = Math.PI / 180

export function ArmCanvas({
  anglesRad,
  linkLengths,
  radius = 0.05,
  dhJoints,
  jointLimitsDeg,
  onJointClick,
  workspace,
  showWorkspacePoints = false,
}: ArmCanvasProps) {
  // Build a uniform joint list. If dhJoints isn't given, synthesise from
  // linkLengths so old callers keep working.
  const joints = useMemo<DHJointValues[]>(() => {
    if (dhJoints && dhJoints.length > 0) return dhJoints
    return linkLengths.map((a, i) => ({
      name: `joint${i}`,
      slot: i,
      a,
      d: 0,
      alpha: 0,
      theta_offset: 0,
      limit_lower: jointLimitsDeg?.[i] !== undefined ? -jointLimitsDeg[i] : -180,
      limit_upper: jointLimitsDeg?.[i] !== undefined ? jointLimitsDeg[i] : 180,
      mass: 1,
    }))
  }, [dhJoints, linkLengths, jointLimitsDeg])

  // Always render every defined joint. Pad missing telemetry angles with 0
  // so joints show at their resting position when offline or partially connected.
  const nJoints = joints.length

  // ── Forward kinematics ──────────────────────────────────────────────────────
  const frames = useMemo(() => {
    const result: Array<{
      preJointMatrix: THREE.Matrix4
      linkFrameMatrix: THREE.Matrix4
      jointOrigin: THREE.Vector3
      a: number
      limitLowerRad: number
      limitUpperRad: number
      thetaOffsetRad: number
    }> = []

    let T = new THREE.Matrix4()  // identity = world base frame

    for (let i = 0; i < nJoints; i++) {
      const j = joints[i]
      const preJointMatrix = T.clone()

      const theta = j.theta_offset * DEG + (anglesRad[i] ?? 0)

      // T_joint = T · Rz(theta) · Tz(d)
      const Rz = new THREE.Matrix4().makeRotationZ(theta)
      const Tz = new THREE.Matrix4().makeTranslation(0, 0, j.d)
      const linkFrameMatrix = preJointMatrix.clone().multiply(Rz).multiply(Tz)

      const jointOrigin = new THREE.Vector3().setFromMatrixPosition(linkFrameMatrix)

      // Next base: link tip · Rx(alpha)
      const Tx = new THREE.Matrix4().makeTranslation(j.a, 0, 0)
      const Rx = new THREE.Matrix4().makeRotationX(j.alpha * DEG)
      T = linkFrameMatrix.clone().multiply(Tx).multiply(Rx)

      result.push({
        preJointMatrix,
        linkFrameMatrix,
        jointOrigin,
        a: j.a,
        limitLowerRad: j.limit_lower * DEG,
        limitUpperRad: j.limit_upper * DEG,
        thetaOffsetRad: j.theta_offset * DEG,
      })
    }

    // End-effector pose (tip of last link) in world frame
    let eePos: THREE.Vector3 | null = null
    let eeMatrix: THREE.Matrix4 | null = null
    if (result.length > 0) {
      const last = result[result.length - 1]
      eeMatrix = last.linkFrameMatrix.clone().multiply(
        new THREE.Matrix4().makeTranslation(last.a, 0, 0),
      )
      eePos = new THREE.Vector3().setFromMatrixPosition(eeMatrix)
    }

    return { perJoint: result, eePos, eeMatrix }
  }, [joints, anglesRad, nJoints])

  // Arc radii — scale with shortest link so wedges aren't huge.
  const minA = joints.slice(0, nJoints).reduce(
    (m, j) => Math.min(m, j.a || 1),
    Number.POSITIVE_INFINITY,
  )
  const arcInnerR = radius * 2.5
  const arcOuterR = arcInnerR + (isFinite(minA) ? minA : 0.3) * 0.35

  return (
    <group>
      {/* Joint-limit arc sectors */}
      {frames.perJoint.map((f, i) => {
        const lower = f.thetaOffsetRad + f.limitLowerRad
        const upper = f.thetaOffsetRad + f.limitUpperRad
        const span = upper - lower
        if (span <= 0) return null
        return (
          <group
            key={`arc${i}`}
            matrix={f.preJointMatrix}
            matrixAutoUpdate={false}
          >
            <mesh position={[0, 0, -0.002]}>
              <ringGeometry args={[arcInnerR, arcOuterR, ARC_SEGS, 1, lower, span]} />
              <meshStandardMaterial color="#ffca28" transparent opacity={0.18} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}

      {/* Base disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 2, radius * 2, 0.04, 24]} />
        <meshStandardMaterial color="#546e7a" />
      </mesh>

      {/* Link cylinders — extend along each joint frame's +X by length a */}
      {frames.perJoint.map((f, i) => (
        <group key={`link${i}`} matrix={f.linkFrameMatrix} matrixAutoUpdate={false}>
          {/* cylinderGeometry is along Y; rotate -π/2 about Z so it aligns with +X */}
          {Math.abs(f.a) > 1e-6 && (
            <mesh position={[f.a / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[radius, radius, Math.abs(f.a), 16]} />
              <meshStandardMaterial color={LINK_COLORS[i % LINK_COLORS.length]} />
            </mesh>
          )}
        </group>
      ))}

      {/* d-offset cylinders — extend along the previous frame's +Z by length d
          (after Rz(theta) is applied).  This is what gives 6-DOF / 7-DOF arms
          their visible "forearm" when reach is stored in DH 'd' (not 'a'). */}
      {frames.perJoint.map((f, i) => {
        const d = joints[i].d
        if (Math.abs(d) <= 1e-6) return null
        const theta = f.thetaOffsetRad + (anglesRad[i] ?? 0)
        // After Rz(theta) on the previous frame, the d translation is along +Z.
        // Build a matrix that places a cylinder midway along that segment.
        const Rz = new THREE.Matrix4().makeRotationZ(theta)
        const placement = f.preJointMatrix.clone().multiply(Rz)
        return (
          <group key={`dlink${i}`} matrix={placement} matrixAutoUpdate={false}>
            {/* cylinderGeometry is along Y; rotate π/2 about X so it aligns with +Z */}
            <mesh position={[0, 0, d / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[radius, radius, Math.abs(d), 16]} />
              <meshStandardMaterial color={LINK_COLORS[i % LINK_COLORS.length]} />
            </mesh>
          </group>
        )
      })}

      {/* Joint spheres at each joint origin */}
      {frames.perJoint.map((f, i) => (
        <JointSphere
          key={`j${i}`}
          position={[f.jointOrigin.x, f.jointOrigin.y, f.jointOrigin.z]}
          radius={radius * 1.6}
          baseColor={i === 0 ? '#546e7a' : '#ff8a65'}
          clickable={!!onJointClick}
          onClick={onJointClick ? () => onJointClick(i) : undefined}
        />
      ))}

      {/* End-effector indicator: small sphere at the tool point + RGB triad
          showing the tool frame orientation (X=red, Y=green, Z=blue). */}
      {frames.eeMatrix && frames.eePos && (
        <group matrix={frames.eeMatrix} matrixAutoUpdate={false}>
          {/* Tool point */}
          <mesh>
            <sphereGeometry args={[radius * 0.6, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive="#a5d6a7" emissiveIntensity={0.6} />
          </mesh>
          {/* Axis triad — cylinders extend along their respective axis */}
          <EEAxis axis="x" length={radius * 4} thickness={radius * 0.25} color="#ef5350" />
          <EEAxis axis="y" length={radius * 4} thickness={radius * 0.25} color="#66bb6a" />
          <EEAxis axis="z" length={radius * 4} thickness={radius * 0.25} color="#42a5f5" />
        </group>
      )}

      {/* Workspace hull overlay */}
      {workspace && workspace.hull && (
        <WorkspaceOverlay hull={workspace.hull} />
      )}

      {/* Workspace point cloud (behind sub-toggle) */}
      {workspace && showWorkspacePoints && workspace.points.length > 0 && (
        <WorkspacePoints points={workspace.points} />
      )}
    </group>
  )
}

// ── EEAxis ──────────────────────────────────────────────────────────────────

interface EEAxisProps {
  axis: 'x' | 'y' | 'z'
  length: number
  thickness: number
  color: string
}

function EEAxis({ axis, length, thickness, color }: EEAxisProps) {
  // cylinderGeometry is along local +Y; rotate to point along the requested axis.
  const rotation: [number, number, number] =
    axis === 'x' ? [0, 0, -Math.PI / 2] :
    axis === 'z' ? [Math.PI / 2, 0, 0] :
    [0, 0, 0]
  const position: [number, number, number] =
    axis === 'x' ? [length / 2, 0, 0] :
    axis === 'y' ? [0, length / 2, 0] :
    [0, 0, length / 2]
  const tipPosition: [number, number, number] =
    axis === 'x' ? [length, 0, 0] :
    axis === 'y' ? [0, length, 0] :
    [0, 0, length]
  return (
    <group>
      <mesh position={position} rotation={rotation}>
        <cylinderGeometry args={[thickness, thickness, length, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={tipPosition} rotation={rotation}>
        <coneGeometry args={[thickness * 2.2, thickness * 4, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// ── JointSphere ─────────────────────────────────────────────────────────────

interface JointSphereProps {
  position: [number, number, number]
  radius: number
  baseColor: string
  clickable: boolean
  onClick?: () => void
}

function JointSphere({ position, radius, baseColor, clickable, onClick }: JointSphereProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      position={position}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick?.() } : undefined}
      onPointerOver={clickable ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' } : undefined}
      onPointerOut={clickable ? () => { setHovered(false); document.body.style.cursor = 'auto' } : undefined}
    >
      <sphereGeometry args={[hovered ? radius * 1.18 : radius, 14, 14]} />
      <meshStandardMaterial
        color={hovered ? '#ffffff' : baseColor}
        emissive={hovered ? baseColor : '#000000'}
        emissiveIntensity={hovered ? 0.4 : 0}
      />
    </mesh>
  )
}

// ── WorkspaceOverlay ──────────────────────────────────────────────────────────

interface WorkspaceHullData {
  vertices: [number, number, number][]
  faces: [number, number, number][]
}

function WorkspaceOverlay({ hull }: { hull: WorkspaceHullData }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    // Flat Float32Array of vertex positions [x,y,z, x,y,z, ...]
    const positions = new Float32Array(hull.vertices.flatMap(v => v))
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // Face index buffer
    const indices = new Uint32Array(hull.faces.flatMap(f => f))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))

    geo.computeVertexNormals()
    return geo
  }, [hull])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#4fc3f7"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── WorkspacePoints ───────────────────────────────────────────────────────────

function WorkspacePoints({ points }: { points: [number, number, number][] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(points.flatMap(p => p))
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [points])

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#80cbc4" size={0.01} sizeAttenuation />
    </points>
  )
}
