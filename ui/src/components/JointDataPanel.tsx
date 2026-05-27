/**
 * JointDataPanel — floating telemetry panel for a selected actuator.
 *
 * Shows live angle, velocity, current, and temperature plus SVG sparklines
 * buffered from the WebSocket stream. No external charting dependency.
 */
import type { JointState } from '../hooks/useJointState'

// ── Sparkline ─────────────────────────────────────────────────────────────────

interface SparklineProps {
  values: number[]
  color: string
  width?: number
  height?: number
}

function Sparkline({ values, color, width = 220, height = 36 }: SparklineProps) {
  if (values.length < 2) {
    return <div style={{ width, height, background: '#111' }} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1e-9
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block', background: '#111', borderRadius: 4 }}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" points={pts} />
    </svg>
  )
}

// ── MetricRow ─────────────────────────────────────────────────────────────────

interface MetricRowProps {
  label: string
  value: string
  history: number[]
  color: string
}

function MetricRow({ label, value, history, color }: MetricRowProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ color, fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>
          {value}
        </span>
      </div>
      <Sparkline values={history} color={color} />
    </div>
  )
}

// ── JointDataPanel ────────────────────────────────────────────────────────────

export interface JointHistory {
  angle_rad: number[]
  velocity_rad_s: number[]
  current_a: number[]
  temperature_c: number[]
}

interface JointDataPanelProps {
  joint: JointState | null
  history: JointHistory | null
  onClose: () => void
}

export function JointDataPanel({ joint, history, onClose }: JointDataPanelProps) {
  if (!joint) return null

  const angleDeg = ((joint.angle_rad * 180) / Math.PI).toFixed(1)
  const angleRad = joint.angle_rad.toFixed(3)
  const velocity = joint.velocity_rad_s.toFixed(3)
  const current = joint.current_a.toFixed(3)
  const temp = joint.temperature_c.toFixed(1)

  const hasFault = !!joint.fault

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 268,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 10,
        padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 100,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: hasFault ? '#ef4444' : '#22c55e',
            marginRight: 8,
            flexShrink: 0,
          }}
        />
        <span style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, flex: 1 }}>
          {joint.joint_name}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {hasFault && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            fontSize: 11,
            borderRadius: 4,
            padding: '4px 8px',
            marginBottom: 12,
          }}
        >
          FAULT: {joint.fault}
        </div>
      )}

      {/* Angle */}
      <MetricRow
        label="Angle"
        value={`${angleDeg}°  (${angleRad} rad)`}
        history={history?.angle_rad ?? []}
        color="#4fc3f7"
      />

      {/* Velocity */}
      <MetricRow
        label="Velocity"
        value={`${velocity} rad/s`}
        history={history?.velocity_rad_s ?? []}
        color="#a78bfa"
      />

      {/* Current */}
      <MetricRow
        label="Current"
        value={`${current} A`}
        history={history?.current_a ?? []}
        color="#fb923c"
      />

      {/* Temperature */}
      <MetricRow
        label="Temperature"
        value={`${temp} °C`}
        history={history?.temperature_c ?? []}
        color="#f87171"
      />

      <div style={{ color: '#4b5563', fontSize: 10, textAlign: 'right', marginTop: 4 }}>
        click ball to deselect
      </div>
    </div>
  )
}
