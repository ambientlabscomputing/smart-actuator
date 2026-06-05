/**
 * Assembly composers for the lab_instrument family.
 *
 * Each composer returns a `MeshRecipe` built from the new shape-grammar
 * primitives (shells, plates, bosses, fasteners, panels, …) so the visual
 * result reads as a precision-machined benchtop instrument rather than a
 * sequence of bare cylinders.
 *
 * All composers stay in the same "+X = part axis" frame as the legacy
 * builders — the React wrapper components (`LinkMesh`, `RevoluteJoint`, etc.)
 * already place the group at the correct DH frame, so we don't need to do any
 * extra orientation logic here.
 */
export { buildLinkAssembly } from './linkAssembly'
export type { LinkAssemblyOptions } from './linkAssembly'

export { buildActuatorAssembly } from './actuatorAssembly'
export type { ActuatorAssemblyOptions } from './actuatorAssembly'

export { buildEndEffectorAssembly } from './endEffectorAssembly'
export type { EndEffectorAssemblyOptions } from './endEffectorAssembly'

export { buildBaseAssembly } from './baseAssembly'
export type { BaseAssemblyOptions } from './baseAssembly'
