import { color, font, space, radius } from '../design/tokens'
import programRunning from '../assets/screenshots/program-running.jpg'

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
          <img
            src={programRunning}
            alt="A saved program running on the arm, with each step completing"
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              objectFit: 'cover',
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              display: 'block',
            }}
          />
        </div>
      </div>
    </section>
  )
}
