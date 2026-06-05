/**
 * MaterialRegistry — React hook that returns memoised Three.js materials
 * keyed by semantic MeshRole.
 *
 * Components request a material by role name; they never instantiate ad-hoc
 * colors or roughness values. Box 4 will route this through the full colour
 * token system. For now the values are derived from `machineColors` /
 * `materialDefaults` in tokens.ts, plus a link-colour-index override.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { MeshRole } from './recipes'
import { machineColors, labInstrument, materialDefaults } from '../../design/tokens'

export type MaterialMap = Record<MeshRole, THREE.MeshStandardMaterial>

/**
 * Returns a stable map from MeshRole → MeshStandardMaterial.
 * Re-created only when `linkColorIndex` changes.
 *
 * @param linkColorIndex  Index into the link-colour rotation (joint slot index).
 */
export function useMaterials(linkColorIndex: number): MaterialMap {
  return useMemo(() => {
    const linkColor = machineColors.link[linkColorIndex % machineColors.link.length]
    const shellColor = labInstrument.shell[linkColorIndex % labInstrument.shell.length]
    return {
      link: new THREE.MeshStandardMaterial({
        color: linkColor,
        roughness: materialDefaults.roughness,
        metalness: materialDefaults.metalness,
      }),
      revolute: new THREE.MeshStandardMaterial({
        color: machineColors.revolute,
        roughness: materialDefaults.revoluteRoughness,
        metalness: materialDefaults.revoluteMetalness,
      }),
      prismatic: new THREE.MeshStandardMaterial({
        color: machineColors.prismaticRail,
        roughness: materialDefaults.roughness,
        metalness: materialDefaults.metalness,
      }),
      ee: new THREE.MeshStandardMaterial({
        color: machineColors.ee,
        roughness: materialDefaults.eeRoughness,
        metalness: materialDefaults.eeMetalness,
        emissive: new THREE.Color('#a5d6a7'),
        emissiveIntensity: 0.6,
      }),
      eeActive: new THREE.MeshStandardMaterial({
        color: machineColors.eeActive,
        roughness: materialDefaults.eeRoughness,
        metalness: materialDefaults.eeMetalness,
        emissive: new THREE.Color('#f59e0b'),
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
      }),
      base: new THREE.MeshStandardMaterial({
        color: machineColors.base,
        roughness: materialDefaults.baseRoughness,
        metalness: materialDefaults.baseMetalness,
      }),
      shadowInset: new THREE.MeshStandardMaterial({
        color: '#1a2029',
        roughness: 1.0,
        metalness: 0.0,
      }),
      // ── Lab-instrument family ──────────────────────────────────────────────
      shell: new THREE.MeshStandardMaterial({
        color: shellColor,
        roughness: materialDefaults.shellRoughness,
        metalness: materialDefaults.shellMetalness,
      }),
      innerFrame: new THREE.MeshStandardMaterial({
        color: labInstrument.innerFrame,
        roughness: materialDefaults.innerFrameRoughness,
        metalness: materialDefaults.innerFrameMetalness,
      }),
      jointHousing: new THREE.MeshStandardMaterial({
        color: labInstrument.jointHousing,
        roughness: materialDefaults.jointHousingRoughness,
        metalness: materialDefaults.jointHousingMetalness,
      }),
      bearing: new THREE.MeshStandardMaterial({
        color: labInstrument.bearing,
        roughness: materialDefaults.bearingRoughness,
        metalness: materialDefaults.bearingMetalness,
      }),
      fastener: new THREE.MeshStandardMaterial({
        color: labInstrument.fastener,
        roughness: materialDefaults.fastenerRoughness,
        metalness: materialDefaults.fastenerMetalness,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: labInstrument.rubber,
        roughness: materialDefaults.rubberRoughness,
        metalness: materialDefaults.rubberMetalness,
      }),
      cable: new THREE.MeshStandardMaterial({
        color: labInstrument.cable,
        roughness: materialDefaults.cableRoughness,
        metalness: materialDefaults.cableMetalness,
      }),
      glassField: new THREE.MeshStandardMaterial({
        color: labInstrument.glassField,
        roughness: materialDefaults.glassRoughness,
        metalness: materialDefaults.glassMetalness,
        transparent: true,
        opacity: materialDefaults.glassOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      emissiveAccent: new THREE.MeshStandardMaterial({
        color: labInstrument.emissiveAccent,
        roughness: 0.4,
        metalness: 0.1,
        emissive: new THREE.Color(labInstrument.emissiveAccent),
        emissiveIntensity: 1.2,
      }),
    }
  }, [linkColorIndex])
}
