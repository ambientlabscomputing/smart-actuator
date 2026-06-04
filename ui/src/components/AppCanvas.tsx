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
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import type { ReactNode } from 'react'
import * as THREE from 'three'

// Make every Object3D (cameras, lights, helpers) default to Z-up.
// Set once at module load — affects new instances only, not ones already mounted.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

interface AppCanvasProps {
  children: ReactNode
  /** Initial camera world position (metres). Defaults to [1.5, 1.5, 1.0]. */
  initialCameraPosition?: [number, number, number]
  /** Point the camera looks at / OrbitControls pivot (metres). Defaults to [0, 0, 0]. */
  initialCameraTarget?: [number, number, number]
}

export function AppCanvas({
  children,
  initialCameraPosition = [1.5, 1.5, 1.0],
  initialCameraTarget = [0, 0, 0],
}: AppCanvasProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: initialCameraPosition, fov: 45, near: 0.01, far: 100 }}
      onCreated={({ camera, controls }) => {
        camera.up.set(0, 0, 1)
        camera.lookAt(...initialCameraTarget)
        // OrbitControls (if already attached) needs to re-read camera.up.
        if (controls && 'update' in controls) {
          (controls as { update: () => void }).update()
        }
      }}
    >
      {/* ── Background ─────────────────────────────────────────────── */}
      <color attach="background" args={['#0a0e14']} />

      {/* ── Lighting ───────────────────────────────────────────────── */}
      {/* Fill: uniform low-intensity ambient */}
      <ambientLight intensity={0.4} />
      {/* Sky/ground hemisphere tint for CAD-style shading */}
      <hemisphereLight args={['#3a4a6b', '#1a1a1a', 0.55]} />
      {/* Key light from upper-right-back (above the ground plane in Z-up) */}
      <directionalLight position={[3, 5, 3]} intensity={0.9} />

      {/* ── Ground grid on XY plane (Z-up, arm base at Z=0) ────────── */}
      {/* Grid is authored in three's XZ plane; rotate it +90° about X to
          lay it into world XY, then push slightly below Z=0 to avoid
          z-fighting with anything drawn at the origin. */}
      <Grid
        args={[10, 10]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.001]}
        cellSize={0.05}
        cellThickness={0.5}
        cellColor="#2a3340"
        sectionSize={0.25}
        sectionThickness={1.0}
        sectionColor="#4a6a8a"
        fadeDistance={6}
        fadeStrength={1.2}
        infiniteGrid
      />

      {/* ── World-origin axes: X=red, Y=green, Z=blue ──────────────── */}
      <axesHelper args={[0.2]} />

      {/* ── Orbit controls ─────────────────────────────────────────── */}
      {/* maxPolarAngle clamps "look-under-ground"; with Z-up the polar
          angle is measured from camera.up (+Z), so π/2 == horizon. */}
      <OrbitControls
        makeDefault
        target={initialCameraTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.15}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2 + 0.15}
        zoomSpeed={0.8}
      />

      {/* ── Corner orientation gizmo ───────────────────────────────── */}
      {/* Click a face to snap the camera to Top / Front / Side view  */}
      <GizmoHelper alignment="top-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ff5566', '#88dd55', '#5599ff']} labelColor="white" />
      </GizmoHelper>

      {children}
    </Canvas>
  )
}
