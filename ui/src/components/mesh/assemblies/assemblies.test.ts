import { describe, it, expect } from 'vitest'
import {
  buildLinkAssembly,
  buildActuatorAssembly,
  buildEndEffectorAssembly,
  buildBaseAssembly,
} from './index'
import { machinedTokens, baselineTokens } from '../../../design/machineTokens'

describe('buildLinkAssembly', () => {
  it('emits a profileExtrusion shell', () => {
    const r = buildLinkAssembly({
      length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens,
    })
    expect(r.primitives.some(p => p.kind === 'profileExtrusion' && p.role === 'shell')).toBe(true)
  })

  it('includes an innerFrame spine', () => {
    const r = buildLinkAssembly({
      length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens,
    })
    expect(r.primitives.some(p => p.kind === 'profileExtrusion' && p.role === 'innerFrame')).toBe(true)
  })

  it('adds end plates with bolt circles', () => {
    const r = buildLinkAssembly({
      length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens,
    })
    const plates = r.primitives.filter(p => p.kind === 'plate')
    const bolts = r.primitives.filter(p => p.kind === 'fastener')
    expect(plates.length).toBe(2)
    expect(bolts.length).toBeGreaterThanOrEqual(8) // 4 per end
  })

  it('omits bolts when fastener density = 0', () => {
    const r = buildLinkAssembly({
      length: 0.3, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: baselineTokens,
    })
    expect(r.primitives.some(p => p.kind === 'fastener')).toBe(false)
  })

  it('bbox length matches input length', () => {
    const r = buildLinkAssembly({
      length: 0.4, radius: 0.05, startJoint: 'revolute', endJoint: 'revolute', tokens: machinedTokens,
    })
    expect(r.bbox.length).toBeCloseTo(0.4)
  })
})

describe('buildActuatorAssembly', () => {
  it('emits a hex housing', () => {
    const r = buildActuatorAssembly({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'profileExtrusion' && p.profile === 'hex')).toBe(true)
  })

  it('has bearings on both faces', () => {
    const r = buildActuatorAssembly({ linkRadius: 0.05, tokens: machinedTokens })
    const bearings = r.primitives.filter(p => p.kind === 'collar' && p.role === 'bearing')
    expect(bearings.length).toBe(2)
  })

  it('has motor + encoder bosses', () => {
    const r = buildActuatorAssembly({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.filter(p => p.kind === 'boss').length).toBeGreaterThanOrEqual(2)
  })

  it('active flag flips LED role to emissiveAccent', () => {
    const inactive = buildActuatorAssembly({ linkRadius: 0.05, tokens: machinedTokens, active: false })
    const activePrim = buildActuatorAssembly({ linkRadius: 0.05, tokens: machinedTokens, active: true })
    const ledOff = inactive.primitives.find(p => p.kind === 'statusLED')!
    const ledOn = activePrim.primitives.find(p => p.kind === 'statusLED')!
    expect(ledOff.role).not.toBe('emissiveAccent')
    expect(ledOn.role).toBe('emissiveAccent')
  })
})

describe('buildEndEffectorAssembly', () => {
  it('has a flange plate and a tip cap', () => {
    const r = buildEndEffectorAssembly({ linkRadius: 0.05, tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'plate')).toBe(true)
    expect(r.primitives.some(p => p.kind === 'cap')).toBe(true)
  })

  it('active flag flips tip role to eeActive', () => {
    const inactive = buildEndEffectorAssembly({ linkRadius: 0.05, tokens: machinedTokens, active: false })
    const activePrim = buildEndEffectorAssembly({ linkRadius: 0.05, tokens: machinedTokens, active: true })
    const tipOff = inactive.primitives.find(p => p.kind === 'cap')!
    const tipOn = activePrim.primitives.find(p => p.kind === 'cap')!
    expect(tipOff.role).toBe('ee')
    expect(tipOn.role).toBe('eeActive')
  })
})

describe('buildBaseAssembly', () => {
  it('has a disc, a turret, a bearing, and bolts', () => {
    const r = buildBaseAssembly({ radius: 0.2, thickness: 0.04, tokens: machinedTokens })
    expect(r.primitives.some(p => p.kind === 'plate' && p.role === 'base')).toBe(true)
    expect(r.primitives.filter(p => p.kind === 'collar').length).toBeGreaterThanOrEqual(2)
    expect(r.primitives.filter(p => p.kind === 'fastener').length).toBeGreaterThanOrEqual(4)
  })

  it('bbox radius equals input radius', () => {
    const r = buildBaseAssembly({ radius: 0.2, thickness: 0.04, tokens: machinedTokens })
    expect(r.bbox.radius).toBeCloseTo(0.2)
  })
})
