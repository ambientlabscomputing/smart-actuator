import { useMemo } from 'react'
import * as THREE from 'three'

export function HorizonBackground() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        topColor: { value: new THREE.Color('#101216') },
        midColor: { value: new THREE.Color('#1c2026') },
        bottomColor: { value: new THREE.Color('#13161b') },
      },
      vertexShader: `
        varying vec3 vWorldPos;

        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;

        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;

        void main() {
          float h = normalize(vWorldPos).z;
          float tTop = smoothstep(0.0, 0.85, h);
          float tBottom = smoothstep(-0.95, -0.1, h);
          vec3 color = mix(midColor, topColor, tTop);
          color = mix(color, bottomColor, tBottom);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
  }, [])

  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[48, 32, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
