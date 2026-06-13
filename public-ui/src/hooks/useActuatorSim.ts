/**
 * useActuatorSim
 *
 * React hook that owns the actuator Web Worker lifecycle, maintains a
 * 300-frame ring buffer of telemetry history, and exposes a stable command
 * API to components.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActuatorState, WorkerMessage, WorkerCommand, ActuatorConfig, FaultKindId, ControlModeId } from '../lib/types'

const RING_DEPTH = 300

export interface TelemetryHistory {
  position: number[]
  velocity: number[]
  current: number[]
  temperature: number[]
}

export interface ActuatorSimApi {
  /** Latest telemetry snapshot from the worker. null until READY. */
  state: ActuatorState | null
  /** Whether the worker has initialized the WASM module. */
  ready: boolean
  /** Ring-buffer history (last RING_DEPTH samples). */
  history: TelemetryHistory

  // ── Motion commands ────────────────────────────────────────────────────────
  setPosition: (angle: number) => void
  setVelocity: (velocity: number) => void
  setTorque: (torque: number) => void
  setControlMode: (mode: ControlModeId) => void
  setSoftLimits: (min: number, max: number) => void
  setCurrentLimit: (maxCurrent: number) => void
  setTemperatureLimit: (maxTemp: number) => void
  clearFault: () => void

  // ── Gains ──────────────────────────────────────────────────────────────────
  updateGains: (kpPos: number, kdPos: number, kpVel: number) => void

  // ── Backdoor ───────────────────────────────────────────────────────────────
  applyExternalTorque: (torqueNm: number, durationMs: number) => void
  setAmbientTemperature: (tempC: number) => void
  injectFault: (kind: FaultKindId) => void
  resetPlant: () => void

  // ── Trajectory ─────────────────────────────────────────────────────────────
  executeTrajectory: (timesS: number[], positions: number[], velocities: number[], torquesFF: number[]) => void
  pauseTrajectory: () => void
  resumeTrajectory: () => void
  abortTrajectory: () => void
}

export function useActuatorSim(config?: Partial<ActuatorConfig>): ActuatorSimApi {
  const workerRef = useRef<Worker | null>(null)
  const [state, setState] = useState<ActuatorState | null>(null)
  const [ready, setReady] = useState(false)
  const historyRef = useRef<TelemetryHistory>({ position: [], velocity: [], current: [], temperature: [] })

  // Stable ref to history so callbacks don't stale-close over it
  const history = historyRef.current

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/actuator.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data
      switch (msg.type) {
        case 'READY':
          setReady(true)
          worker.postMessage({ type: 'START_LOOP' } satisfies WorkerCommand)
          break
        case 'STATE': {
          setState(msg.state)
          // Append to ring buffers
          const h = historyRef.current
          push(h.position,    msg.state.position,    RING_DEPTH)
          push(h.velocity,    msg.state.velocity,    RING_DEPTH)
          push(h.current,     msg.state.current,     RING_DEPTH)
          push(h.temperature, msg.state.temperature, RING_DEPTH)
          break
        }
        case 'ERROR':
          console.error('[ActuatorSim] Worker error:', msg.message)
          break
      }
    })

    worker.postMessage({ type: 'INIT', config } satisfies WorkerCommand)

    return () => {
      worker.postMessage({ type: 'STOP_LOOP' } satisfies WorkerCommand)
      worker.terminate()
      workerRef.current = null
      setReady(false)
    }
  }, []) // only on mount — config changes handled via UPDATE_GAINS

  const send = useCallback((cmd: WorkerCommand) => {
    workerRef.current?.postMessage(cmd)
  }, [])

  return {
    state,
    ready,
    history,
    setPosition:          (angle)         => send({ type: 'SET_POSITION', angle }),
    setVelocity:          (velocity)      => send({ type: 'SET_VELOCITY', velocity }),
    setTorque:            (torque)        => send({ type: 'SET_TORQUE', torque }),
    setControlMode:       (mode)          => send({ type: 'SET_CONTROL_MODE', mode }),
    setSoftLimits:        (min, max)      => send({ type: 'SET_SOFT_LIMITS', min, max }),
    setCurrentLimit:      (maxCurrent)    => send({ type: 'SET_CURRENT_LIMIT', maxCurrent }),
    setTemperatureLimit:  (maxTemp)       => send({ type: 'SET_TEMPERATURE_LIMIT', maxTemp }),
    clearFault:           ()              => send({ type: 'CLEAR_FAULT' }),
    updateGains:          (kp, kd, kpv)  => send({ type: 'UPDATE_GAINS', kpPos: kp, kdPos: kd, kpVel: kpv }),
    applyExternalTorque:  (nm, ms)       => send({ type: 'APPLY_EXTERNAL_TORQUE', torqueNm: nm, durationMs: ms }),
    setAmbientTemperature:(t)            => send({ type: 'SET_AMBIENT_TEMPERATURE', tempC: t }),
    injectFault:          (k)            => send({ type: 'INJECT_FAULT', kind: k }),
    resetPlant:           ()             => send({ type: 'SET_PLANT_STATE', position: 0, velocity: 0, current: 0, temperature: 25 }),
    executeTrajectory:    (t, p, v, ff)  => send({ type: 'EXECUTE_TRAJECTORY', timesS: t, positions: p, velocities: v, torquesFF: ff }),
    pauseTrajectory:      ()             => send({ type: 'PAUSE_TRAJECTORY' }),
    resumeTrajectory:     ()             => send({ type: 'RESUME_TRAJECTORY' }),
    abortTrajectory:      ()             => send({ type: 'ABORT_TRAJECTORY' }),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function push(arr: number[], value: number, maxLen: number) {
  arr.push(value)
  if (arr.length > maxLen) arr.shift()
}
