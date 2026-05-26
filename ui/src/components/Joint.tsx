/**
 * Joint — renders a single rotary joint as a cylinder.
 *
 * This is the ONLY file in the project that imports @react-three/drei or three.
 * All other files that need to render a joint must use this component.
 */
import { Cylinder } from '@react-three/drei'

interface JointProps {
  /** Current joint angle in radians — drives rotation around the Z axis. */
  angleRad: number
  /** Visual length of the cylinder (metres). */
  length?: number
  /** Visual radius of the cylinder (metres). */
  radius?: number
}

export function Joint({ angleRad, length = 1.5, radius = 0.15 }: JointProps) {
  return (
    <mesh rotation={[0, 0, angleRad]}>
      <Cylinder args={[radius, radius, length, 16]}>
        <meshStandardMaterial color="#4fc3f7" />
      </Cylinder>
    </mesh>
  )
}
