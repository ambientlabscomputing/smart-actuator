/**
 * EndEffectorMesh — renders the procedural end-effector cap.
 *
 * Replaces the plain white sphere with a flat machined disc in the tool frame's
 * YZ plane (cap normal = +X = tool approach direction). Preserves all
 * pointer-event behaviour from the old EE sphere.
 */
import { useMemo } from 'react'
import type * as THREE from 'three'
import { useMeshQuality } from './MeshQualityContext'
import { useMaterials } from './MaterialRegistry'
import { RecipeNodes } from './recipeToThree'
import { buildEndEffectorRecipe } from './endEffector'
import { buildEndEffectorAssembly } from './assemblies'
import { getMachineStyle, defaultMachineStyle } from '../../design/machineStyles'
import { type MeshFamily, defaultMeshFamily } from './family'

interface EndEffectorMeshProps {
  /** EE world transform matrix (tool frame). Cap is placed in its YZ plane. */
  eeMatrix: THREE.Matrix4
  /** Visual radius of the last link (metres). Cap radius derived from token. */
  linkRadius: number
  /** When true the cap uses the eeActive role (drag mode). */
  active?: boolean
  renderOrder?: number
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerOver?: (e: React.PointerEvent) => void
  onPointerOut?: (e: React.PointerEvent) => void
  /** Which assembly family to render. Default = lab_instrument. */
  family?: MeshFamily
}

export function EndEffectorMesh({
  eeMatrix,
  linkRadius,
  active = false,
  renderOrder = 0,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  family = defaultMeshFamily,
}: EndEffectorMeshProps) {
  const quality = useMeshQuality()
  // EE uses slotIndex 0 but role is 'ee' / 'eeActive', so colour index doesn't matter.
  const materials = useMaterials(0)
  const tokens = getMachineStyle(defaultMachineStyle)

  const recipe = useMemo(
    () =>
      family === 'lab_instrument'
        ? buildEndEffectorAssembly({ linkRadius, active, tokens })
        : buildEndEffectorRecipe({ linkRadius, active, tokens }),
    [family, linkRadius, active, tokens],
  )

  return (
    <group
      matrix={eeMatrix}
      matrixAutoUpdate={false}
      renderOrder={renderOrder}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <RecipeNodes
        recipe={recipe}
        materials={materials}
        quality={quality}
        castShadow={!active}
        receiveShadow={!active}
      />
    </group>
  )
}
