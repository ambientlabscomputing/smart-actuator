/**
 * AppCanvas — the root 3-D scene wrapper.
 *
 * This is the ONLY file in the project that imports @react-three/fiber.
 * All other files that need a 3-D canvas must use this component.
 */
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ReactNode } from 'react'

interface AppCanvasProps {
  children: ReactNode
}

export function AppCanvas({ children }: AppCanvasProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: [0.4, 0.2, 2.5], fov: 50 }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <OrbitControls makeDefault />
      {children}
    </Canvas>
  )
}
