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
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { DHJointValues, WorkspaceResult } from '../lib/types'
import { MeshQualityContext, useMeshQuality } from './mesh/MeshQualityContext'
import { LinkMesh } from './mesh/LinkMesh'
import { RevoluteJoint } from './mesh/RevoluteJoint'
import { EndEffectorMesh } from './mesh/EndEffectorMesh'
import { useMaterials } from './mesh/MaterialRegistry'
import { RecipeNodes } from './mesh/recipeToThree'
import { MotionEnvelope } from './mesh/MotionEnvelope'
import { buildBaseAssembly } from './mesh/assemblies'
import { getMachineStyle, defaultMachineStyle } from '../design/machineStyles'
import { machineColors } from '../design/tokens'

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
  /** When true, render the reachability hull (default false). */
  showWorkspaceHull?: boolean
  /** When true, also render the raw sampled point cloud (default false). */
  showWorkspaceSamples?: boolean
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
  /**
   * When true, draw joint-limit arcs (smoked-glass motion envelopes) in the
   * workspace. Off by default — they're a diagnostic overlay, not part of
   * the hero-shot aesthetic.
   */
  showLimits?: boolean
}

const DEG = Math.PI / 180

export function ArmCanvas({
  anglesRad,
  linkLengths,
  radius = 0.05,
  dhJoints,
  jointLimitsDeg,
  onJointClick,
  workspace,
  showWorkspaceHull = false,
  showWorkspaceSamples = false,
  interactionMode = 'view',
  onJointDrag,
  onEEDrag,
  onDragStateChange,
  showLimits = false,
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

  // Arc band — keep the ring thin and linked to joint radius, not link length,
  // so it reads as a UI annotation rather than a physical dimension.
  const arcInnerR = radius * 2.2
  const arcOuterR = arcInnerR + radius * 1.4

  return (
    <MeshQualityContext.Provider value="medium">
    <group>
      {/* Joint-limit motion envelope — off by default, toggled via showLimits.
          Only renders for joints with a meaningful limit span (< 340°). */}
      {showLimits && frames.perJoint.map((f, i) => {
        if (f.isPrismatic) return null
        const lower = f.thetaOffsetRad + f.limitLowerRad
        const upper = f.thetaOffsetRad + f.limitUpperRad
        const span = upper - lower
        if (span <= 0) return null
        const current = f.thetaOffsetRad + (anglesRad[i] ?? 0)
        return (
          <group
            key={`arc${i}`}
            matrix={f.preJointMatrix}
            matrixAutoUpdate={false}
          >
            <MotionEnvelope
              innerRadius={arcInnerR}
              outerRadius={arcOuterR}
              lowerRad={lower}
              upperRad={upper}
              currentRad={current}
            />
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
        const carriageColor = machineColors.prismaticCarriage[i % machineColors.prismaticCarriage.length]
        return (
          <group key={`rail${i}`} matrix={f.preJointMatrix} matrixAutoUpdate={false}>
            {/* Static rail */}
            <mesh position={railPos} rotation={rotation} castShadow receiveShadow>
              <cylinderGeometry args={[railThickness, railThickness, f.travelM, 12]} />
              <meshStandardMaterial color="#455a64" />
            </mesh>
            {/* Sliding carriage at current q */}
            <mesh
              position={carriagePos}
              castShadow
              receiveShadow
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
      <BasDisc radius={radius} />

      {/* Link cylinders — procedural token-driven barrels along each +X */}
      {frames.perJoint.map((f, i) => (
        Math.abs(f.a) > 1e-6 ? (
          <LinkMesh
            key={`link${i}`}
            length={Math.abs(f.a)}
            radius={radius}
            frameMatrix={f.linkFrameMatrix}
            slotIndex={i}
          />
        ) : null
      ))}

      {/* d-offset links — DH 'd' segments along +Z (6-DOF/7-DOF forearm).  */}
      {frames.perJoint.map((f, i) => {
        const d = joints[i].d
        if (Math.abs(d) <= 1e-6) return null
        const theta = f.thetaOffsetRad + (anglesRad[i] ?? 0)
        const Rz = new THREE.Matrix4().makeRotationZ(theta)
        // Rotate the link frame so the barrel's +X aligns with DH +Z.
        // Net rotation: Rz already in place; add Ry(+π/2) so +X maps to +Z.
        const rotateToZ = new THREE.Matrix4().makeRotationY(-Math.PI / 2)
        const dLinkFrame = f.preJointMatrix.clone().multiply(Rz).multiply(rotateToZ)
        return (
          <LinkMesh
            key={`dlink${i}`}
            length={Math.abs(d)}
            radius={radius}
            frameMatrix={dLinkFrame}
            slotIndex={i}
          />
        )
      })}

      {/* Joint hubs — procedural revolute collars, coaxial with link +X */}
      {frames.perJoint.map((f, i) => (
        f.isPrismatic ? null : (
          <RevoluteJoint
            key={`j${i}`}
            frameMatrix={f.linkFrameMatrix}
            linkRadius={radius}
            slotIndex={i}
            clickable={!!onJointClick}
            onClick={onJointClick ? () => onJointClick(i) : undefined}
            draggable={interactionMode === 'drag'}
            onDragStart={interactionMode === 'drag'
              ? (e) => startDrag(e, 'revolute', i, anglesRad[i] ?? 0)
              : undefined}
          />
        )
      ))}

      {/* End-effector — procedural machined cap + RGB axis triad.
          EEHitZone renders first (before joints) so in drag mode it can
          claim pointer events via its priority sphere raycast. */}
      {frames.eeMatrix && frames.eePos && (() => {
        const dragMode = interactionMode === 'drag' && !!onEEDrag
        const startEEDrag = dragMode
          ? (e: React.PointerEvent) => {
              e.stopPropagation()
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
          : undefined
        return (
          <group>
            {/* Priority hit zone — must appear before RevoluteJoint nodes in
                the JSX but wins via custom raycast distance bias. */}
            {dragMode && (
              <EEHitZone
                eePos={frames.eePos}
                hitRadius={radius * 2.8}
                onPointerDown={startEEDrag!}
                onPointerOver={() => { document.body.style.cursor = 'grab' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
              />
            )}
            <EndEffectorMesh
              eeMatrix={frames.eeMatrix}
              linkRadius={radius}
              active={dragMode}
              renderOrder={dragMode ? 999 : 0}
              onPointerDown={dragMode ? startEEDrag : undefined}
              onPointerOver={dragMode ? (e) => { e.stopPropagation(); document.body.style.cursor = 'grab' } : undefined}
              onPointerOut={dragMode ? () => { document.body.style.cursor = 'auto' } : undefined}
            />
            <group matrix={frames.eeMatrix} matrixAutoUpdate={false}>
              <EEAxis axis="x" length={radius * 4} thickness={radius * 0.25} color="#ef5350" />
              <EEAxis axis="y" length={radius * 4} thickness={radius * 0.25} color="#66bb6a" />
              <EEAxis axis="z" length={radius * 4} thickness={radius * 0.25} color="#42a5f5" />
            </group>
          </group>
        )
      })()}

      {/* Workspace hull overlay */}
      {workspace && showWorkspaceHull && workspace.hull && (
        <WorkspaceOverlay hull={workspace.hull} />
      )}

      {/* Workspace point cloud (behind sub-toggle) */}
      {workspace && showWorkspaceSamples && workspace.points.length > 0 && (
        <WorkspacePoints points={workspace.points} />
      )}
    </group>
    </MeshQualityContext.Provider>
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

// ── EEHitZone ───────────────────────────────────────────────────────────────
// Invisible priority drag-handle placed at the EE world position.
//
// Problem: RevoluteJoint calls stopPropagation on pointerDown, and R3F fires
// events sorted closest-to-camera first. The last joint housing (large hex
// geometry) is often physically adjacent to the EE and wins the raycast.
//
// Solution: this component overrides its mesh's raycast with a mathematical
// sphere test and reports a hit 0.25 m closer to the camera than reality.
// That tiny bias guarantees the EE sphere sorts before any joint geometry
// that overlaps it, without affecting any other click in the scene.

interface EEHitZoneProps {
  eePos: THREE.Vector3
  hitRadius: number
  onPointerDown: (e: React.PointerEvent) => void
  onPointerOver?: (e: React.PointerEvent) => void
  onPointerOut?: () => void
}

function EEHitZone({ eePos, hitRadius, onPointerDown, onPointerOver, onPointerOut }: EEHitZoneProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Install the custom sphere raycast once the mesh is mounted.
  // We update it whenever eePos or hitRadius changes so it stays accurate.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const center = eePos.clone()
    const r = hitRadius
    mesh.raycast = (raycaster, intersects) => {
      const sphere = new THREE.Sphere(center, r)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectSphere(sphere, hit)) return
      // Report slightly closer than reality so we sort before adjacent joints.
      const realDist = raycaster.ray.origin.distanceTo(hit)
      intersects.push({
        distance: Math.max(0, realDist - 0.25),
        point: hit.clone(),
        object: mesh,
        face: null,
        faceIndex: 0,
      } as THREE.Intersection)
    }
  }, [eePos, hitRadius])

  return (
    <mesh
      ref={meshRef}
      position={eePos}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Geometry is needed for the default raycast to be replaced; tiny icosahedron
          is cheap. The actual hit-testing is done by the custom raycast above. */}
      <sphereGeometry args={[hitRadius, 4, 4]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ── BasDisc ──────────────────────────────────────────────────────────────────
// World-origin base assembly — bolt-circle disc with bearing turret (lab_instrument).

function BasDisc({ radius }: { radius: number }) {
  const materials = useMaterials(0)
  const quality = useMeshQuality()
  const tokens = getMachineStyle(defaultMachineStyle)
  const recipe = useMemo(
    () => buildBaseAssembly({ radius: radius * 2, thickness: 0.04, tokens }),
    [radius, tokens],
  )
  // Recipe emits primitives in a "+X = up" frame; rotate so +X → world +Z.
  return (
    <group rotation={[0, -Math.PI / 2, 0]}>
      <RecipeNodes recipe={recipe} materials={materials} quality={quality} castShadow receiveShadow />
    </group>
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
      <meshBasicMaterial
        color="#4fc3f7"
        transparent
        opacity={0.07}
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
