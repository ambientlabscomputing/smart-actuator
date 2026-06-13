/**
 * ActuatorDemo
 *
 * Composes the skeuomorphic motor, telemetry panel, and control panel into
 * the interactive demo section of the public site.
 */

import React, { useState, useCallback } from 'react'
import { useActuatorSim } from '../hooks/useActuatorSim'
import { SkeuomorphicMotor } from './SkeuomorphicMotor'
import { TelemetryPanel } from './TelemetryPanel'
import { ControlPanel } from './ControlPanel'
import { color, space, radius, font } from '../design/tokens'

export function ActuatorDemo() {
  const api = useActuatorSim()
  const [targetPosition, setTargetPosition] = useState(0)

  const handleJog = useCallback((angle: number) => {
    setTargetPosition(angle)
    api.setPosition(angle)
  }, [api])

  const { state, ready, history } = api

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.xxl,
    padding: `${space.xxl}px ${space.lg}px`,
    width: '100%',
    maxWidth: 1100,
    margin: '0 auto',
  }

  const demoRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.xxl,
    width: '100%',
  }

  const motorColStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.lg,
  }

  const simTimeBadge: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.textDim,
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 999,
    padding: `2px 10px`,
  }

  return (
    <div style={containerStyle}>
      {/* Section header */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontFamily: font.sans,
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 700,
          color: color.textPrimary,
          margin: 0,
          marginBottom: space.sm,
        }}>
          Live Actuator Demo
        </h2>
        <p style={{
          fontFamily: font.sans,
          fontSize: 15,
          color: color.textSecondary,
          margin: 0,
          maxWidth: 680,
        }}>
          You are not looking at a video or animation. You are running an
          actuator. The same Rust control stack that drives the physical
          hardware is compiled to WebAssembly and executing in your browser at
          1 kHz. Drag the motor to jog, tune gains, inject disturbances, run
          trajectories.
        </p>
      </div>

      {/* Demo layout */}
      <div style={demoRowStyle}>
        {/* Motor + telemetry column */}
        <div style={motorColStyle}>
          <SkeuomorphicMotor
            position={state?.position ?? 0}
            targetPosition={targetPosition}
            current={state?.current ?? 0}
            temperature={state?.temperature ?? 25}
            faulted={!!state?.fault}
            ready={ready}
            onJog={handleJog}
          />

          {/* Sim time */}
          <span style={simTimeBadge}>
            sim {(state?.sim_time_s ?? 0).toFixed(2)} s
          </span>

          {/* Mode badge */}
          <span style={{
            ...simTimeBadge,
            color: color.accent,
            borderColor: color.accent,
            background: color.accentDim,
          }}>
            {state?.mode ?? 'position'}
          </span>

          <TelemetryPanel state={state} history={history} />
        </div>

        {/* Control panel column */}
        <ControlPanel
          api={api}
          targetPosition={targetPosition}
          onTargetChange={setTargetPosition}
        />
      </div>

      {/* Explainer */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: space.lg,
        justifyContent: 'center',
        maxWidth: 800,
      }}>
        {[
          { label: 'Real physics', desc: 'Euler-integration plant model: J·θ̈ = τ − b·θ̇ + τ_ext. Runs in your browser.' },
          { label: 'Thermal model', desc: 'First-order RC thermal circuit. Watch the temperature rise under heavy load.' },
          { label: 'Fault safety', desc: 'Over-temp latches motion — same logic as the real firmware. Clear to recover.' },
        ].map(({ label, desc }) => (
          <div key={label} style={{
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            padding: `${space.md}px ${space.lg}px`,
            flex: '1 1 200px',
          }}>
            <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: color.accent, marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontFamily: font.sans, fontSize: 12, color: color.textSecondary, lineHeight: 1.5 }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
