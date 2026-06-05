/**
 * Machine style presets — named collections of MachineTokens.
 *
 * A style preset swaps token values; it does NOT fork the mesh architecture.
 * Adding a new style is purely additive (no mesh-file edits required).
 *
 * Box 4 will add the `teenageEngineeringInspired` preset once the final
 * accent colour and palette are decided.
 */
import {
  type MachineTokens,
  baselineTokens,
  machinedTokens,
  skeletonizedTokens,
} from './machineTokens'

export type MachineStyleName = 'baseline' | 'machined' | 'skeletonized'

const styles: Record<MachineStyleName, MachineTokens> = {
  baseline: baselineTokens,
  machined: machinedTokens,
  skeletonized: skeletonizedTokens,
}

/** Returns the token object for a given style name. Default: 'machined'. */
export function getMachineStyle(name: MachineStyleName = 'machined'): MachineTokens {
  return styles[name]
}

/** The active default style for production renders. Change here to A/B test. */
export const defaultMachineStyle: MachineStyleName = 'machined'
