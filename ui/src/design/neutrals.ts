/**
 * Neutral colour tokens — Box 3 of RFD-14.
 *
 * Box 4 note: bg, borderColor, text, semantic, and accent are now defined
 * in theme.ts and re-exported from there.  This file re-exports from theme.ts
 * so that any remaining imports of `@/design` that use the old named exports
 * continue to resolve without changes.
 *
 * Rule: no hex literal outside src/design/.
 */
export {
  bg,
  borderColor,
  text,
  semantic,
  accent,
  colorForMode,
} from './theme'
