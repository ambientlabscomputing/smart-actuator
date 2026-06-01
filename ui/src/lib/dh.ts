/**
 * Generic DH ↔ Easy-alias converters (frontend mirror of brain/service/dh_urdf.py).
 *
 * All logic is driven by the template-declared easy[] alias list and dh schema —
 * no field names are hard-coded here.
 */

import type { DHChainSchema, DHChainValues, DHFieldSpec, DHJointSpec, DHJointValues, EasyAlias } from './types'

// ── Target resolver ────────────────────────────────────────────────────────────

type DHJointValueField = keyof Omit<DHJointValues, 'name' | 'slot'>

/**
 * Read the current value of a DH target path from a DHChainValues object.
 * Target syntax:
 *   "link_radius"              — shared radius
 *   "joints[N].field"          — per-joint numeric field
 *   "joints[N].limit_symmetric" — reads the upper limit (unsigned magnitude)
 */
export function readDhTarget(values: DHChainValues, target: string): number {
  if (target === 'link_radius') return values.link_radius

  const m = target.match(/^joints\[(\d+)\]\.(\w+)$/)
  if (!m) throw new Error(`Cannot resolve DH target: ${target}`)

  const idx = parseInt(m[1], 10)
  const field = m[2]
  const joint = values.joints[idx]
  if (!joint) throw new Error(`DH joint index out of range: ${idx}`)

  if (field === 'limit_symmetric') return joint.limit_upper  // unsigned magnitude

  return (joint as unknown as Record<string, number>)[field] ?? 0
}

/**
 * Return a new DHChainValues with the given target written.
 * Does NOT mutate the input.
 */
export function writeDhTarget(
  values: DHChainValues,
  target: string,
  value: number,
): DHChainValues {
  if (target === 'link_radius') {
    return { ...values, link_radius: value }
  }

  const m = target.match(/^joints\[(\d+)\]\.(\w+)$/)
  if (!m) throw new Error(`Cannot resolve DH target: ${target}`)

  const idx = parseInt(m[1], 10)
  const field = m[2]
  const joints = values.joints.map((j, i) => {
    if (i !== idx) return j
    if (field === 'limit_symmetric') {
      const abs = Math.abs(value)
      return { ...j, limit_lower: -abs, limit_upper: abs }
    }
    return { ...j, [field as DHJointValueField]: value }
  })

  return { ...values, joints }
}

// ── Easy ↔ DH ────────────────────────────────────────────────────────────────

/**
 * Derive an Easy-mode display value (one slider's value) from DHChainValues
 * via a template-declared EasyAlias.
 */
export function readEasyAlias(values: DHChainValues, alias: EasyAlias): number {
  return readDhTarget(values, alias.target)
}

/**
 * Return a new DHChainValues with the Easy alias value written.
 */
export function writeEasyAlias(
  values: DHChainValues,
  alias: EasyAlias,
  value: number,
): DHChainValues {
  return writeDhTarget(values, alias.target, value)
}

// ── Seed from defaults ────────────────────────────────────────────────────────

/** Build a DHChainValues seeded from a template's dh schema defaults. */
export function dhValuesFromSchema(schema: DHChainSchema): DHChainValues {
  return {
    link_radius: schema.link_radius.default,
    joints: schema.joints.map((js) => ({
      name: js.name,
      slot: js.slot,
      a: js.a.default,
      d: js.d.default,
      alpha: js.alpha.default,
      theta_offset: js.theta_offset.default,
      limit_lower: js.limit_lower.default,
      limit_upper: js.limit_upper.default,
      mass: js.mass.default,
    })),
  }
}

// ── DHChainValues → ArmCanvas props ──────────────────────────────────────────

/** Extract link lengths for ArmCanvas from DH chain values (a parameters = link lengths). */
export function dhToLinkLengths(values: DHChainValues): number[] {
  return values.joints.map((j) => j.a)
}

// ── Schema target resolver ───────────────────────────────────────────────────

/**
 * Resolve a DH target path against a template's DH schema and return the
 * underlying DHFieldSpec (so callers can read min/max/unit/editable).
 * Returns undefined if the schema is missing or the target doesn't resolve.
 *
 * For "joints[N].limit_symmetric", returns the limit_upper spec (its max is
 * the magnitude bound; min is treated as 0 by the Easy slider).
 */
export function readDhTargetSpec(
  schema: DHChainSchema | undefined,
  target: string,
): DHFieldSpec | undefined {
  if (!schema) return undefined
  if (target === 'link_radius') return schema.link_radius

  const m = target.match(/^joints\[(\d+)\]\.(\w+)$/)
  if (!m) return undefined

  const idx = parseInt(m[1], 10)
  const field = m[2]
  const joint: DHJointSpec | undefined = schema.joints[idx]
  if (!joint) return undefined

  if (field === 'limit_symmetric') return joint.limit_upper
  return (joint as unknown as Record<string, DHFieldSpec | undefined>)[field]
}

/** Resolve an Easy alias to its underlying DHFieldSpec via the schema. */
export function readEasyAliasSpec(
  schema: DHChainSchema | undefined,
  alias: EasyAlias,
): DHFieldSpec | undefined {
  return readDhTargetSpec(schema, alias.target)
}
