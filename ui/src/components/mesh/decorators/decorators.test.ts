import { describe, it, expect } from 'vitest'
import { emptyRecipe } from '../recipes'
import {
  addBoltCircle,
  addGasketRing,
  addStatusLED,
  addLabelPlate,
  addCableRoute,
  addAlignmentTicks,
} from './index'
import { mulberry32, hashString, seededRng } from './seed'

describe('addBoltCircle', () => {
  it('appends `count` fasteners on the requested circle', () => {
    const r0 = emptyRecipe()
    const r = addBoltCircle(r0, { axialPosition: 0, circleRadius: 0.05, count: 6, diameter: 0.01, depth: 0.005 })
    const bolts = r.primitives.filter(p => p.kind === 'fastener')
    expect(bolts.length).toBe(6)
  })

  it('does not mutate the source recipe', () => {
    const r0 = emptyRecipe()
    addBoltCircle(r0, { axialPosition: 0, circleRadius: 0.05, count: 4, diameter: 0.01, depth: 0.005 })
    expect(r0.primitives.length).toBe(0)
  })

  it('places bolts on the YZ circle at the requested radius', () => {
    const r = addBoltCircle(emptyRecipe(), { axialPosition: 0.1, circleRadius: 0.05, count: 8, diameter: 0.01, depth: 0.005 })
    for (const b of r.primitives) {
      if (b.kind !== 'fastener') continue
      const [x, y, z] = b.position
      expect(x).toBeCloseTo(0.1)
      expect(Math.hypot(y, z)).toBeCloseTo(0.05)
    }
  })
})

describe('addGasketRing', () => {
  it('appends a rubber-roled collar by default', () => {
    const r = addGasketRing(emptyRecipe(), { axialPosition: 0, outerRadius: 0.04, width: 0.003 })
    const c = r.primitives.find(p => p.kind === 'collar')!
    expect(c.role).toBe('rubber')
  })
})

describe('addStatusLED', () => {
  it('uses emissiveAccent role when active', () => {
    const r = addStatusLED(emptyRecipe(), { position: [0, 0, 0.04], normal: [0, 0, 1], radius: 0.005, active: true })
    const led = r.primitives.find(p => p.kind === 'statusLED')!
    expect(led.role).toBe('emissiveAccent')
  })

  it('falls back to innerFrame when inactive', () => {
    const r = addStatusLED(emptyRecipe(), { position: [0, 0, 0.04], normal: [0, 0, 1], radius: 0.005, active: false })
    const led = r.primitives.find(p => p.kind === 'statusLED')!
    expect(led.role).toBe('innerFrame')
  })
})

describe('addLabelPlate, addCableRoute, addAlignmentTicks', () => {
  it('label is appended with the supplied text', () => {
    const r = addLabelPlate(emptyRecipe(), { position: [0,0,0], normal: [1,0,0], width: 0.01, height: 0.005, text: 'J1' })
    const l = r.primitives.find(p => p.kind === 'label')!
    expect(l.text).toBe('J1')
  })

  it('cable is appended with the supplied polyline', () => {
    const pts: [number, number, number][] = [[0,0,0], [0.1, 0, 0], [0.2, 0.05, 0]]
    const r = addCableRoute(emptyRecipe(), { points: pts, radius: 0.003 })
    const c = r.primitives.find(p => p.kind === 'tube')!
    expect(c.points.length).toBe(3)
  })

  it('alignment tick appends a band primitive', () => {
    const r = addAlignmentTicks(emptyRecipe(), { axialPosition: 0, outerRadius: 0.05, width: 0.002, depth: 0.001 })
    expect(r.primitives.some(p => p.kind === 'band')).toBe(true)
  })
})

describe('seed', () => {
  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })

  it('mulberry32 yields values in [0,1)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hashString is stable', () => {
    expect(hashString('arm.J1')).toBe(hashString('arm.J1'))
    expect(hashString('arm.J1')).not.toBe(hashString('arm.J2'))
  })

  it('seededRng pipes hashString through mulberry32', () => {
    const a = seededRng('arm.J1')
    const b = seededRng('arm.J1')
    expect(a()).toBe(b())
  })
})
