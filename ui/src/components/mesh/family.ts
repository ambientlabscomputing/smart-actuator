/**
 * MeshFamily — switches which assembly composer the wrapper components use.
 *
 *  - 'legacy'         → buildLinkRecipe / buildRevoluteRecipe / buildEndEffectorRecipe
 *                       (original Box 2 procedural mesh: barrels + bands + seam).
 *  - 'lab_instrument' → buildLinkAssembly / buildActuatorAssembly / buildEndEffectorAssembly
 *                       (Box 2b shape-grammar: shells, bolt circles, motor pods, …).
 */
export type MeshFamily = 'legacy' | 'lab_instrument'

export const defaultMeshFamily: MeshFamily = 'lab_instrument'
