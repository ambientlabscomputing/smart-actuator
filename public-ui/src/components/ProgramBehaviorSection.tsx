import { color, font, space, radius } from '../design/tokens'

const codeBlockStyle: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 12,
  lineHeight: 1.7,
  color: color.textPrimary,
  background: 'rgba(5,5,8,0.8)',
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  padding: `${space.sm}px ${space.md}px`,
  whiteSpace: 'pre-wrap',
}

export function ProgramBehaviorSection() {
  return (
    <section style={{
      borderTop: `1px solid ${color.border}`,
      padding: `${space.xxl}px ${space.lg}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: space.xl,
      background: 'rgba(17,16,24,0.35)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 760 }}>
        <h2 style={{
          margin: 0,
          fontFamily: font.sans,
          fontSize: 'clamp(24px, 3.4vw, 38px)',
          letterSpacing: '-0.02em',
        }}>
          Program behavior.
        </h2>
        <p style={{
          margin: `${space.md}px 0 0`,
          color: color.textSecondary,
          lineHeight: 1.65,
          fontSize: 15,
        }}>
          Describe what the machine should do. The brain plans and executes motion.
        </p>
      </div>

      <div style={{
        width: 'min(980px, 100%)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: space.lg,
      }}>
        <div style={{
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: `${space.lg}px ${space.xl}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: space.md,
        }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: color.accent,
          }}>
            Control API
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35 }}>
            Turn intent into motion with a few lines of code.
          </div>
          <div style={codeBlockStyle}>{`robot.move_to(x=250, y=100)\n\nrobot.wait(2)\n\nrobot.move_to(x=100, y=50)`}</div>
        </div>

        <div style={{
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: `${space.md}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: radius.md,
            border: `1px solid ${color.border}`,
            background: 'radial-gradient(circle at 18% 20%, rgba(170,59,255,0.18) 0%, rgba(8,6,13,0.97) 68%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            textAlign: 'center',
            padding: `${space.md}px`,
            boxSizing: 'border-box',
          }}>
            <div style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: color.textDim,
            }}>
              Execution Preview Placeholder
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Robot executing the program
            </div>
            <div style={{ color: color.textSecondary, fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
              Replace with mp4, gif, or screenshot of the machine running this sequence.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
