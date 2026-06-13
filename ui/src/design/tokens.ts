/**
 * Base design tokens — Smart Actuator UI machine / 3D colours.
 *
 * Box 2 landed the `machine` and `labInstrument` subsets.
 * Box 4 adds `prismaticCarriage` brass and updates this comment.
 * 2D chrome tokens (bg, text, accent, semantic) live in theme.ts.
 *
 * Rule: NO hex literal or raw number is allowed in a component file.
 * Components import from here (or from machineTokens.ts) instead.
 */

// ── Machine colour roles ────────────────────────────────────────────────────
// Provisional palette matching today's LINK_COLORS / joint orange / base grey.
// Box 4 will pick the final accent and machine sub-palette.

export const machineColors = {
  /** Main link body — cyan family, rotated per-link index */
  link: ['#4fc3f7', '#81d4fa', '#b3e5fc'] as readonly string[],
  /** Revolute joint hub — terracotta. Keep; TE-adjacent and proven. */
  revolute: '#e87655',
  /** Base/world-origin disc */
  base: '#546e7a',
  /** End-effector cap (inactive) */
  ee: '#ffffff',
  /** End-effector cap (drag/active) */
  eeActive: '#fbbf24',
  /** Prismatic rail (static) */
  prismaticRail: '#455a64',
  /** Prismatic carriage — warm brass/sandy beige; distinct from revolute terracotta
   *  and link cyan so joint type is legible at a glance without using accent. */
  prismaticCarriage: '#A08060',
  /** Joint-limit arc sector tint */
  limitArc: '#ffca28',
} as const

// ── Lab-instrument palette (Box 2b) ─────────────────────────────────────────
// Off-white shells, dark joint housings, polished bearings, matte rubber, smoked glass.
// Tuned to read as benchtop scientific equipment rather than candy-coloured demo.

export const labInstrument = {
  /** Outer link shell — off-white / pale graphite rotation per slot. */
  shell: ['#dfe2e3', '#d1d5d7', '#c4c8ca'] as readonly string[],
  /** Structural frame visible through panel gaps. */
  innerFrame: '#2b2f33',
  /** Joint housing — warm dark grey, brushed-anodised feel. */
  jointHousing: '#3a3f44',
  /** Polished bearing ring. */
  bearing: '#9fa6ad',
  /** Hex fastener heads. */
  fastener: '#1c1f22',
  /** Rubber gasket / boot. */
  rubber: '#15171a',
  /** Cable / hose. */
  cable: '#1a1c1f',
  /** Smoked-glass motion envelope. */
  glassField: '#5b6873',
  /** Active accent (LEDs, selection glow). */
  emissiveAccent: '#7dd3fc',
} as const

// ── 3D material property defaults ───────────────────────────────────────────

export const materialDefaults = {
  roughness: 0.65,
  metalness: 0.22,
  /** Slightly glossier finish for the joint hubs */
  revoluteRoughness: 0.55,
  revoluteMetalness: 0.30,
  /** End-effector cap is the most polished surface */
  eeRoughness: 0.45,
  eeMetalness: 0.38,
  /** Matte base disc */
  baseRoughness: 0.88,
  baseMetalness: 0.04,
  /** Lab-instrument shells: matte plastic. */
  shellRoughness: 0.78,
  shellMetalness: 0.05,
  /** Joint housing: anodised aluminium, slight metallic. */
  jointHousingRoughness: 0.55,
  jointHousingMetalness: 0.42,
  /** Polished bearing ring. */
  bearingRoughness: 0.22,
  bearingMetalness: 0.85,
  /** Inner structural frame. */
  innerFrameRoughness: 0.70,
  innerFrameMetalness: 0.30,
  /** Fastener heads: very dark, near-matte. */
  fastenerRoughness: 0.60,
  fastenerMetalness: 0.50,
  /** Rubber boot. */
  rubberRoughness: 0.95,
  rubberMetalness: 0.0,
  /** Cable / hose. */
  cableRoughness: 0.85,
  cableMetalness: 0.0,
  /** Smoked-glass motion envelope. */
  glassRoughness: 0.18,
  glassMetalness: 0.0,
  glassOpacity: 0.22,
} as const
