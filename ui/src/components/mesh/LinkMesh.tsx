/**
 * LinkMesh — renders a procedural link barrel at a given DH frame.
 *
 * The barrel extends along +X from the frame origin by `length` metres.
 * Positions itself at the midpoint so the geometry is centred on the link axis.
 */
import { useMemo } from 'react'
import type * as THREE from 'three'
import { useMeshQuality } from './MeshQualityContext'
import { useMaterials } from './MaterialRegistry'
import { RecipeNodes } from './recipeToThree'
import { buildLinkRecipe, type JointKind } from './link'
import { buildLinkAssembly } from './assemblies'
import { getMachineStyle, defaultMachineStyle } from '../../design/machineStyles'
import { type MeshFamily, defaultMeshFamily } from './family'

interface LinkMeshProps {
  /** DH link length `a` in metres. */
  length: number
  /** Visual radius (metres). */
  radius: number
  /** Frame matrix (world transform); applied via group. */
  frameMatrix: THREE.Matrix4
  /** Joint slot index — drives colour rotation. */
  slotIndex: number
  startJoint?: JointKind
  endJoint?: JointKind
  /** Which assembly family to render. Default = lab_instrument. */
  family?: MeshFamily
}

export function LinkMesh({
  length,
  radius,
  frameMatrix,
  slotIndex,
  startJoint = 'revolute',
  endJoint = 'revolute',
  family = defaultMeshFamily,
}: LinkMeshProps) {
  const quality = useMeshQuality()
  const materials = useMaterials(slotIndex)
  const tokens = getMachineStyle(defaultMachineStyle)

  const recipe = useMemo(
    () =>
      family === 'lab_instrument'
        ? buildLinkAssembly({ length, radius, startJoint, endJoint, tokens })
        : buildLinkRecipe({ length, radius, startJoint, endJoint, tokens }),
    [family, length, radius, startJoint, endJoint, tokens],
  )

  return (
    <group matrix={frameMatrix} matrixAutoUpdate={false}>
      {/* Centre the barrel: geometry origin is at link-frame origin; shift +X by a/2 */}
      <group position={[length / 2, 0, 0]}>
        <RecipeNodes
          recipe={recipe}
          materials={materials}
          quality={quality}
          castShadow
          receiveShadow
        />
      </group>
    </group>
  )
}
