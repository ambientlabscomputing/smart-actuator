import { ActuatorDemo } from './components/ActuatorDemo'
import { color, font, space } from './design/tokens'
import './index.css'

function App() {
  return (
    <div style={{
      minHeight: '100svh',
      background: color.bg,
      color: color.textPrimary,
      fontFamily: font.sans,
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${space.md}px ${space.xxl}px`,
        borderBottom: `1px solid rgba(42,38,64,0.5)`,
        position: 'sticky',
        top: 0,
        background: 'rgba(8,6,13,0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: color.textPrimary }}>
          smart-actuator
        </span>
        <nav style={{ display: 'flex', gap: space.xl, alignItems: 'center' }}>
          <a href="https://github.com/ambient-labs/smart-actuator"
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: color.textSecondary, textDecoration: 'none' }}>
            GitHub
          </a>
          <a href="https://ambientlabs.io"
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: 13, color: color.accent, textDecoration: 'none',
              border: `1px solid ${color.accent}`,
              borderRadius: 6, padding: '4px 12px',
              background: color.accentDim,
            }}>
            ambientlabs.io →
          </a>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: `${space.xxl * 2}px ${space.xl}px ${space.xxl}px`,
        gap: space.lg,
      }}>
        <div style={{
          display: 'inline-block',
          background: color.accentDim,
          border: `1px solid ${color.accent}`,
          borderRadius: 999,
          padding: '4px 14px',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: color.accent,
          marginBottom: space.sm,
        }}>
          Open source · MIT
        </div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 72px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: 0,
          maxWidth: 720,
          background: `linear-gradient(135deg, ${color.textPrimary} 40%, ${color.accent})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          A smart actuator for the real world.
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2vw, 19px)',
          color: color.textSecondary,
          maxWidth: 580,
          margin: 0,
          lineHeight: 1.65,
        }}>
          Precision motion control — firmware, sim, brain, and UI — all open
          source. Built with Rust on ESP32, compiled to WebAssembly for the
          browser.
        </p>
        <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', justifyContent: 'center', marginTop: space.sm }}>
          <a
            href="https://github.com/ambient-labs/smart-actuator"
            target="_blank" rel="noopener noreferrer"
            style={{
              background: color.accent,
              color: '#fff',
              textDecoration: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Get Started →
          </a>
          <a
            href="https://ambientlabs.io"
            target="_blank" rel="noopener noreferrer"
            style={{
              background: 'transparent',
              color: color.textSecondary,
              textDecoration: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              border: `1px solid ${color.border}`,
            }}
          >
            Custom development
          </a>
        </div>
      </section>

      {/* ── Demo ────────────────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${color.border}`, background: 'rgba(17,16,24,0.4)' }}>
        <ActuatorDemo />
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        marginTop: 'auto',
        borderTop: `1px solid ${color.border}`,
        padding: `${space.xl}px ${space.xxl}px`,
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: space.md,
      }}>
        <span style={{ fontSize: 12, color: color.textDim }}>
          © 2026 Ambient Labs — MIT License
        </span>
        <a href="https://ambientlabs.io" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: color.accent, textDecoration: 'none' }}>
          ambientlabs.io
        </a>
      </footer>
    </div>
  )
}

export default App
