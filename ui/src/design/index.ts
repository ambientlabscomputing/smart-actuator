/**
 * Design tokens barrel — re-exports all token modules.
 *
 * Import everything from '@/design' in component files.
 * Machine / 3D tokens live in tokens.ts and machineTokens.ts
 * (not re-exported here to avoid confusion with 2D chrome tokens).
 *
 * Box 4: theme.ts is now the primary source of truth for all 2D colours.
 * neutrals.ts re-exports from theme.ts for backwards-compat; both work.
 */
export * from './typography'
export * from './chrome'
export * from './theme'
