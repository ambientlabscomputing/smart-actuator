/**
 * AppCanvas — the root 3-D scene wrapper.
 *
 * This is the ONLY file in the project that imports @react-three/fiber.
 * All other files that need a 3-D canvas must use this component.
 *
 * Scene conventions:
 *   - Y-up world (three.js default; arm geometry lives in XY plane)
 *   - Ground plane is XZ at Y = 0 (the grid floor)
 *   - Units: metres
 */
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import type { ReactNode } from 'react'

interface AppCanvasProps {
  children: ReactNode
}

export function AppCanvas({ children }: AppCanvasProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: [1.5, 1.0, 1.5], fov: 45, near: 0.01, far: 100 }}
    >
      {/* ── Background ─────────────────────────────────────────────── */}
      <color attach="background" args={['#0a0e14']} />

      {/* ── Lighting ───────────────────────────────────────────────── */}
      {/* Fill: uniform low-intensity ambient */}
      <ambientLight intensity={0.4} />
      {/* Sky/ground hemisphere tint for CAD-style shading */}
      <hemisphereLight args={['#3a4a6b', '#1a1a1a', 0.55]} />
      {/* Key light from upper-right-back */}
      <directionalLight position={[3, 3, 5]} intensity={0.9} />

      {/* ── Ground grid on XZ plane (Y-up, matches arm base at Y=0) ── */}
      <Grid
        args={[10, 10]}
        position={[0, -0.001, 0]}
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
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
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
