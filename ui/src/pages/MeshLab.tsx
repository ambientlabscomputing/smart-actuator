/**
 * MeshLab — dev-only visual preview for Box 2 / Box 2b mesh components.
 *
 * Shows one of each mesh type under Box 1 lighting with controls for
 * `quality`, `style`, and `family` (legacy procedural vs lab_instrument
 * shape grammar). When 'both' is selected, the two families render as
 * stacked rows for direct A/B comparison. Gated on `import.meta.env.DEV`.
 *
 * Visit /mesh-lab in the dev server.
 */
/* eslint-disable no-restricted-imports -- dev-only preview page; needs direct R3F/three access */
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { MeshQualityContext } from '../components/mesh/MeshQualityContext'
import { LinkMesh } from '../components/mesh/LinkMesh'
import { RevoluteJoint } from '../components/mesh/RevoluteJoint'
import { EndEffectorMesh } from '../components/mesh/EndEffectorMesh'
import type { MeshQuality } from '../design/machineTokens'
import type { MachineStyleName } from '../design/machineStyles'
import { getMachineStyle } from '../design/machineStyles'
import { text, borderColor, accent, semantic, chart } from '@/design'
import { buildPrismaticRecipe } from '../components/mesh/prismatic'
import { buildBaseAssembly } from '../components/mesh/assemblies'
import { MotionEnvelope } from '../components/mesh/MotionEnvelope'
import { useMaterials } from '../components/mesh/MaterialRegistry'
import { useMeshQuality } from '../components/mesh/MeshQualityContext'
import { RecipeNodes } from '../components/mesh/recipeToThree'
import type { MeshFamily } from '../components/mesh/family'

type FamilyChoice = 'legacy' | 'lab_instrument' | 'both'

// ── Prismatic stub preview ────────────────────────────────────────────────────

function PrismaticPreview({
  radius, style, position,
}: { radius: number; style: MachineStyleName; position: [number, number, number] }) {
  const tokens = getMachineStyle(style)
  const quality = useMeshQuality()
  const materials = useMaterials(2)
  const recipe = buildPrismaticRecipe({ travelM: 0.4, linkRadius: radius, tokens })
  return (
    <group position={position}>
      <RecipeNodes recipe={recipe} materials={materials} quality={quality} castShadow receiveShadow />
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.35, radius * 0.35, 0.4, 12]} />
        <meshStandardMaterial color={machineColors.prismaticRail} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[radius * 2.4, radius * 2.4, radius * 2.4]} />
        <meshStandardMaterial color={chart.position} />
      </mesh>
    </group>
  )
}

// ── Base assembly preview ────────────────────────────────────────────────────

function BasePreview({
  radius, style, position,
}: { radius: number; style: MachineStyleName; position: [number, number, number] }) {
  const tokens = getMachineStyle(style)
  const quality = useMeshQuality()
  const materials = useMaterials(0)
  const recipe = buildBaseAssembly({ radius: radius * 2, thickness: 0.04, tokens })
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <RecipeNodes recipe={recipe} materials={materials} quality={quality} castShadow receiveShadow />
    </group>
  )
}

// ── Motion envelope preview ──────────────────────────────────────────────────

function MotionEnvelopePreview({
  radius, position, current,
}: { radius: number; position: [number, number, number]; current: number }) {
  return (
    <group position={position}>
      <MotionEnvelope
        innerRadius={radius * 2.5}
        outerRadius={radius * 4.5}
        lowerRad={-Math.PI / 2}
        upperRad={+Math.PI / 2}
        currentRad={current}
      />
    </group>
  )
}

// ── One row (a single family) of side-by-side parts ──────────────────────────

interface FamilyRowProps {
  family: MeshFamily
  yOffset: number
  radius: number
  linkLength: number
  activeJoint: boolean
  style: MachineStyleName
  currentAngle: number
}

