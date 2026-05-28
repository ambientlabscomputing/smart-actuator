/**
 * AppToolbar — jog controls, E-stop, and mode status badge.
 *
 * Props:
 *  machineId    – the machine to control (e.g. "j1")
 *  mode         – current MachineMode string from WS state
 *  joints       – list of joint names (derived from measured state)
 *  jointDegrees – current angle per joint name, in degrees
 *  onJog        – async handler: (jointName, deltaDeg) => void
 *  onEstop      – async handler: () => void
 *  onResume     – async handler: () => void
 */
import React, { useState } from 'react'

const JOG_STEP_DEG = 5

interface AppToolbarProps {
  mode: string
  connected: boolean
  angleRad: number
  joints: string[]
  jointDegrees: Record<string, number>
  onJog: (jointName: string, deltaDeg: number) => Promise<void>
  onEstop: () => Promise<void>
  onResume: () => Promise<void>
  onEdit?: () => void
  onPrograms?: () => void
  programsActive?: boolean
}

function modeColor(mode: string): string {
  switch (mode) {
    case 'idle':
    case 'manual':
      return '#22c55e' // green
    case 'estopped':
    case 'fault':
      return '#ef4444' // red
    case 'run':
      return '#3b82f6' // blue
    default:
      return '#6b7280' // gray / offline
  }
}

export function AppToolbar({
  mode,
  connected,
  angleRad,
  joints,
  jointDegrees,
  onJog,
  onEstop,
  onResume,
  onEdit,
  onPrograms,
  programsActive,
}: AppToolbarProps) {
  const [busy, setBusy] = useState(false)

  const isDisabled = mode === 'offline' || mode === 'estopped' || busy
  const isEstopped = mode === 'estopped'

  async function handleJog(jointName: string, delta: number) {
    if (isDisabled) return
    setBusy(true)
    try {
      await onJog(jointName, delta)
    } finally {
      setBusy(false)
    }
  }

  async function handleEstop() {
    if (isEstopped || busy) return
    setBusy(true)
    try {
      await onEstop()
    } finally {
      setBusy(false)
    }
  }

  async function handleResume() {
    if (!isEstopped || busy) return
    setBusy(true)
    try {
      await onResume()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 16px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        userSelect: 'none',
      }}
    >
      {/* Top row: mode badge + estop + resume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Mode pill */}
        <span
          style={{
            background: modeColor(mode),
            color: '#fff',
            borderRadius: 9999,
            padding: '2px 10px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            minWidth: 70,
            textAlign: 'center',
          }}
        >
          {mode || 'offline'}
        </span>

        {/* Big red E-Stop */}
        <button
          onClick={handleEstop}
          disabled={isEstopped || busy}
          style={{
            background: isEstopped ? '#7f1d1d' : '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 20px',
            fontWeight: 700,
            fontSize: 14,
            cursor: isEstopped ? 'not-allowed' : 'pointer',
            opacity: isEstopped ? 0.6 : 1,
            letterSpacing: '0.05em',
          }}
          title="Emergency Stop (Space)"
        >
          E-STOP
        </button>

        {/* Resume — only shown when ESTOPPED */}
        {isEstopped && (
          <button
            onClick={handleResume}
            disabled={busy}
            style={{
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Resume
          </button>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Edit machine button */}
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: 6,
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 12px',
            }}
          >
            Edit machine
          </button>
        )}

        {/* Programs toggle */}
        {onPrograms && (
          <button
            onClick={onPrograms}
            style={{
              background: programsActive ? '#1d4ed8' : 'transparent',
              border: `1px solid ${programsActive ? '#3b82f6' : '#4b5563'}`,
              borderRadius: 6,
              color: programsActive ? '#fff' : '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 12px',
            }}
          >
            Programs
          </button>
        )}

        {/* Connection status + angle readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? '#22c55e' : '#6b7280',
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' }}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Jog buttons per joint */}
      {joints.map((joint) => {
        const deg = (jointDegrees[joint] ?? 0).toFixed(1)
        return (
          <div key={joint} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: 12, width: 120, flexShrink: 0 }}>
              {joint}
            </span>
            <span style={{ color: '#e5e7eb', fontSize: 12, width: 60, textAlign: 'right' }}>
              {deg}°
            </span>
            <button
              onClick={() => handleJog(joint, -JOG_STEP_DEG)}
              disabled={isDisabled}
              style={jogBtnStyle(isDisabled)}
            >
              −{JOG_STEP_DEG}°
            </button>
            <button
              onClick={() => handleJog(joint, JOG_STEP_DEG)}
              disabled={isDisabled}
              style={jogBtnStyle(isDisabled)}
            >
              +{JOG_STEP_DEG}°
            </button>
          </div>
        )
      })}
    </div>
  )
}

function jogBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#374151' : '#2563eb',
    color: disabled ? '#6b7280' : '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
