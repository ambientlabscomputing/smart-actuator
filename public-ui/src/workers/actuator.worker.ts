/**
 * Actuator simulation Web Worker
 *
 * Runs the WASM sim via a requestAnimationFrame-based accumulator loop.
 * Physics is integrated in fixed 1 ms sub-steps per animation frame so the
 * true rate is limited only by frame delivery (~16 ms / frame → ~60 physics
 * batches per second, each doing ~16 sub-steps at 1 ms). Telemetry is posted
 * once per frame.
 *
 * Using static imports (top-level) is required so that vite-plugin-wasm can
 * transform the inner .wasm file import before the module is executed.
 * Dynamic `import('actuator-wasm')` bypasses the plugin and hangs silently.
 *
 * Message protocol: see src/lib/types.ts
 */

import type { WorkerCommand, WorkerMessage, ActuatorConfig } from '../lib/types'
// Static import — vite-plugin-wasm transforms the .wasm dependency here.
import initWasm, { WasmActuator } from 'actuator-wasm'

let actuator: WasmActuator | null = null
let running = false
let lastTimestamp: number | null = null

const PHYSICS_DT = 0.001   // 1 ms fixed physics step

function post(msg: WorkerMessage) {
  self.postMessage(msg)
}

async function init(config?: Partial<ActuatorConfig>) {
  try {
    // initWasm() fetches + compiles the .wasm binary (only needed once).
    await initWasm()

    const wasmConfig = config
      ? {
          inertia: config.inertia,
          damping: config.damping,
          kp_pos: config.kpPos,
          kd_pos: config.kdPos,
          kp_vel: config.kpVel,
          kt: config.kt,
          thermal_resistance: config.thermalResistance,
          thermal_capacitance: config.thermalCapacitance,
        }
      : null

    actuator = new WasmActuator(wasmConfig)
    post({ type: 'READY' })
  } catch (e) {
    console.error('[actuator-worker] init failed:', e)
    post({ type: 'ERROR', message: String(e) })
  }
}

// ── RAF accumulator loop ──────────────────────────────────────────────────────
// Workers don't have requestAnimationFrame; we use setTimeout(fn, 0) to
// mimic a frame loop. Each iteration drains accumulated real time in 1 ms
// sub-steps so physics doesn't drift under variable frame timing.

function scheduleFrame() {
  setTimeout(frame, 0)
}

function frame() {
  if (!running || !actuator) return

  const now = performance.now()
  if (lastTimestamp === null) lastTimestamp = now
  const elapsed = Math.min((now - lastTimestamp) / 1000, 0.1) // cap at 100 ms
  lastTimestamp = now

  // Physics sub-steps
  const steps = Math.floor(elapsed / PHYSICS_DT)
  for (let i = 0; i < steps; i++) {
    actuator.step(PHYSICS_DT)
  }

  // Post telemetry once per frame
  post({ type: 'STATE', state: actuator.read_state() })

  scheduleFrame()
}

function startLoop() {
  if (running) return
  running = true
  lastTimestamp = null
  scheduleFrame()
}

function stopLoop() {
  running = false
  lastTimestamp = null
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data
  if (!actuator && cmd.type !== 'INIT') return

  switch (cmd.type) {
    case 'INIT':
      await init(cmd.config)
      break

    case 'START_LOOP':
      startLoop()
      break

    case 'STOP_LOOP':
      stopLoop()
      break

    // ── Motion commands ─────────────────────────────────────────────────────

    case 'SET_POSITION': {
      const ok = actuator!.set_position(cmd.angle)
      post({ type: 'COMMAND_RESULT', command: 'SET_POSITION', success: ok })
      break
    }
    case 'SET_VELOCITY': {
      const ok = actuator!.set_velocity(cmd.velocity)
      post({ type: 'COMMAND_RESULT', command: 'SET_VELOCITY', success: ok })
      break
    }
    case 'SET_TORQUE': {
      const ok = actuator!.set_torque(cmd.torque)
      post({ type: 'COMMAND_RESULT', command: 'SET_TORQUE', success: ok })
      break
    }
    case 'SET_CONTROL_MODE': {
      const ok = actuator!.set_control_mode(cmd.mode)
      post({ type: 'COMMAND_RESULT', command: 'SET_CONTROL_MODE', success: ok })
      break
    }
    case 'SET_SOFT_LIMITS':
      actuator!.set_soft_limits(cmd.min, cmd.max)
      break
    case 'SET_CURRENT_LIMIT':
      actuator!.set_current_limit(cmd.maxCurrent)
      break
    case 'SET_TEMPERATURE_LIMIT':
      actuator!.set_temperature_limit(cmd.maxTemp)
      break
    case 'CLEAR_FAULT': {
      const ok = actuator!.clear_fault()
      post({ type: 'COMMAND_RESULT', command: 'CLEAR_FAULT', success: ok })
      break
    }

    // ── Gains ───────────────────────────────────────────────────────────────

    case 'UPDATE_GAINS':
      actuator!.update_gains(cmd.kpPos, cmd.kdPos, cmd.kpVel)
      break

    // ── Backdoor ────────────────────────────────────────────────────────────

    case 'APPLY_EXTERNAL_TORQUE':
      actuator!.apply_external_torque(cmd.torqueNm, cmd.durationMs)
      break
    case 'SET_AMBIENT_TEMPERATURE':
      actuator!.set_ambient_temperature(cmd.tempC)
      break
    case 'INJECT_FAULT':
      actuator!.inject_fault(cmd.kind)
      break
    case 'SET_PLANT_STATE':
      actuator!.set_plant_state(
        cmd.position, cmd.velocity,
        cmd.current ?? undefined,
        cmd.temperature ?? undefined,
      )
      break

    // ── Trajectory ──────────────────────────────────────────────────────────

    case 'EXECUTE_TRAJECTORY': {
      const ok = actuator!.execute_trajectory(
        new Float64Array(cmd.timesS),
        new Float64Array(cmd.positions),
        new Float64Array(cmd.velocities),
        new Float64Array(cmd.torquesFF),
      )
      post({ type: 'COMMAND_RESULT', command: 'EXECUTE_TRAJECTORY', success: ok })
      break
    }
    case 'PAUSE_TRAJECTORY':
      actuator!.pause_trajectory()
      break
    case 'RESUME_TRAJECTORY':
      actuator!.resume_trajectory()
      break
    case 'ABORT_TRAJECTORY':
      actuator!.abort_trajectory()
      break
  }
})

