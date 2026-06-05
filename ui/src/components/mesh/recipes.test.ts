import { describe, it, expect } from 'vitest'
import { buildLinkRecipe } from './link'
import { buildRevoluteRecipe } from './revolute'
import { buildEndEffectorRecipe } from './endEffector'
import { buildPrismaticRecipe } from './prismatic'
import { machinedTokens, baselineTokens, skeletonizedTokens } from '../../design/machineTokens'

// ── Link ─────────────────────────────────────────────────────────────────────

describe('buildLinkRecipe', () => {
  it('bbox length equals the input length', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    expect(r.bbox.length).toBeCloseTo(0.3)
  })

  it('bbox radius is positive', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    expect(r.bbox.radius).toBeGreaterThan(0)
  })

  it('has at least one barrel primitive', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'barrel')).toBe(true)
  })

  it('includes seam when token > 0 (machined)', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'seam')).toBe(true)
  })

  it('omits seam when token = 0 (baseline)', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: baselineTokens })
    expect(r.primitives.some(p => p.kind === 'seam')).toBe(false)
  })

  it('includes inset bands when token > 0 (machined)', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    expect(r.primitives.filter(p => p.kind === 'band').length).toBeGreaterThanOrEqual(2)
  })

  it('barrel halfLength is length/2', () => {
    const r = buildLinkRecipe({ length: 0.4, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens })
    const barrel = r.primitives.find(p => p.kind === 'barrel')!
    expect(barrel.kind).toBe('barrel')
    if (barrel.kind === 'barrel') {
      expect(barrel.halfLength).toBeCloseTo(0.2)
    }
  })

  it('works with skeletonized tokens', () => {
    const r = buildLinkRecipe({ length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: skeletonizedTokens })
    expect(r.primitives.length).toBeGreaterThan(0)
    expect(r.bbox.radius).toBeGreaterThan(0)
  })
})

// ── Revolute ──────────────────────────────────────────────────────────────────

describe('buildRevoluteRecipe', () => {
  it('bbox radius > link radius (hub is wider than link)', () => {
    const r = buildRevoluteRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.bbox.radius).toBeGreaterThan(0.05)
  })

  it('has at least one barrel primitive', () => {
    const r = buildRevoluteRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'barrel')).toBe(true)
  })

  it('active flag adds an extra band', () => {
    const inactive = buildRevoluteRecipe({ linkRadius: 0.05, tokens: machinedTokens, active: false })
    const activePrim = buildRevoluteRecipe({ linkRadius: 0.05, tokens: machinedTokens, active: true })
    const bandCount = (r: typeof inactive) => r.primitives.filter(p => p.kind === 'band').length
    expect(bandCount(activePrim)).toBeGreaterThan(bandCount(inactive))
  })

  it('baseline tokens omit seam and ring', () => {
    const r = buildRevoluteRecipe({ linkRadius: 0.05, tokens: baselineTokens })
    expect(r.primitives.some(p => p.kind === 'seam')).toBe(false)
    expect(r.primitives.some(p => p.kind === 'band')).toBe(false)
  })

  it('bbox length is positive', () => {
    const r = buildRevoluteRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.bbox.length).toBeGreaterThan(0)
  })
})

// ── End-effector ──────────────────────────────────────────────────────────────

describe('buildEndEffectorRecipe', () => {
  it('has exactly one cap primitive', () => {
    const r = buildEndEffectorRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.filter(p => p.kind === 'cap').length).toBe(1)
  })

  it('cap radius is less than link radius', () => {
    const r = buildEndEffectorRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    const cap = r.primitives.find(p => p.kind === 'cap')!
    expect(cap.kind).toBe('cap')
    if (cap.kind === 'cap') {
      expect(cap.radius).toBeLessThan(0.05)
    }
  })

  it('active flag sets role to eeActive', () => {
    const r = buildEndEffectorRecipe({ linkRadius: 0.05, tokens: machinedTokens, active: true })
    const cap = r.primitives.find(p => p.kind === 'cap')!
    expect(cap.role).toBe('eeActive')
  })

  it('inactive cap role is ee', () => {
    const r = buildEndEffectorRecipe({ linkRadius: 0.05, tokens: machinedTokens, active: false })
    const cap = r.primitives.find(p => p.kind === 'cap')!
    expect(cap.role).toBe('ee')
  })

  it('bbox radius is positive', () => {
    const r = buildEndEffectorRecipe({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.bbox.radius).toBeGreaterThan(0)
  })
})

// ── Prismatic stub ────────────────────────────────────────────────────────────

describe('buildPrismaticRecipe (stub)', () => {
  it('returns a non-empty recipe', () => {
    const r = buildPrismaticRecipe({ travelM: 0.4, linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.length).toBeGreaterThan(0)
  })

  it('bbox length equals travelM', () => {
    const r = buildPrismaticRecipe({ travelM: 0.4, linkRadius: 0.05, tokens: machinedTokens })
    expect(r.bbox.length).toBeCloseTo(0.4)
  })
})
