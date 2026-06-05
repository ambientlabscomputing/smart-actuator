import { useMemo } from 'react'
import * as THREE from 'three'

interface StageFloorProps {
  stageRadius?: number
}

export function StageFloor({ stageRadius = 4 }: StageFloorProps) {
  // The grid/vignette overlay is transparent so arm shadows from the base
  // plane are visible through it.
  const gridMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        stageRadius: { value: stageRadius },
        // Edge darkening: blend toward transparent at distance so the
        // floor colour below seamlessly matches the background colour.
        gridMinor: { value: new THREE.Color('#4a5568') },
        gridMajor: { value: new THREE.Color('#5a6a80') },
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
        uniform float stageRadius;
        uniform vec3 gridMinor;
        uniform vec3 gridMajor;

        float gridLine(float coord, float spacing) {
          float p = coord / spacing;
          float w = fwidth(p);
          float d = abs(fract(p - 0.5) - 0.5);
          return 1.0 - smoothstep(0.0, w * 1.5, d);
        }

        void main() {
          float dist = length(vWorldPos.xy);
          // Grid fades out with distance so it only appears near the machine.
          float gridFade = 1.0 - smoothstep(stageRadius * 0.15, stageRadius * 0.75, dist);

          float minor = max(gridLine(vWorldPos.x, 0.05), gridLine(vWorldPos.y, 0.05));
          float major = max(gridLine(vWorldPos.x, 0.25), gridLine(vWorldPos.y, 0.25));

          // Grid lines rendered with alpha; base is fully transparent.
          float alpha = max(minor * 0.45, major * 0.70) * gridFade;
          vec3 color = mix(gridMinor, gridMajor, major);

          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  }, [stageRadius])

  gridMaterial.uniforms.stageRadius.value = stageRadius

  return (
    // planeGeometry is authored in XY (normal = +Z) — in Z-up world that IS the
    // horizontal floor. No rotation needed.
    <group position={[0, 0, -0.001]}>
      {/*
        Base floor — the only opaque layer. Uses meshStandardMaterial so it:
          • receives shadows from the arm (creates the fake-AO pad)
          • is lit by the three-point rig (key light from upper-right warms it)
          • extends far enough to meet the camera horizon at any angle
        Colour: #2e3a48 is ~30% luminance — clearly distinguishable from the
        canvas background (#15181c, ~8% luminance) without blowing out.
      */}
      <mesh receiveShadow>
        <planeGeometry args={[200, 200, 1, 1]} />
        <meshStandardMaterial color="#2e3a48" roughness={0.92} metalness={0.04} />
      </mesh>
      {/*
        Grid overlay — transparent ShaderMaterial, grid lines only.
        Sits 0.5 mm above so z-fighting is not a concern.
        Does NOT use depthWrite so shadow visibility on the base is preserved.
      */}
      <mesh position={[0, 0, 0.0005]}>
        <planeGeometry args={[40, 40, 1, 1]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
    </group>
  )
}
