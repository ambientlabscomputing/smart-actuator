// Shared message types between the main thread and the actuator Web Worker.

// ── Main → Worker ─────────────────────────────────────────────────────────────

export type WorkerCommand =
  | { type: 'INIT'; config?: Partial<ActuatorConfig> }
  | { type: 'SET_POSITION'; angle: number }
  | { type: 'SET_VELOCITY'; velocity: number }
  | { type: 'SET_TORQUE'; torque: number }
  | { type: 'SET_CONTROL_MODE'; mode: ControlModeId }
  | { type: 'SET_SOFT_LIMITS'; min: number; max: number }
  | { type: 'SET_CURRENT_LIMIT'; maxCurrent: number }
  | { type: 'SET_TEMPERATURE_LIMIT'; maxTemp: number }
  | { type: 'CLEAR_FAULT' }
  | { type: 'UPDATE_GAINS'; kpPos: number; kdPos: number; kpVel: number }
  | { type: 'APPLY_EXTERNAL_TORQUE'; torqueNm: number; durationMs: number }
  | { type: 'SET_AMBIENT_TEMPERATURE'; tempC: number }
  | { type: 'INJECT_FAULT'; kind: FaultKindId }
  | { type: 'SET_PLANT_STATE'; position: number; velocity: number; current?: number; temperature?: number }
  | { type: 'EXECUTE_TRAJECTORY'; timesS: number[]; positions: number[]; velocities: number[]; torquesFF: number[] }
  | { type: 'PAUSE_TRAJECTORY' }
  | { type: 'RESUME_TRAJECTORY' }
  | { type: 'ABORT_TRAJECTORY' }
  | { type: 'START_LOOP' }
  | { type: 'STOP_LOOP' }

// ── Worker → Main ─────────────────────────────────────────────────────────────

export type WorkerMessage =
  | { type: 'READY' }
  | { type: 'STATE'; state: ActuatorState }
  | { type: 'COMMAND_RESULT'; command: string; success: boolean; message?: string }
  | { type: 'ERROR'; message: string }

// ── Domain types (mirrored from Rust) ─────────────────────────────────────────

export interface ActuatorState {
  position: number    // rad
  velocity: number    // rad/s
  current: number     // A
  temperature: number // °C
  sim_time_s: number
  mode: ControlModeName
  fault: string       // empty string = no fault
}

export type ControlModeName = 'position' | 'velocity' | 'torque' | 'impedance'
export type ControlModeId = 0 | 1 | 2 | 3
export type FaultKindId = 0 | 1 | 2 // 0=OverTemperature 1=OverCurrent 2=EncoderStuck

export interface ActuatorConfig {
  inertia: number
  damping: number
  kpPos: number
  kdPos: number
  kpVel: number
  kt: number
  thermalResistance: number
  thermalCapacitance: number
}

export const DEFAULT_CONFIG: ActuatorConfig = {
  inertia: 0.01,
  damping: 0.1,
  kpPos: 10.0,
  kdPos: 2.0,
  kpVel: 1.0,
  kt: 2.0,
  thermalResistance: 5.0,
  thermalCapacitance: 10.0,
}

// Canned trajectories for the demo
export interface CannedTrajectory {
  name: string
  timesS: number[]
  positions: number[]
  velocities: number[]
  torquesFF: number[]
}

export const CANNED_TRAJECTORIES: CannedTrajectory[] = [
  {
    name: 'Sine sweep (±1 rad)',
    timesS:    [0,    0.5,  1.0,  1.5,  2.0,  2.5,  3.0,  3.5,  4.0],
    positions: [0,    1.0,  0,   -1.0,   0,    1.0,  0,   -1.0,   0],
    velocities:[0,    0,    0,    0,     0,    0,    0,    0,     0],
    torquesFF: [0,    0,    0,    0,     0,    0,    0,    0,     0],
  },
  {
    name: 'Step response (0 → π/2)',
    timesS:    [0,    0.01, 4.0],
    positions: [0,    1.5708, 1.5708],
    velocities:[0,    0,    0],
    torquesFF: [0,    0,    0],
  },
  {
    name: 'Back and forth (±2 rad)',
    timesS:    [0,    1.0,  2.0,  3.0,  4.0],
    positions: [0,    2.0,  0,   -2.0,   0],
    velocities:[0,    0,    0,    0,     0],
    torquesFF: [0,    0,    0,    0,     0],
  },
]
