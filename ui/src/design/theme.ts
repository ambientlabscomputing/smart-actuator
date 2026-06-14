/**
 * Theme — Box 4 of RFD-14.
 *
 * Single source of truth for every colour in the Smart Actuator UI.
 * All design tokens are composed here.  Component files import from this
 * module (via the `@/design` alias) instead of using hex literals directly.
 *
 * Accent identity: bright mustard yellow — the industrial classic with a
 * tasteful twist.  Chosen to evoke CNC machine envelope markers and E-stop
 * legend colours without being garish against the dark canvas.
 *
 * Accent usage rule (strict): accent marks ONLY the active joint during jog,
 * the currently-executing program step, the recording-active state (RFD-13),
 * and the primary CTA per page.  Nothing else wears accent.
 */

// ── Accent ───────────────────────────────────────────────────────────────────
// Bright mustard yellow.  Distinct from revolute terracotta (#e87655),
// danger red (#ef4444), and the link cyan family (#4fc3f7…).
// All other "pop" colours (sparklines, EE axes) use their own dedicated palettes
// so accent remains singular.

export const accent = {
  /** Primary accent — active joint, running step, primary CTA. */
  default: '#c084fc',
  /** Hover / pressed state on accent-coloured buttons. */
  hover: '#a855f7',
  /** Low-opacity wash for selected borders, halos, focus rings. */
  dim: 'rgba(192,132,252,0.15)',
  /** Text written ON an accent-filled surface. */
  on: '#0d0d0d',
} as const

// ── Background ramp ───────────────────────────────────────────────────────────
export const bg = {
  /** Canvas — deepest background; never used for UI chrome. */
  canvas: '#0d0d0d',
  /** Card / panel background. */
  surface: '#111827',
  /** Elevated rows, hover states, secondary panels. */
  surfaceAlt: '#1f2937',
  /** Highest-elevation overlay (e.g. popover inner well). */
  surfaceRaised: '#1a1a1a',
} as const

// ── Border ramp ───────────────────────────────────────────────────────────────
export const borderColor = {
  /** Standard panel/card edge. */
  default: '#374151',
  /** Dimmer divider (within a panel). */
  dim: '#1f2937',
  /** Focus ring, active toggle highlight. */
  focus: '#4b5563',
} as const

// ── Text ramp ─────────────────────────────────────────────────────────────────
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

// ── Semantic colours ──────────────────────────────────────────────────────────
// Used for system status only (connection, E-stop, program result).
// NOT used for accent / product identity.
export const semantic = {
  /** Danger — E-stop, hardware fault, error. */
  danger: '#ef4444',
  /** Warning — caution state. */
  warn: '#f59e0b',
  /** OK — connected, success, idle-green. */
  ok: '#22c55e',
  /** Info — run mode, informational banners. */
  info: '#3b82f6',
} as const

// ── Chart / sparkline series palette ─────────────────────────────────────────
// Dedicated colour set for time-series plots.  Independent of accent so that
// the accent stays singular on every page.
export const chart = {
  position: '#4fc3f7',    // cyan — joint position
  velocity: '#a78bfa',    // violet — velocity
  current: '#fb923c',     // warm orange — current (A)
  temperature: '#f87171', // rose-red — temperature (°C)
  // Additional series colours for multi-trace plots
  series4: '#34d399',     // emerald
  series5: '#f472b6',     // pink
} as const

// ── Mode colours ──────────────────────────────────────────────────────────────
// Maps machine mode strings to their colour token.
// RUN uses accent — it is the one action state that deserves attention.
export const modeColors = {
  idle: semantic.ok,
  manual: semantic.ok,
  run: accent.default,
  estopped: semantic.danger,
  fault: semantic.danger,
  offline: text.disabled,
} as const

export type MachineMode = keyof typeof modeColors

/** Returns the theme colour for a mode string, defaulting to `text.disabled`. */
export function colorForMode(mode: string): string {
  return (modeColors as Record<string, string>)[mode] ?? text.disabled
}

// ── Composed theme object ─────────────────────────────────────────────────────
// Convenience for components that want a single import.
// `import { theme } from '@/design'`
export const theme = {
  accent,
  bg,
  borderColor,
  text,
  semantic,
  chart,
  modeColors,
  colorForMode,
} as const

// ── Light mode token overrides (gated; not surfaced in UI) ────────────────────
// Defined so that the option exists without requiring a second shader/material
// pass at design time.  A user-visible toggle ships in a later RFD once
// marketing screenshots drive the need for a light-background variant.
export const lightBg = {
  canvas: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  surfaceRaised: '#e5e7eb',
} as const

export const lightText = {
  primary: '#111827',
  secondary: '#1f2937',
  dim: '#6b7280',
  faint: '#9ca3af',
  disabled: '#d1d5db',
} as const

export const lightBorderColor = {
  default: '#e5e7eb',
  dim: '#f3f4f6',
  focus: '#d1d5db',
} as const