function FamilyRow({
  family, yOffset, radius, linkLength, activeJoint, style, currentAngle,
}: FamilyRowProps) {
  const linkMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(-1.2, yOffset, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1),
  )
  const revMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.3, yOffset, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1),
  )
  const eeMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(+1.8, yOffset, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1),
  )
  return (
    <group>
      <LinkMesh length={linkLength} radius={radius} frameMatrix={linkMatrix} slotIndex={0} family={family} />
      <RevoluteJoint frameMatrix={revMatrix} linkRadius={radius} slotIndex={1} active={activeJoint} family={family} />
      <PrismaticPreview radius={radius} style={style} position={[0.6, yOffset, 0]} />
      <EndEffectorMesh eeMatrix={eeMatrix} linkRadius={radius} family={family} />
      <BasePreview radius={radius} style={style} position={[-2.1, yOffset, 0]} />
      <MotionEnvelopePreview radius={radius} position={[1.2, yOffset, 0]} current={currentAngle} />
    </group>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function MeshLabScene({
  quality, style, activeJoint, familyChoice, currentAngle,
}: {
  quality: MeshQuality
  style: MachineStyleName
  activeJoint: boolean
  familyChoice: FamilyChoice
  currentAngle: number
}) {
  const radius = 0.05
  const linkLength = 0.30
  const showLegacy = familyChoice === 'legacy' || familyChoice === 'both'
  const showLab = familyChoice === 'lab_instrument' || familyChoice === 'both'
  const rowGap = familyChoice === 'both' ? 0.5 : 0
  return (
    <MeshQualityContext.Provider value={quality}>
      <ambientLight intensity={0.08} />
      <directionalLight position={[3, -2, 4]} color="#fff1e0" intensity={1.12} castShadow />
      <directionalLight position={[-2, -2, 1.5]} color="#b8c7d6" intensity={0.35} />
      <directionalLight position={[-1, 3, 3]} color="#fff1e0" intensity={0.5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#2e3a48" roughness={0.92} metalness={0.04} />
      </mesh>

      {showLab && (
        <FamilyRow
          family="lab_instrument" yOffset={+rowGap}
          radius={radius} linkLength={linkLength}
          activeJoint={activeJoint} style={style} currentAngle={currentAngle}
        />
      )}
      {showLegacy && (
        <FamilyRow
          family="legacy" yOffset={-rowGap}
          radius={radius} linkLength={linkLength}
          activeJoint={activeJoint} style={style} currentAngle={currentAngle}
        />
      )}

      <OrbitControls />
    </MeshQualityContext.Provider>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const QUALITIES: MeshQuality[] = ['low', 'medium', 'hero']
const STYLES: MachineStyleName[] = ['baseline', 'machined', 'skeletonized']
const FAMILIES: FamilyChoice[] = ['lab_instrument', 'legacy', 'both']

export function MeshLab() {
  const [quality, setQuality] = useState<MeshQuality>('medium')
  const [style, setStyle] = useState<MachineStyleName>('machined')
  const [familyChoice, setFamilyChoice] = useState<FamilyChoice>('lab_instrument')
  const [activeJoint, setActiveJoint] = useState(false)
  const [currentAngle, setCurrentAngle] = useState(0)

  const buttonStyle = (selected: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left',
    padding: '5px 10px', marginBottom: 4,
    background: selected ? '#1e3a5f' : '#1f2028',
    border: selected ? `1px solid ${semantic.info}` : '1px solid #2e303a',
    color: selected ? accent.default : text.dim,
    fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#15181c', color: '#e2e8f0', fontFamily: 'monospace' }}>
      <div style={{ flex: 1 }}>
        <Canvas
          shadows
          gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02, outputColorSpace: THREE.SRGBColorSpace }}
          camera={{ position: [1.5, -1.5, 1.2], fov: 45 }}
        >
          <MeshLabScene
            quality={quality} style={style} activeJoint={activeJoint}
            familyChoice={familyChoice} currentAngle={currentAngle}
          />
        </Canvas>
      </div>

      <div style={{ width: 240, padding: '24px 16px', borderLeft: '1px solid #2e303a', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: text.faint, marginBottom: 8 }}>MESH LAB</div>
          <div style={{ fontSize: 11, color: text.disabled }}>dev-only preview</div>
        </div>

        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: text.faint, display: 'block', marginBottom: 6 }}>Family</label>
          {FAMILIES.map(f => (
            <button key={f} onClick={() => setFamilyChoice(f)} style={buttonStyle(familyChoice === f)}>{f}</button>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: text.faint, display: 'block', marginBottom: 6 }}>Quality</label>
          {QUALITIES.map(q => (
            <button key={q} onClick={() => setQuality(q)} style={buttonStyle(quality === q)}>{q}</button>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: text.faint, display: 'block', marginBottom: 6 }}>Style (tokens)</label>
          {STYLES.map(s => (
            <button key={s} onClick={() => setStyle(s)} style={buttonStyle(style === s)}>{s}</button>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: text.faint, display: 'block', marginBottom: 6 }}>Joint active</label>
          <button onClick={() => setActiveJoint(v => !v)} style={buttonStyle(activeJoint)}>
            {activeJoint ? 'ON' : 'OFF'}
          </button>
        </div>

        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: text.faint, display: 'block', marginBottom: 6 }}>
            Motion pointer ({(currentAngle * 180 / Math.PI).toFixed(0)}°)
          </label>
          <input
            type="range" min={-90} max={+90} step={1}
            value={currentAngle * 180 / Math.PI}
            onChange={e => setCurrentAngle(Number(e.target.value) * Math.PI / 180)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: 'auto', fontSize: 10, color: borderColor.default, lineHeight: 1.5 }}>
          base&nbsp;|&nbsp;link&nbsp;|&nbsp;rev&nbsp;|&nbsp;prismatic&nbsp;|&nbsp;arc&nbsp;|&nbsp;EE
        </div>
      </div>
    </div>
  )
}
