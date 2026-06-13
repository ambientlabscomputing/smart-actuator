/**
 * Joint — backward-compatibility wrapper for legacy callers.
 *
 * New code should use RevoluteJoint / LinkMesh from components/mesh/ directly.
 * This thin wrapper delegates to RevoluteJoint so the visual language is
 * consistent even for old call sites.
 */
import { RevoluteJoint } from './mesh/RevoluteJoint'
import { MeshQualityContext } from './mesh/MeshQualityContext'
import * as THREE from 'three'

interface JointProps {
  /** Current joint angle in radians — unused visually (hub is static). */
  angleRad: number
  /** Visual length of the cylinder (metres) — used as linkRadius reference. */
  length?: number
  /** Visual radius of the cylinder (metres). */
  radius?: number
}

export function Joint({ radius = 0.15 }: JointProps) {
  const identityMatrix = new THREE.Matrix4()
  return (
    <MeshQualityContext.Provider value="medium">
      <RevoluteJoint
        frameMatrix={identityMatrix}
        linkRadius={radius}
        slotIndex={1}
      />
    </MeshQualityContext.Provider>
  )
}
