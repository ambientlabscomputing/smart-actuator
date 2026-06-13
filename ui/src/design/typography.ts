/**
 * Typography design tokens — Box 3 of RFD-14.
 *
 * Defines font stacks, a 5-step size scale, a 3-step weight ramp,
 * tracking presets, and a tabular-figures helper.
 *
 * Rule: no fontSize / fontFamily / fontWeight literal is allowed in a
 * component file. Components import from here instead.
 */

// ── Font stacks ────────────────────────────────────────────────────────────
export const fontStacks = {
  /** Display and UI labels — Inter. Falls back to system-ui. */
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  /** Numeric values, code — JetBrains Mono. Tabular figures enabled via `fontFeatureSettings`. */
  mono: "'JetBrains Mono', ui-monospace, Consolas, monospace",
} as const

// ── Weight ramp (3 steps) ─────────────────────────────────────────────────
export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const

// ── Size scale (5 steps, px) ──────────────────────────────────────────────
/** caption — 10px: table/chart captions, secondary meta. */
export const fontSize = {
  caption: 10,
  /** body — 12px: general body text, list items. */
  body: 12,
  /** label — 11px: section labels, form labels, tooltips. */
  label: 11,
  /** title — 14px: panel headings, toolbar title. */
  title: 14,
  /** display — 17px: page-level headings. */
  display: 17,
} as const

// ── Tracking presets (letter-spacing) ────────────────────────────────────
export const letterSpacing = {
  /** For normal body text. */
  normal: '0em',
  /** For monospace numeric rows. */
  mono: '0.01em',
  /** For uppercase section labels (e.g. "CARTESIAN JOG"). */
  uppercase: '0.08em',
  /** For toolbar/display headings. */
  wide: '0.04em',
} as const

// ── Tabular-figures helper ────────────────────────────────────────────────
/**
 * Apply to any element that renders numbers that should line up vertically
 * (jog values, joint positions, etc.).
 * Usage: `style={{ ...tabularFigures }}`
 */
export const tabularFigures: React.CSSProperties = {
  fontFamily: fontStacks.mono,
  fontFeatureSettings: '"tnum" 1',
  fontVariantNumeric: 'tabular-nums',
} as const

// ── Composed label preset ─────────────────────────────────────────────────
/**
 * The canonical "section label" style used by `SectionLabel` and any
 * one-off uppercase headings that can't use the component.
 */
export const sectionLabelStyle: React.CSSProperties = {
  fontFamily: fontStacks.sans,
  fontSize: fontSize.caption,
  fontWeight: fontWeight.semibold,
  letterSpacing: letterSpacing.uppercase,
  textTransform: 'uppercase',
  lineHeight: 1.4,
} as const
