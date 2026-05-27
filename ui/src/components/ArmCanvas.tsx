/**
 * ArmCanvas — renders a 2-DOF planar arm as rods connecting joint spheres.
 *
 * Each link is a cylinder anchored at the midpoint between joints,
 * aligned along its link direction via FK in the XY plane.
 * Link lengths come from the machine's parameters.
 *
 * If jointLimitsDeg is provided, a translucent arc sector is drawn at each
 * joint showing the symmetric travel envelope (±limit) centred on the
 * incoming parent-link direction.
 */
import { useState } from 'react'

interface ArmCanvasProps {
  /** Current joint angles in radians, one per joint in slot order. */
  anglesRad: number[]
  /** Visual length for each link in metres. */
  linkLengths: number[]
  /** Visual cylinder radius for all links. */
  radius?: number
  /** Symmetric travel limits in degrees per joint (e.g. [180, 150]). */
  jointLimitsDeg?: number[]
  /**
   * Called when a joint sphere (actuator) is clicked.
   * index = actuator slot index (0 = shoulder, 1 = elbow, …)
   */
  onJointClick?: (index: number) => void
}

const LINK_COLORS = ['#4fc3f7', '#81d4fa', '#b3e5fc']
// Number of theta segments for ring arc smoothness
const ARC_SEGS = 48

export function ArmCanvas({ anglesRad, linkLengths, radius = 0.05, jointLimitsDeg, onJointClick }: ArmCanvasProps) {
  const nJoints = Math.min(anglesRad.length, linkLengths.length)

  // Forward-kinematics: accumulate angle + tip position
  // Also track parentCumAngle (cumAngle BEFORE applying joint i) for arc orientation.
  const segments: { pos: [number, number, number]; rotZ: number; len: number; color: string }[] = []
  const joints: [number, number][] = [[0, 0]]  // all joint positions (including base)
  const jointBaseAngles: number[] = []          // parentCumAngle at each joint hinge
  let cumAngle = 0
  let tipX = 0
  let tipY = 0

  for (let i = 0; i < nJoints; i++) {
    jointBaseAngles.push(cumAngle)  // angle before this joint contributes
    cumAngle += anglesRad[i] ?? 0
    const len = linkLengths[i] ?? 1.0
    const midX = tipX + Math.cos(cumAngle) * (len / 2)
    const midY = tipY + Math.sin(cumAngle) * (len / 2)
    segments.push({ pos: [midX, midY, 0], rotZ: cumAngle, len, color: LINK_COLORS[i % LINK_COLORS.length] })
    tipX += Math.cos(cumAngle) * len
    tipY += Math.sin(cumAngle) * len
    joints.push([tipX, tipY])
  }

  const arcInnerR = radius * 2.5
  const arcOuterR = radius * 2.5 + Math.min(...(linkLengths.length ? linkLengths : [0.3])) * 0.35

  return (
    <group>
      {/* Joint-limit arc sectors — drawn behind everything at z=-0.002 */}
      {jointLimitsDeg && joints.slice(0, nJoints).map(([jx, jy], i) => {
        const limitDeg = jointLimitsDeg[i]
        if (!limitDeg) return null
        const limitRad = (limitDeg * Math.PI) / 180
        const parentAngle = jointBaseAngles[i] ?? 0
        return (
          <mesh key={`arc${i}`} position={[jx, jy, -0.002]}>
            {/* ringGeometry lies in XY; thetaStart at positive-X, counterclockwise */}
            <ringGeometry args={[arcInnerR, arcOuterR, ARC_SEGS, 1, parentAngle - limitRad, limitRad * 2]} />
            <meshStandardMaterial color="#ffca28" transparent opacity={0.18} side={2} />
          </mesh>
        )
      })}

      {/* Base disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 2, radius * 2, 0.04, 24]} />
        <meshStandardMaterial color="#546e7a" />
      </mesh>

      {/* Link rods — cylinders align along Y; rotate +π/2 around Z to lie along X-axis direction */}
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.pos} rotation={[0, 0, seg.rotZ + Math.PI / 2]}>
          <cylinderGeometry args={[radius, radius, seg.len, 16]} />
          <meshStandardMaterial color={seg.color} />
        </mesh>
      ))}

      {/* Joint spheres — indices 0..nJoints-1 are actuator hinges, nJoints is the EE */}
      {joints.map(([jx, jy], i) => {
        const isActuator = i < nJoints
        return (
          <JointSphere
            key={`j${i}`}
            position={[jx, jy, 0]}
            radius={radius * 1.6}
            baseColor={i === 0 ? '#546e7a' : '#ff8a65'}
            clickable={isActuator && !!onJointClick}
            onClick={isActuator && onJointClick ? () => onJointClick(i) : undefined}
          />
        )
      })}

      {/* End-effector sphere (distinct colour) */}
      {joints.length > 0 && (
        <mesh position={[joints[joints.length - 1][0], joints[joints.length - 1][1], 0]}>
          <sphereGeometry args={[radius * 1.3, 14, 14]} />
          <meshStandardMaterial color="#a5d6a7" />
        </mesh>
      )}
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
