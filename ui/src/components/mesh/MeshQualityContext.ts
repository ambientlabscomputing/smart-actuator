/**
 * MeshQualityContext — React context that carries the active MeshQuality level
 * through the component tree.
 *
 * Default: 'medium'. Box 6 will set 'low' at onboarding thumbnail callsites.
 * Mesh Lab sets this from the quality dropdown.
 */
import { createContext, useContext } from 'react'
import type { MeshQuality } from '../../design/machineTokens'

export const MeshQualityContext = createContext<MeshQuality>('medium')

export function useMeshQuality(): MeshQuality {
  return useContext(MeshQualityContext)
}
