/**
 * Neutral colour tokens — Box 3 of RFD-14.
 *
 * Maps the existing hex literals in the codebase to semantic names so that
 * Box 4 can swap the full colour system in one place.
 *
 * INTENTIONALLY contains NO accent colour. The accent identity
 * (safety yellow, cyan, or otherwise) is decided and shipped in Box 4.
 * A `provisionalAccent` token keeps the current blue CTA colour accessible
 * as a single, replaceable constant until Box 4 lands.
 *
 * Rule: no hex literal outside this file (or tokens.ts for 3D machine colours).
 */

// ── Background ramp ─────────────────────────────────────────────────────
export const bg = {
  /** Canvas, deepest background — never used for UI chrome. */
  canvas: '#0d0d0d',
  /** Card / panel background. */
  surface: '#111827',
  /** Elevated rows, hover states, secondary panels. */
  surfaceAlt: '#1f2937',
  /** Highest-elevation overlay (e.g. popover inner well). */
  surfaceRaised: '#1a1a1a',
} as const

// ── Border ramp ──────────────────────────────────────────────────────────
export const borderColor = {
  /** Standard panel/card edge. */
  default: '#374151',
  /** Dimmer divider (within a panel). */
  dim: '#1f2937',
  /** Focus ring, active toggle highlight. */
  focus: '#4b5563',
} as const

// ── Text ramp ────────────────────────────────────────────────────────────
export const text = {
  /** Primary — headings, button labels, active values. */
  primary: '#f3f4f6',
  /** Secondary — body text, navigation items. */
  secondary: '#e5e7eb',
  /** Dim — labels, inactive state. */
  dim: '#9ca3af',
  /** Faint — section headers, metadata. */
  faint: '#6b7280',
  /** Disabled / inactive. */
  disabled: '#4b5563',
} as const

// ── Semantic colours ─────────────────────────────────────────────────────
export const semantic = {
  /** Danger / E-stop / error. */
  danger: '#ef4444',
  /** Warning / caution. */
  warn: '#f59e0b',
  /** OK / connected / success. */
  ok: '#22c55e',
  /** Info / running. */
  info: '#3b82f6',
} as const

// ── Provisional accent ───────────────────────────────────────────────────
/**
 * Single replaceable constant for the current "primary CTA" blue.
 * Box 4 replaces this with the chosen product accent.
 */
export const provisionalAccent = {
  default: '#2563eb',
  hover: '#1d4ed8',
  dim: 'rgba(37,99,235,0.15)',
} as const
