/**
 * Chrome design tokens — Box 3 of RFD-14.
 *
 * Square edges, hairline borders, and a minimal elevation system.
 * The TE discipline is subtractive: no shadows that pretend to be glass,
 * no rounded corners beyond 2 px on controls.
 */
import type React from 'react'

// ── Radius scale (px) ─────────────────────────────────────────────────────
export const radius = {
  /** Form controls — input, select, button. Square-ish. */
  control: 2,
  /** Cards and panels. */
  card: 2,
  /** Floating popovers and overlays. */
  popover: 3,
} as const

// ── Border ────────────────────────────────────────────────────────────────
/**
 * All panel separation uses a hairline border instead of drop shadows.
 * Import `border.hairline` and pass it as `border:` in a style object.
 * The colour comes from `neutrals.border`.
 */
export const border = {
  hairline: `1px solid`,
  none: 'none',
} as const

// ── Elevation (box-shadow) ────────────────────────────────────────────────
/**
 * We use at most ONE shadow token and only for floating popovers that sit
 * on top of the 3D canvas (where a border alone may not read clearly).
 * All 2D chrome panels (cards on Programs, G-code) use hairline borders only.
 */
export const elevation = {
  none: 'none',
  /** Subtle depth for on-canvas floating palette / popover. */
  popover: '0 2px 12px rgba(0,0,0,0.5)',
} as const

// ── Spacing scale (px) ────────────────────────────────────────────────────
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const

// ── Toolbar ───────────────────────────────────────────────────────────────
export const toolbar = {
  height: 52,
} as const

// ── Composed control base ─────────────────────────────────────────────────
/**
 * Base geometry shared by input, select, button.
 * Colour tokens are applied on top by each component.
 */
export const controlBase: React.CSSProperties = {
  borderRadius: radius.control,
  borderWidth: 1,
  borderStyle: 'solid',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
} as const
