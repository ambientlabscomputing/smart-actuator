/**
 * ControlPanel
 *
 * Full demo control surface:
 *  - Mode selector (Position / Velocity / Torque)
 *  - Target slider + numeric input
 *  - Kp/Kd gain sliders
 *  - Disturbance kick button + fault injection
 *  - Trajectory playback (canned segments)
 */

import React, { useState, useCallback } from 'react'
import { CANNED_TRAJECTORIES, type ControlModeId, type FaultKindId } from '../lib/types'
import type { ActuatorSimApi } from '../hooks/useActuatorSim'
import { color, font, radius, space } from '../design/tokens'

interface Props {
  api: ActuatorSimApi
  targetPosition: number
  onTargetChange: (rad: number) => void
}

const MODE_LABELS: { id: ControlModeId; label: string }[] = [
  { id: 0, label: 'Position' },
  { id: 1, label: 'Velocity' },
  { id: 2, label: 'Torque' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: space.lg }}>
      <div style={{
        fontFamily: font.sans,
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: color.textDim,
        marginBottom: space.sm,
        paddingBottom: 4,
        borderBottom: `1px solid ${color.border}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Slider({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: space.sm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: font.sans, fontSize: 11, color: color.textSecondary }}>{label}</span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textPrimary }}>
          {value.toFixed(2)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color.accent, cursor: 'pointer' }}
      />
    </div>
  )
}

function Btn({
  label, onClick, variant = 'default', disabled = false,
}: {
  label: string; onClick: () => void; variant?: 'default' | 'danger' | 'accent' | 'warn'; disabled?: boolean
}) {
  const bg = {
    default: color.surface,
    danger: 'rgba(239,68,68,0.15)',
    accent: 'rgba(170,59,255,0.15)',
    warn: 'rgba(245,158,11,0.15)',
  }[variant]
  const border = {
    default: color.border,
    danger: color.danger,
    accent: color.accent,
    warn: color.warn,
  }[variant]
  const textCol = {
    default: color.textSecondary,
    danger: color.danger,
    accent: color.accent,
    warn: color.warn,
  }[variant]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: radius.sm,
        color: textCol,
        fontFamily: font.sans,
        fontSize: 12,
        padding: `${space.xs}px ${space.sm}px`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  )
}

export function ControlPanel({ api, targetPosition, onTargetChange }: Props) {
  const [mode, setMode] = useState<ControlModeId>(0)
  const [kpPos, setKpPos] = useState(10.0)
  const [kdPos, setKdPos] = useState(2.0)
  const [kpVel, setKpVel] = useState(1.0)
  const [selectedTraj, setSelectedTraj] = useState(0)
  const [velocityTarget, setVelocityTarget] = useState(0)
  const [torqueTarget, setTorqueTarget] = useState(0)

  const { state, ready } = api

  const handleModeChange = useCallback((m: ControlModeId) => {
    setMode(m)
    api.setControlMode(m)
    // Immediately command a known setpoint in the new mode so switching
    // modes does not continue an old command until the user touches a slider.
    if (m === 0) {
      api.setPosition(targetPosition)
    } else if (m === 1) {
      setVelocityTarget(0)
      api.setVelocity(0)
    } else {
      setTorqueTarget(0)
      api.setTorque(0)
    }
  }, [api, targetPosition])

  const handleGainsChange = useCallback((kp: number, kd: number, kv: number) => {
    api.updateGains(kp, kd, kv)
  }, [api])

  const handlePositionChange = useCallback((v: number) => {
    onTargetChange(v)
    api.setPosition(v)
  }, [api, onTargetChange])

  const faulted = !!state?.fault

  const panelStyle: React.CSSProperties = {
    background: 'rgba(17,16,24,0.95)',
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: `${space.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    width: 260,
  }

  return (
    <div style={panelStyle}>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.lg }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: faulted ? color.danger : ready ? color.ok : color.textDim,
          boxShadow: faulted ? `0 0 6px ${color.danger}` : ready ? `0 0 6px ${color.ok}` : 'none',
        }} />
        <span style={{ fontFamily: font.sans, fontSize: 11, color: faulted ? color.danger : color.textSecondary }}>
          {faulted ? `FAULT: ${state?.fault}` : ready ? 'LIVE' : 'INITIALIZING'}
        </span>
      </div>

      {/* Control mode */}
      <Section title="Control Mode">
        <div style={{ display: 'flex', gap: space.xs }}>
          {MODE_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleModeChange(id)}
              disabled={!ready}
              style={{
                flex: 1,
                background: mode === id ? color.accentDim : color.surface,
                border: `1px solid ${mode === id ? color.accent : color.border}`,
                borderRadius: radius.sm,
                color: mode === id ? color.accent : color.textSecondary,
                fontFamily: font.sans,
                fontSize: 11,
                padding: `${space.xs}px 0`,
                cursor: ready ? 'pointer' : 'default',
                opacity: ready ? 1 : 0.4,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Setpoint */}
      <Section title="Setpoint">
        {mode === 0 && (
          <Slider
            label="Target angle" value={targetPosition}
            min={-6.28} max={6.28} step={0.01} unit="rad"
            onChange={handlePositionChange}
          />
        )}
        {mode === 1 && (
          <Slider
            label="Target velocity" value={velocityTarget}
            min={-20} max={20} step={0.1} unit="r/s"
            onChange={(v) => { setVelocityTarget(v); api.setVelocity(v) }}
          />
        )}
        {mode === 2 && (
          <Slider
            label="Target torque" value={torqueTarget}
            min={-5} max={5} step={0.05} unit="N·m"
            onChange={(v) => { setTorqueTarget(v); api.setTorque(v) }}
          />
        )}
      </Section>

      {/* Gains */}
      <Section title="PD Gains">
        <Slider label="Kp (pos)" value={kpPos} min={0} max={50} step={0.5} unit=""
          onChange={(v) => { setKpPos(v); handleGainsChange(v, kdPos, kpVel) }} />
        <Slider label="Kd (pos)" value={kdPos} min={0} max={20} step={0.1} unit=""
          onChange={(v) => { setKdPos(v); handleGainsChange(kpPos, v, kpVel) }} />
        <Slider label="Kp (vel)" value={kpVel} min={0} max={10} step={0.1} unit=""
          onChange={(v) => { setKpVel(v); handleGainsChange(kpPos, kdPos, v) }} />
      </Section>

      {/* Trajectory */}
      <Section title="Trajectory Playback">
        <select
          value={selectedTraj}
          onChange={(e) => setSelectedTraj(parseInt(e.target.value))}
          disabled={!ready}
          style={{
            width: '100%',
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            color: color.textPrimary,
            fontFamily: font.sans,
            fontSize: 12,
            padding: `${space.xs}px ${space.sm}px`,
            marginBottom: space.sm,
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          {CANNED_TRAJECTORIES.map((t, i) => (
            <option key={i} value={i}>{t.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: space.xs }}>
          <Btn label="Run" variant="accent" disabled={!ready} onClick={() => {
            const t = CANNED_TRAJECTORIES[selectedTraj]
            api.executeTrajectory(t.timesS, t.positions, t.velocities, t.torquesFF)
          }} />
          <Btn label="Pause" disabled={!ready} onClick={api.pauseTrajectory} />
          <Btn label="Abort" variant="danger" disabled={!ready} onClick={api.abortTrajectory} />
        </div>
      </Section>

      {/* Disturbance & faults */}
      <Section title="Disturbance / Faults">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
          <Btn label="Kick (1 N·m)" variant="warn" disabled={!ready}
            onClick={() => api.applyExternalTorque(1.0, 200)} />
          <Btn label="Big kick (5 N·m)" variant="warn" disabled={!ready}
            onClick={() => api.applyExternalTorque(5.0, 100)} />
          <Btn label="Over-temp" variant="danger" disabled={!ready}
            onClick={() => api.injectFault(0 as FaultKindId)} />
          <Btn label="Over-current" variant="danger" disabled={!ready}
            onClick={() => api.injectFault(1 as FaultKindId)} />
          {faulted && (
            <Btn label="Clear fault" variant="accent" onClick={api.clearFault} />
          )}
          <Btn label="Reset plant" disabled={!ready} onClick={api.resetPlant} />
        </div>
      </Section>
    </div>
  )
}
