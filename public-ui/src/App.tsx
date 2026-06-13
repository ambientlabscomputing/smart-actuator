import { useEffect, useState } from 'react'
import { ActuatorDemo } from './components/ActuatorDemo'
import { color, font, space } from './design/tokens'
import './index.css'

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const isGetStarted = path === '/get-started'
  const isDocs = path === '/docs'

  const go = (nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: color.bg,
      color: color.textPrimary,
      fontFamily: font.sans,
      display: 'flex',
      flexDirection: 'column',
    }}>
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
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            go('/')
          }}
          style={{
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '-0.01em',
            color: color.textPrimary,
            textDecoration: 'none',
          }}
        >
          jog actuator
        </a>
        <nav style={{ display: 'flex', gap: space.xl, alignItems: 'center' }}>
          <a
            href="/get-started"
            onClick={(e) => {
              e.preventDefault()
              go('/get-started')
            }}
            style={{
              fontSize: 13,
              color: isGetStarted ? color.accent : color.textSecondary,
              textDecoration: 'none',
            }}
          >
            Get Started
          </a>
          <a
            href="/docs"
            onClick={(e) => {
              e.preventDefault()
              go('/docs')
            }}
            style={{
              fontSize: 13,
              color: isDocs ? color.accent : color.textSecondary,
              textDecoration: 'none',
            }}
          >
            Docs
          </a>
          <a
            href="https://github.com/ambientlabscomputing/smart-actuator"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: color.textSecondary, textDecoration: 'none' }}
          >
            GitHub
          </a>
          <a
            href="https://ambientlabs.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: color.accent,
              textDecoration: 'none',
              border: `1px solid ${color.accent}`,
              borderRadius: 6,
              padding: '4px 12px',
              background: color.accentDim,
            }}
          >
            ambientlabs.io →
          </a>
        </nav>
      </header>

      {isGetStarted ? (
        <GetStartedPage />
      ) : isDocs ? (
        <DocsPage />
      ) : (
        <HomePage onNavigate={go} />
      )}

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
        <div style={{ display: 'flex', gap: space.lg, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="/get-started"
            onClick={(e) => {
              e.preventDefault()
              go('/get-started')
            }}
            style={{ fontSize: 12, color: color.textSecondary, textDecoration: 'none' }}
          >
            Get Started
          </a>
          <a
            href="/docs"
            onClick={(e) => {
              e.preventDefault()
              go('/docs')
            }}
            style={{ fontSize: 12, color: color.textSecondary, textDecoration: 'none' }}
          >
            Docs
          </a>
          <a
            href="https://ambientlabs.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: color.accent, textDecoration: 'none' }}
          >
            ambientlabs.io
          </a>
        </div>
      </footer>
    </div>
  )
}

function HomePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const cardStyle: React.CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 12,
    padding: `${space.lg}px ${space.xl}px`,
    flex: '1 1 220px',
    textAlign: 'left',
    maxWidth: 320,
  }

  return (
    <>
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
          Open source · MIT · Rust + WASM
        </div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 72px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: 0,
          maxWidth: 760,
          background: `linear-gradient(135deg, ${color.textPrimary} 40%, ${color.accent})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Build real motion systems with open actuator intelligence.
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2vw, 19px)',
          color: color.textSecondary,
          maxWidth: 650,
          margin: 0,
          lineHeight: 1.65,
        }}>
          jog actuator combines firmware, simulation, control services, and a
          browser-native actuator demo powered by the same Rust physics core.
        </p>
        <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', justifyContent: 'center', marginTop: space.sm }}>
          <a
            href="/get-started"
            onClick={(e) => {
              e.preventDefault()
              onNavigate('/get-started')
            }}
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
            Start Building →
          </a>
          <a
            href="https://ambientlabs.io"
            target="_blank"
            rel="noopener noreferrer"
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
            Work with Ambient Labs
          </a>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${color.border}`, background: 'rgba(17,16,24,0.4)' }}>
        <ActuatorDemo />
      </section>

      <section style={{
        borderTop: `1px solid ${color.border}`,
        padding: `${space.xxl}px ${space.xl}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.xl,
      }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 32px)' }}>Architecture at a glance</h2>
        <div style={{ display: 'flex', gap: space.lg, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <div style={cardStyle}>
            <div style={{ color: color.accent, fontSize: 12, marginBottom: space.sm }}>Firmware + Control</div>
            <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              Rust-based actuator core, safety gates, and trajectory execution designed for real hardware constraints.
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: color.accent, fontSize: 12, marginBottom: space.sm }}>Simulation + Brain</div>
            <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              Shared physics model across simulator and WebAssembly demo, with orchestration interfaces ready for larger systems.
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: color.accent, fontSize: 12, marginBottom: space.sm }}>Open Integration Surface</div>
            <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              Public docs and API references are being productized so teams can integrate quickly with confidence.
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function GetStartedPage() {
  const panel: React.CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 12,
    padding: `${space.lg}px ${space.xl}px`,
    textAlign: 'left',
    width: 'min(860px, 100%)',
    boxSizing: 'border-box',
  }

  const code: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 1.6,
    color: color.textPrimary,
    background: 'rgba(5,5,8,0.8)',
    border: `1px solid ${color.border}`,
    borderRadius: 8,
    padding: `${space.sm}px ${space.md}px`,
    whiteSpace: 'pre-wrap',
    marginTop: space.sm,
  }

  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: space.lg,
      padding: `${space.xxl}px ${space.lg}px ${space.xxl * 2}px`,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 54px)', letterSpacing: '-0.02em' }}>
          Get Started
        </h1>
        <p style={{ color: color.textSecondary, marginTop: space.md, lineHeight: 1.7 }}>
          Pick your path: run the browser demo only, launch the Docker container,
          or jump into firmware development on ESP32.
        </p>
      </div>

      <div style={panel}>
        <div style={{ color: color.accent, fontSize: 12, marginBottom: 4 }}>Path 1: Public demo only</div>
        <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          Fastest way to understand the actuator model behavior and control modes.
        </div>
        <div style={code}>open https://jogactuators.com</div>
      </div>

      <div style={panel}>
        <div style={{ color: color.accent, fontSize: 12, marginBottom: 4 }}>Path 2: Docker container (recommended)</div>
        <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          Pull and run the published image — no build step required.
        </div>
        <div style={code}>{`docker pull ghcr.io/ambientlabscomputing/smart-actuator:latest\ndocker run --rm -p 80:80 -p 50051:50051 ghcr.io/ambientlabscomputing/smart-actuator:latest`}</div>
      </div>

      <div style={panel}>
        <div style={{ color: color.accent, fontSize: 12, marginBottom: 4 }}>Path 3: Firmware on ESP32</div>
        <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          Use pinned toolchain/setup targets for repeatable board bring-up.
        </div>
        <div style={code}>{`cd smart-actuator/crates/actuator-firmware\nmake firmware-setup\nsource ~/export-esp.sh\nmake firmware-flash`}</div>
      </div>

      <div style={{ width: 'min(860px, 100%)', textAlign: 'left', color: color.textSecondary, fontSize: 14, lineHeight: 1.7 }}>
        Need implementation support for a custom machine or integration?
        <a
          href="https://ambientlabs.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: color.accent, textDecoration: 'none', marginLeft: 6 }}
        >
          Talk to Ambient Labs →
        </a>
      </div>
    </section>
  )
}

function DocsPage() {
  const panel: React.CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 12,
    padding: `${space.lg}px ${space.xl}px`,
    textAlign: 'left',
    width: 'min(860px, 100%)',
    boxSizing: 'border-box',
  }

  const links: Array<{ label: string; href: string; desc: string }> = [
    {
      label: 'Docs Index',
      href: '/docs/index.html',
      desc: 'Auto-generated on every release from project sources.',
    },
    {
      label: 'REST API Reference',
      href: '/docs/api/index.html',
      desc: 'All Brain HTTP endpoints, request/response schemas, and auth details — generated from FastAPI OpenAPI.',
    },
    {
      label: 'Rust Crate Docs',
      href: '/docs/rust/actuator_core/index.html',
      desc: 'actuator-core, actuator-plant, actuator-sim, actuator-proto, controller-sidecar — generated by rustdoc.',
    },
    {
      label: 'Architecture RFDs',
      href: 'https://github.com/ambientlabscomputing/smart-actuator/tree/main/RFDs',
      desc: 'Decision records and design rationale behind the system.',
    },
  ]

  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: space.lg,
      padding: `${space.xxl}px ${space.lg}px ${space.xxl * 2}px`,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 54px)', letterSpacing: '-0.02em' }}>
          Documentation
        </h1>
        <p style={{ color: color.textSecondary, marginTop: space.md, lineHeight: 1.7 }}>
          Generated on every release: FastAPI OpenAPI rendered in Redoc,
          Rust crate docs from rustdoc, and links to proto definitions and RFDs.
        </p>
      </div>

      {links.map((link) => (
        <div key={link.label} style={panel}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              color: color.accent,
              textDecoration: 'none',
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            {link.label} →
          </a>
          <div style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
            {link.desc}
          </div>
        </div>
      ))}
    </section>
  )
}

export default App
