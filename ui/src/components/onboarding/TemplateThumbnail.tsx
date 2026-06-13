/**
 * TemplateThumbnail — a small, low-poly 3-D preview of a template's machine.
 *
 * Reuses the Box 1 lighting + Box 2 procedural meshes (via AppCanvas/ArmCanvas)
 * at MeshQuality 'low'.  When `active` (card hover/selected) the camera slowly
 * auto-orbits.  If the DH chain can't be derived, falls back to the Box 5
 * SVG MachineSilhouette so the card never renders empty.
 */
import { useMemo } from 'react'
import { AppCanvas } from '../AppCanvas'
import { ArmCanvas } from '../ArmCanvas'
import { MachineSilhouette } from '../MachineSilhouette'
import { dhToLinkLengths, dhValuesFromSchema } from '../../lib/dh'
import { forwardKinematics } from '../../lib/fk'
import type { DHChainValues, Template } from '../../lib/types'

interface TemplateThumbnailProps {
  template: Template
  /** When true, the camera auto-orbits (card hover / selected). */
  active?: boolean
  width?: number
  height?: number
}

/** Derive a framed camera from the chain's reach so any template fits the view. */
function frameCamera(dh: DHChainValues): {
  position: [number, number, number]
  target: [number, number, number]
} {
  const angles = dh.joints.map(() => 0)
  const { jointOrigins, ee } = forwardKinematics(dh.joints, angles)
  const pts: [number, number, number][] = [[0, 0, 0], ...jointOrigins, ee]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const zs = pts.map((p) => p[2])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const reach = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    0.2,
  )
  const dist = reach * 1.9
  return {
    position: [cx + dist * 0.7, cy + dist * 0.7, cz + dist * 0.55],
    target: [cx, cy, cz],
  }
}

export function TemplateThumbnail({ template, active = false, width = 240, height = 150 }: TemplateThumbnailProps) {
  const dh = useMemo<DHChainValues | null>(
    () => (template.dh ? dhValuesFromSchema(template.dh) : null),
    [template.dh],
  )

  const camera = useMemo(() => (dh ? frameCamera(dh) : null), [dh])

  // No DH schema → static silhouette fallback (still derived from any joints).
  if (!dh || !camera || dh.joints.length === 0) {
    const fallbackJoints = dh?.joints ?? []
    const angles = fallbackJoints.map(() => 0)
    const fk = fallbackJoints.length > 0 ? forwardKinematics(fallbackJoints, angles) : null
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MachineSilhouette
          joints={fallbackJoints}
          jointOrigins={fk?.jointOrigins ?? []}
          ee={fk?.ee ?? null}
          width={width}
          height={height}
        />
      </div>
    )
  }

  const angles = dh.joints.map(() => 0)
  const dof = dh.joints.length
  // Scale visual radius down for dense high-DOF arms so individual links
  // and joints read clearly at thumbnail size. DH geometry is unchanged.
  const previewRadius =
    dof >= 7 ? dh.link_radius * 0.48 :
    dof >= 6 ? dh.link_radius * 0.62 :
               dh.link_radius
  const previewQuality = dof >= 5 ? 'medium' : 'low'

  return (
    <div style={{ width, height }}>
      <AppCanvas
        initialCameraPosition={camera.position}
        initialCameraTarget={camera.target}
        autoRotate={active}
        autoRotateSpeed={0.9}
        showGizmo={false}
        showFloor={false}
        interactive={false}
        orbitEnabled={false}
      >
        <ArmCanvas
          anglesRad={angles}
          linkLengths={dhToLinkLengths(dh)}
          dhJoints={dh.joints}
          radius={previewRadius}
          quality={previewQuality}
        />
      </AppCanvas>
    </div>
  )
}
