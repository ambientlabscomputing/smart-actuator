/**
 * JointDataPanel — floating telemetry panel for a selected actuator.
 *
 * Shows live angle, velocity, current, and temperature plus SVG sparklines
 * buffered from the WebSocket stream. No external charting dependency.
 */
import { useState } from 'react'
import type { JointState } from '../hooks/useJointState'
import { InteractiveJob } from './calibration/InteractiveJob'
import { getToken } from '../lib/authClient'

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
  position: number[]
  velocity: number[]
  current_a: number[]
  temperature_c: number[]
}

interface JointDataPanelProps {
  joint: JointState | null
  history: JointHistory | null
  machineId: string
  jointIndex: number | null
  onClose: () => void
}

export function JointDataPanel({ joint, history, machineId, jointIndex, onClose }: JointDataPanelProps) {
  const [calJobId, setCalJobId] = useState<string | null>(null)
  const [calBusy, setCalBusy] = useState(false)

  async function startCalibration() {
    if (jointIndex === null) return
    setCalBusy(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/machines/${encodeURIComponent(machineId)}/calibrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ joint_index: jointIndex }),
      })
      if (res.ok) {
        const job = (await res.json()) as { job_id: string }
        setCalJobId(job.job_id)
      }
    } finally {
      setCalBusy(false)
    }
  }

  if (!joint) return null

  const isPrismatic = joint.type === 'prismatic'
  const positionLabel = isPrismatic ? 'Position' : 'Angle'
  const positionValue = isPrismatic
    ? `${(joint.position * 1000).toFixed(1)} mm`
    : `${((joint.position * 180) / Math.PI).toFixed(1)}°  (${joint.position.toFixed(3)} rad)`
  const velocityValue = isPrismatic
    ? `${(joint.velocity * 1000).toFixed(2)} mm/s`
    : `${joint.velocity.toFixed(3)} rad/s`
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

      {/* Position / Angle */}
      <MetricRow
        label={positionLabel}
        value={positionValue}
        history={history?.position ?? []}
        color="#4fc3f7"
      />

      {/* Velocity */}
      <MetricRow
        label="Velocity"
        value={velocityValue}
        history={history?.velocity ?? []}
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

      {/* Calibrate action */}
      {!calJobId && (
        <button
          onClick={() => void startCalibration()}
          disabled={calBusy || jointIndex === null}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '7px 0',
            background: '#1e3a5f',
            color: '#93c5fd',
            border: '1px solid #1d4ed8',
            borderRadius: 6,
            cursor: calBusy ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: calBusy ? 0.7 : 1,
          }}
        >
          {calBusy ? 'Starting…' : 'Calibrate'}
        </button>
      )}

      <InteractiveJob
        jobId={calJobId}
        onClose={() => setCalJobId(null)}
      />
    </div>
  )
}
