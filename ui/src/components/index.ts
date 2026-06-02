/**
 * components/index.ts — single import surface for the visual layer.
 *
 * RULE: Every file outside src/components/ MUST import visual primitives from
 * here, never from @mui/material, @emotion/*, three, or @react-three/* directly.
 * The ESLint no-restricted-imports rule enforces this at lint time.
 *
 * To use a new MUI / R3F primitive elsewhere in the app, wrap it here first.
 */
export { AppCanvas } from './AppCanvas'
export { AppToolbar } from './AppToolbar'
export { ArmCanvas } from './ArmCanvas'
export { WorkspaceMenu } from './WorkspaceMenu'
export { Joint } from './Joint'
export { JointDataPanel } from './JointDataPanel'
export type { JointHistory } from './JointDataPanel'
export { LoadingScreen } from './LoadingScreen'
export { MachineEditor } from './MachineEditor'
export { ProgramRunPanel } from './programs/ProgramRunPanel'
export { ProgramRunView } from './programs/ProgramRunView'
export { Stack } from './Stack'
export { StatusBadge } from './StatusBadge'
export { Typography } from './Typography'
