/**
 * AppCanvas — the root 3-D scene wrapper.
 *
 * This is the ONLY file in the project that imports @react-three/fiber.
 * All other files that need a 3-D canvas must use this component.
 *
 * Scene conventions:
 *   - Z-up world (matches ROS / URDF / DH convention used by the brain)
 *   - Ground plane is XY at Z = 0 (the grid floor)
 *   - Units: metres
 *
 * Z-up is enforced by overriding three.js's default (Y-up) on both
 * Object3D.DEFAULT_UP (so newly created cameras/lights inherit it) and on
 * the existing camera + orbit controls in onCreated.  OrbitControls uses
 * camera.up to compute its azimuth/polar frame, so this single source of
 * truth keeps everything consistent.
 */
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { StageFloor } from './canvas/StageFloor'

// Make every Object3D (cameras, lights, helpers) default to Z-up.
// Set once at module load — affects new instances only, not ones already mounted.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

interface AppCanvasProps {
  children: ReactNode
  /** Initial camera world position (metres). Defaults to [1.5, 1.5, 1.0]. */
  initialCameraPosition?: [number, number, number]
  /** Point the camera looks at / OrbitControls pivot (metres). Defaults to [0, 0, 0]. */
  initialCameraTarget?: [number, number, number]
  /** When false, OrbitControls rotation/pan is disabled (e.g. during joint drag). */
  orbitEnabled?: boolean
  /** When true, the camera slowly orbits the target (used by template thumbnails). */
  autoRotate?: boolean
  /** Auto-rotate speed (drei units). Defaults to a slow ~10°/s feel. */
  autoRotateSpeed?: number
  /** When false, hide the corner orientation gizmo (e.g. thumbnails). */
  showGizmo?: boolean
  /** When false, hide the stage floor (e.g. thumbnails). */
  showFloor?: boolean
  /** When false, disable zoom + pan user interaction (e.g. thumbnails). */
  interactive?: boolean
}

export function AppCanvas({
  children,
  initialCameraPosition = [1.5, 1.5, 1.0],
  initialCameraTarget = [0, 0, 0],
  orbitEnabled = true,
  autoRotate = false,
  autoRotateSpeed = 0.6,
  showGizmo = true,
  showFloor = true,
  interactive = true,
}: AppCanvasProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: initialCameraPosition, fov: 45, near: 0.01, far: 100 }}
      shadows
      onCreated={({ camera, controls, gl }) => {
        camera.up.set(0, 0, 1)
        camera.lookAt(...initialCameraTarget)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.02
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.shadowMap.enabled = true
        gl.shadowMap.type = THREE.PCFSoftShadowMap
        // OrbitControls (if already attached) needs to re-read camera.up.
        if (controls && 'update' in controls) {
          (controls as { update: () => void }).update()
        }
      }}
    >
      {/* ── Background ─────────────────────────────────────────────── */}
      <color attach="background" args={['#1e2630']} />

      {/* ── Lighting ───────────────────────────────────────────────── */}
      <ambientLight intensity={0.08} />
      <directionalLight
        color="#fff1e0"
        position={[3, -2, 4]}
        intensity={1.12}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.2}
        shadow-camera-far={12}
        shadow-camera-left={-2.8}
        shadow-camera-right={2.8}
        shadow-camera-top={2.8}
        shadow-camera-bottom={-2.8}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight color="#b8c7d6" position={[-2, -2, 1.5]} intensity={0.35} />
      <directionalLight color="#fff1e0" position={[-1, 3, 3]} intensity={0.5} />

      {/* ── Stage floor on XY plane (Z-up, arm base at Z=0) ─────────── */}
      {showFloor && <StageFloor />}

      {/* ── Orbit controls ─────────────────────────────────────────── */}
      {/* maxPolarAngle clamps "look-under-ground"; with Z-up the polar
          angle is measured from camera.up (+Z), so π/2 == horizon. */}
      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        target={initialCameraTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.15}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2 + 0.15}
        zoomSpeed={0.8}
        autoRotate={autoRotate}
        autoRotateSpeed={autoRotateSpeed}
        enableZoom={interactive}
        enablePan={interactive}
      />

      {/* ── Corner orientation gizmo ───────────────────────────────── */}
      {/* Click a face to snap the camera to Top / Front / Side view  */}
      {showGizmo && (
        <GizmoHelper alignment="top-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ff5566', '#88dd55', '#5599ff']} labelColor="white" />
        </GizmoHelper>
      )}

      {children}
    </Canvas>
  )
}
