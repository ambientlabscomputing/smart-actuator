import { useState } from 'react'
import { color, font, space, radius } from '../design/tokens'

const machineTypes = ['Arm', 'Gantry', 'SCARA', 'Delta'] as const

type MachineType = (typeof machineTypes)[number]

const machineCopy: Record<MachineType, { title: string; body: string }> = {
  Arm: {
    title: 'Articulated Arm',
    body: 'Multi-joint serial manipulator for general pick-and-place and precision reach tasks.',
  },
  Gantry: {
    title: 'Cartesian Gantry',
    body: 'Linear axes for stable, repeatable motion over larger work envelopes.',
  },
  SCARA: {
    title: 'SCARA',
    body: 'Fast planar motion with compact footprint and high throughput assembly behavior.',
  },
  Delta: {
    title: 'Delta',
    body: 'Parallel kinematics for high-speed lightweight positioning and sorting flows.',
  },
}

export function BuildMachineSection() {
  const [activeType, setActiveType] = useState<MachineType>('Arm')

  return (
    <section style={{
      borderTop: `1px solid ${color.border}`,
      padding: `${space.xxl}px ${space.lg}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: space.xl,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 760 }}>
        <h2 style={{
          margin: 0,
          fontFamily: font.sans,
          fontSize: 'clamp(24px, 3.4vw, 38px)',
          letterSpacing: '-0.02em',
        }}>
          Build a machine.
        </h2>
        <p style={{
          margin: `${space.md}px 0 0`,
          color: color.textSecondary,
          lineHeight: 1.65,
          fontSize: 15,
        }}>
          Compose actuators into arms, gantries, and custom machines.
          Kinematics are generated automatically.
        </p>
      </div>

      <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
        {machineTypes.map((type) => {
          const isActive = type === activeType
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              style={{
                border: `1px solid ${isActive ? color.accent : color.border}`,
                background: isActive ? color.accentDim : color.surface,
                color: isActive ? color.accent : color.textSecondary,
                borderRadius: 999,
                padding: '6px 14px',
                fontFamily: font.sans,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {type}
            </button>
          )
        })}
      </div>

      <div style={{
        width: 'min(980px, 100%)',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          alignItems: 'stretch',
        }}>
          <div style={{
            background: 'radial-gradient(circle at 24% 18%, rgba(170,59,255,0.22) 0%, rgba(26,23,39,0.95) 38%, rgba(8,6,13,0.98) 100%)',
            borderRight: `1px solid ${color.border}`,
            minHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: `${space.lg}px`,
          }}>
            <div>
              <div style={{
                fontSize: 11,
                color: color.accent,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                marginBottom: space.sm,
              }}>
                Builder Preview
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: space.sm }}>
                {machineCopy[activeType].title}
              </div>
              <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
                {machineCopy[activeType].body}
              </div>
            </div>
            <div style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: color.textDim,
              border: `1px dashed ${color.border}`,
              borderRadius: radius.md,
              padding: `${space.sm}px ${space.md}px`,
              marginTop: space.lg,
            }}>
              Drop screenshot at public-ui/src/assets/screenshots/{activeType.toLowerCase()}.png
            </div>
          </div>

          <div style={{
            minHeight: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            background: 'linear-gradient(160deg, rgba(17,16,24,0.95) 0%, rgba(8,6,13,1) 100%)',
          }}>
            <div style={{
              width: 'min(92%, 520px)',
              aspectRatio: '16 / 10',
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              background: 'radial-gradient(circle at 20% 20%, rgba(170,59,255,0.2) 0%, rgba(8,6,13,0.95) 70%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: `${space.md}px`,
              boxSizing: 'border-box',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: color.textDim,
                marginBottom: space.sm,
              }}>
                Machine Scene Placeholder
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {activeType} visual goes here
              </div>
              <div style={{ color: color.textSecondary, fontSize: 13, lineHeight: 1.5, maxWidth: 320 }}>
                Add screenshots or short clips from MachineEditor to show builder capabilities.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
