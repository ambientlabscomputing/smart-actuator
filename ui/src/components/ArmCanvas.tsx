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
import { useEffect, useMemo, useRef, useState } from 'react'
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
  /**
   * When 'drag', joint spheres and the EE sphere respond to pointer-drag,
   * calling onJointDrag / onEEDrag as the user moves the pointer.
   */
  interactionMode?: 'view' | 'drag'
  /**
   * Called during drag on a revolute joint sphere or prismatic carriage.
   * newValue is in radians (revolute) or metres (prismatic).
   */
  onJointDrag?: (jointIndex: number, jointName: string, newValue: number) => void
  /**
   * Called during drag on the end-effector sphere.
   * delta is the world-space translation to apply (metres).
   */
  onEEDrag?: (delta: [number, number, number]) => void
  /** Called with true when a joint/EE drag begins and false when it ends. */
  onDragStateChange?: (dragging: boolean) => void
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
  interactionMode = 'view',
  onJointDrag,
  onEEDrag,
  onDragStateChange,
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

  // ── Drag state ─────────────────────────────────────────────────────────────
  type DragType = 'revolute' | 'prismatic' | 'ee'
  interface DragState {
    type: DragType
    jointIndex: number  // -1 for EE
    startClientX: number
    startClientY: number
    startValue: number  // radians or metres; 0 for EE
    // EE-only: camera + canvas + drag plane for accurate world-space projection
    camera?: THREE.Camera
    canvas?: HTMLCanvasElement
    plane?: THREE.Plane
    planeOrigin?: THREE.Vector3
  }
  const dragRef = useRef<DragState | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())

  useEffect(() => {
    if (interactionMode !== 'drag') return

    const onMove = (e: PointerEvent) => {
      const ds = dragRef.current
      if (!ds) return
      const dx = e.clientX - ds.startClientX
      const dy = e.clientY - ds.startClientY

      if (ds.type === 'revolute' && onJointDrag) {
        const joint = joints[ds.jointIndex]
        // 200 px = π rad
        const newAngle = ds.startValue - dy * (Math.PI / 200)
        const lo = joint.limit_lower * DEG
        const hi = joint.limit_upper * DEG
        const clamped = Math.max(lo, Math.min(hi, newAngle))
        onJointDrag(ds.jointIndex, joint.name, clamped)
      } else if (ds.type === 'prismatic' && onJointDrag) {
        const joint = joints[ds.jointIndex]
        // Axis determines which screen delta maps most naturally:
        // X-axis joint → horizontal mouse, Y/Z → vertical mouse
        const rawDelta = joint.axis === 'x' ? dx * 0.002 : -dy * 0.002
        const newPos = ds.startValue + rawDelta
        const clamped = Math.max(joint.limit_lower, Math.min(joint.limit_upper, newPos))
        onJointDrag(ds.jointIndex, joint.name, clamped)
      } else if (ds.type === 'ee' && onEEDrag && ds.camera && ds.canvas && ds.plane && ds.planeOrigin) {
        // Ray-cast the current pointer through the camera onto a plane that
        // passes through the EE start point with normal = camera forward.
        // This makes the EE follow the cursor exactly along the screen.
        const rect = ds.canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycasterRef.current.setFromCamera(ndc, ds.camera)
        const hit = new THREE.Vector3()
        if (raycasterRef.current.ray.intersectPlane(ds.plane, hit)) {
          const delta: [number, number, number] = [
            hit.x - ds.planeOrigin.x,
            hit.y - ds.planeOrigin.y,
            hit.z - ds.planeOrigin.z,
          ]
          onEEDrag(delta)
        }
      }
    }

    const onUp = () => {
      if (dragRef.current) onDragStateChange?.(false)
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [interactionMode, joints, onJointDrag, onEEDrag, onDragStateChange])

  // Helper: begin a drag.
  const startDrag = (
    e: { nativeEvent: PointerEvent },
    type: DragType,
    jointIndex: number,
    startValue: number,
    extras?: { camera: THREE.Camera; canvas: HTMLCanvasElement; worldPoint: THREE.Vector3 },
  ) => {
    let plane: THREE.Plane | undefined
    let planeOrigin: THREE.Vector3 | undefined
    if (extras) {
      // Drag plane: passes through the EE start point, normal faces the camera.
      const cameraForward = new THREE.Vector3()
      extras.camera.getWorldDirection(cameraForward)
      // Plane normal must point AT the camera (opposite of forward) for
      // setFromNormalAndCoplanarPoint to give a stable intersection.
      const normal = cameraForward.clone().negate()
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, extras.worldPoint)
      planeOrigin = extras.worldPoint.clone()
    }
    dragRef.current = {
      type,
      jointIndex,
      startClientX: e.nativeEvent.clientX,
      startClientY: e.nativeEvent.clientY,
      startValue,
      camera: extras?.camera,
      canvas: extras?.canvas,
      plane,
      planeOrigin,
    }
    onDragStateChange?.(true)
  }

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
      isPrismatic: boolean
      axis: 'x' | 'y' | 'z'
      travelLowerM: number
      travelUpperM: number
      travelM: number
    }> = []

    let T = new THREE.Matrix4()  // identity = world base frame

    for (let i = 0; i < nJoints; i++) {
      const j = joints[i]
      const preJointMatrix = T.clone()
      const isPrismatic = (j.type ?? 'revolute') === 'prismatic'
      const axis = (j.axis ?? 'z') as 'x' | 'y' | 'z'
      const q = anglesRad[i] ?? 0

      let linkFrameMatrix: THREE.Matrix4
      let travelM = 0
      let travelLowerM = 0
      let travelUpperM = 0

      if (isPrismatic) {
        // Match brain/service/dh_fk.py prismatic dispatch:
        //   Rz(θ_offset) · T_{axis}(d + q on Z, a + q on X, q on Y) · ...
        const Rz = new THREE.Matrix4().makeRotationZ(j.theta_offset * DEG)
        let Taxis: THREE.Matrix4
        if (axis === 'x') {
          Taxis = new THREE.Matrix4().makeTranslation(j.a + q, 0, 0)
        } else if (axis === 'y') {
          Taxis = new THREE.Matrix4().makeTranslation(0, q, 0)
        } else {
          Taxis = new THREE.Matrix4().makeTranslation(0, 0, j.d + q)
        }
        linkFrameMatrix = preJointMatrix.clone().multiply(Rz).multiply(Taxis)
        travelLowerM = j.limit_lower
        travelUpperM = j.limit_upper
        travelM = travelUpperM - travelLowerM
      } else {
        const theta = j.theta_offset * DEG + q
        const Rz = new THREE.Matrix4().makeRotationZ(theta)
        const Tz = new THREE.Matrix4().makeTranslation(0, 0, j.d)
        linkFrameMatrix = preJointMatrix.clone().multiply(Rz).multiply(Tz)
      }

      const jointOrigin = new THREE.Vector3().setFromMatrixPosition(linkFrameMatrix)

      // Next base: link tip · Rx(alpha)
      // For prismatic with axis='x' the joint already translated by (a + q),
      // so skip the extra Tx(a) to avoid double-counting.
      const extraTx = isPrismatic && axis === 'x' ? 0 : j.a
      const Tx = new THREE.Matrix4().makeTranslation(extraTx, 0, 0)
      const Rx = new THREE.Matrix4().makeRotationX(j.alpha * DEG)
      T = linkFrameMatrix.clone().multiply(Tx).multiply(Rx)

      result.push({
        preJointMatrix,
        linkFrameMatrix,
        jointOrigin,
        a: j.a,
        limitLowerRad: isPrismatic ? 0 : j.limit_lower * DEG,
        limitUpperRad: isPrismatic ? 0 : j.limit_upper * DEG,
        thetaOffsetRad: j.theta_offset * DEG,
        isPrismatic,
        axis,
        travelLowerM,
        travelUpperM,
        travelM,
      })
    }

    // End-effector pose (tip of last link) in world frame
    let eePos: THREE.Vector3 | null = null
    let eeMatrix: THREE.Matrix4 | null = null
    if (result.length > 0) {
      const last = result[result.length - 1]
      // For prismatic with axis='x' the joint frame already includes the link;
      // for revolute (and other prismatic axes) the link extends along +X by a.
      const tipExtra = last.isPrismatic && last.axis === 'x' ? 0 : last.a
      eeMatrix = last.linkFrameMatrix.clone().multiply(
        new THREE.Matrix4().makeTranslation(tipExtra, 0, 0),
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
      {/* Joint-limit arc sectors (revolute only) */}
      {frames.perJoint.map((f, i) => {
        if (f.isPrismatic) return null
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

      {/* Prismatic travel rails — thin rod along the joint's axis spanning
          [limit_lower, limit_upper] in the incoming frame, with a sliding
          carriage marker at the current position. */}
      {frames.perJoint.map((f, i) => {
        if (!f.isPrismatic || f.travelM <= 0) return null
        const q = anglesRad[i] ?? 0
        const railThickness = radius * 0.35
        const mid = (f.travelLowerM + f.travelUpperM) / 2
        // cylinderGeometry is along local +Y; rotate to align with declared axis.
        const rotation: [number, number, number] =
          f.axis === 'x' ? [0, 0, -Math.PI / 2] :
          f.axis === 'z' ? [Math.PI / 2, 0, 0] :
          [0, 0, 0]
        const railPos: [number, number, number] =
          f.axis === 'x' ? [mid, 0, 0] :
          f.axis === 'y' ? [0, mid, 0] :
          [0, 0, mid]
        const carriagePos: [number, number, number] =
          f.axis === 'x' ? [q, 0, 0] :
          f.axis === 'y' ? [0, q, 0] :
          [0, 0, q]
        const carriageColor = LINK_COLORS[i % LINK_COLORS.length]
        return (
          <group key={`rail${i}`} matrix={f.preJointMatrix} matrixAutoUpdate={false}>
            {/* Static rail */}
            <mesh position={railPos} rotation={rotation}>
              <cylinderGeometry args={[railThickness, railThickness, f.travelM, 12]} />
              <meshStandardMaterial color="#455a64" />
            </mesh>
            {/* Sliding carriage at current q */}
            <mesh
              position={carriagePos}
              onPointerDown={interactionMode === 'drag'
                ? (e) => { e.stopPropagation(); startDrag(e as unknown as { nativeEvent: PointerEvent }, 'prismatic', i, anglesRad[i] ?? 0) }
                : undefined}
            >
              <boxGeometry args={[radius * 2.4, radius * 2.4, radius * 2.4]} />
              <meshStandardMaterial color={carriageColor} />
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
          draggable={interactionMode === 'drag'}
          onDragStart={interactionMode === 'drag'
            ? (e) => startDrag(e, f.isPrismatic ? 'prismatic' : 'revolute', i, anglesRad[i] ?? 0)
            : undefined}
        />
      ))}

      {/* End-effector indicator: small sphere at the tool point + RGB triad
          showing the tool frame orientation (X=red, Y=green, Z=blue). */}
      {frames.eeMatrix && frames.eePos && (
        <group matrix={frames.eeMatrix} matrixAutoUpdate={false}>
          {/* Tool point. In drag mode it grows to ~2.2x joint-sphere radius and
              renders on top of overlapping joint spheres (renderOrder + depthTest)
              so the user can always grab it. */}
          {(() => {
            const dragMode = interactionMode === 'drag' && !!onEEDrag
            const r = dragMode ? radius * 2.0 : radius * 0.6
            return (
              <mesh
                renderOrder={dragMode ? 999 : 0}
                onPointerDown={dragMode
                  ? (e) => {
                      e.stopPropagation()
                      // R3F's ThreeEvent exposes the camera + the hit point in world space.
                      const re = e as unknown as {
                        nativeEvent: PointerEvent
                        camera: THREE.Camera
                        point: THREE.Vector3
                      }
                      const canvas = re.nativeEvent.target as HTMLCanvasElement
                      startDrag(
                        re,
                        'ee',
                        -1,
                        0,
                        { camera: re.camera, canvas, worldPoint: re.point.clone() },
                      )
                    }
                  : undefined}
                onPointerOver={dragMode ? (e) => { e.stopPropagation(); document.body.style.cursor = 'grab' } : undefined}
                onPointerOut={dragMode ? () => { document.body.style.cursor = 'auto' } : undefined}
              >
                <sphereGeometry args={[r, 20, 20]} />
                <meshStandardMaterial
                  color={dragMode ? '#fbbf24' : '#ffffff'}
                  emissive={dragMode ? '#f59e0b' : '#a5d6a7'}
                  emissiveIntensity={dragMode ? 0.9 : 0.6}
                  transparent={dragMode}
                  opacity={dragMode ? 0.65 : 1}
                  depthTest={!dragMode}
                />
              </mesh>
            )
          })()}
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
  draggable?: boolean
  onDragStart?: (e: { nativeEvent: PointerEvent }) => void
}

function JointSphere({ position, radius, baseColor, clickable, onClick, draggable, onDragStart }: JointSphereProps) {
  const [hovered, setHovered] = useState(false)
  const interactive = clickable || draggable

  return (
    <mesh
      position={position}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick?.() } : undefined}
      onPointerDown={draggable ? (e) => { e.stopPropagation(); onDragStart?.(e as unknown as { nativeEvent: PointerEvent }) } : undefined}
      onPointerOver={interactive ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = draggable ? 'grab' : 'pointer' } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = 'auto' } : undefined}
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
