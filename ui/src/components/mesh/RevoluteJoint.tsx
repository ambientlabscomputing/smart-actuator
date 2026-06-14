/**
 * RevoluteJoint — renders a procedural revolute hub at a given link frame.
 *
 * The hub barrel is coaxial with the link (+X of the frame) so it visually
 * connects to the adjacent links from any camera angle. It is wider and
 * shorter than the link barrel, reading as a collar/adapter at the joint.
 *
 * The rotation axis direction (DH +Z) is indicated by the seam detail once
 * bands are properly implemented (Box 2 polish / TODO).
 */
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMeshQuality } from './MeshQualityContext'
import { useMaterials } from './MaterialRegistry'
import { RecipeNodes } from './recipeToThree'
import { buildRevoluteRecipe } from './revolute'
import { buildActuatorAssembly } from './assemblies'
import { getMachineStyle, defaultMachineStyle } from '../../design/machineStyles'
import { type MeshFamily, defaultMeshFamily } from './family'
import { accent } from '../../design/theme'

const ACCENT_COLOR = new THREE.Color(accent.default)

interface RevoluteJointProps {
  /** Link frame matrix — hub is centred here, coaxial with link +X. */
  frameMatrix: THREE.Matrix4
  /** Visual radius of the adjacent link (metres). Hub derived from token. */
  linkRadius: number
  /** Slot index — drives colour identity. */
  slotIndex: number
  /** When true the joint shows its active-state accent band. */
  active?: boolean
  clickable?: boolean
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: { nativeEvent: PointerEvent }) => void
  /** Which assembly family to render. Default = lab_instrument. */
  family?: MeshFamily
}

export function RevoluteJoint({
  frameMatrix,
  linkRadius,
  slotIndex,
  active = false,
  clickable = false,
  onClick,
  draggable = false,
  onDragStart,
  family = defaultMeshFamily,
}: RevoluteJointProps) {
  const [hovered, setHovered] = useState(false)
  const quality = useMeshQuality()
  const materials = useMaterials(slotIndex)
  const tokens = getMachineStyle(defaultMachineStyle)

  // Point-light ref — intensity driven by useFrame so no hook-return mutation.
  const lightRef = useRef<THREE.PointLight>(null)
  const phaseRef = useRef(0)

  useFrame((_, delta) => {
    const light = lightRef.current
    if (!light) return
    if (active) {
      phaseRef.current = (phaseRef.current + delta * Math.PI * 2) % (Math.PI * 2)
      // Oscillates between 1.2 and 3.0 at 1 Hz
      light.intensity = 2.1 + 0.9 * Math.sin(phaseRef.current)
    } else {
      phaseRef.current = 0
      // Fade out in 150 ms
      light.intensity = Math.max(0, light.intensity - delta * 8)
    }
  })

  const recipe = useMemo(
    () =>
      family === 'lab_instrument'
        ? buildActuatorAssembly({ linkRadius, active: active || hovered, tokens })
        : buildRevoluteRecipe({ linkRadius, active: active || hovered, tokens }),
    [family, linkRadius, active, hovered, tokens],
  )

  const interactive = clickable || draggable

  // Hub barrel is coaxial with the link (+X). No extra group rotation needed —
  // the frame matrix already carries the correct link-axis orientation.
  return (
    <group
      matrix={frameMatrix}
      matrixAutoUpdate={false}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick?.() } : undefined}
      onPointerDown={draggable ? (e) => { e.stopPropagation(); onDragStart?.(e as unknown as { nativeEvent: PointerEvent }) } : undefined}
      onPointerOver={interactive ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = draggable ? 'grab' : 'pointer' } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = 'auto' } : undefined}
    >
      <RecipeNodes
        recipe={recipe}
        materials={materials}
        quality={quality}
        castShadow
        receiveShadow
      />
      {/* Point light at joint origin — ref-mutated intensity, no lint issue.
          Illuminates the surrounding links and housing in accent yellow. */}
      <pointLight
        ref={lightRef}
        color={ACCENT_COLOR}
        intensity={0}
        distance={linkRadius * 14}
        decay={2}
      />
    </group>
  )
}
