/**
 * useJointState — subscribes to the Brain's state WebSocket and returns the
 * latest joint angles together with the current connection status.
 */
import { useEffect, useRef, useState } from 'react'
import { clearToken, getToken } from '@/lib/authClient'

export interface JointState {
  joint_name: string
  angle_rad: number
  velocity_rad_s: number
  current_a: number
  temperature_c: number
  fault: string | null
}

export interface MachineState {
  machine_id: string
  mode: string
  measured: JointState[]
  modeled: unknown[]
  timestamp: string
}

interface UseJointStateResult {
  state: MachineState | null
  connected: boolean
}

const WS_RECONNECT_MIN_MS = 1_000
const WS_RECONNECT_MAX_MS = 30_000

export function useJointState(machineId: string): UseJointStateResult {
  const [state, setState] = useState<MachineState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)
  const reconnectDelay = useRef(WS_RECONNECT_MIN_MS)

  useEffect(() => {
    unmounted.current = false
    reconnectDelay.current = WS_RECONNECT_MIN_MS

    function connect() {
      if (unmounted.current) return

      const token = getToken()
      const base = `/api/v1/state/ws?machine_id=${encodeURIComponent(machineId)}`
      const url = token ? `${base}&token=${encodeURIComponent(token)}` : base
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!unmounted.current) {
          setConnected(true)
          reconnectDelay.current = WS_RECONNECT_MIN_MS  // reset backoff on success
        }
      }

      ws.onmessage = (event: MessageEvent) => {
        if (unmounted.current) return
        try {
          const parsed = JSON.parse(event.data as string) as MachineState
          // Dev-only diagnostic: log every WS frame's joint angles so we can
          // see exactly what the brain is publishing. Helps diagnose ghost
          // motion / snap-back issues that look like UI bugs but originate
          // server-side.
          if (import.meta.env.DEV) {
            const angles = parsed.measured
              .map((j) => `${j.joint_name}=${((j.angle_rad * 180) / Math.PI).toFixed(2)}°`)
              .join('  ')
            // eslint-disable-next-line no-console
            console.debug(`[ws ${parsed.mode}]`, angles)
          }
          setState(parsed)
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (unmounted.current) return
        setConnected(false)
        const delay = reconnectDelay.current
        reconnectDelay.current = Math.min(delay * 2, WS_RECONNECT_MAX_MS)
        reconnectTimer.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      unmounted.current = true
      if (reconnectTimer.current !== null) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [machineId])

  return { state, connected }
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

const BRAIN_BASE = '/api/v1'

function journeyId(): string {
  return crypto.randomUUID()
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Journey-Id': journeyId(),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function handleResponse(res: Response, detail: unknown): never {
  if (res.status === 401) clearToken()
  throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status, detail })
}

export async function brainPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BRAIN_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) handleResponse(res, await res.json().catch(() => ({})))
  return res.json()
}

export async function brainPatch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BRAIN_BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) handleResponse(res, await res.json().catch(() => ({})))
  return res.json()
}

export async function brainGet(path: string): Promise<unknown> {
  const res = await fetch(`${BRAIN_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) handleResponse(res, await res.json().catch(() => ({})))
  return res.json()
}

// ---------------------------------------------------------------------------
// useMachineControl — REST actions: jog, estop, resume
// ---------------------------------------------------------------------------

export interface MachineControl {
  /** Jog a single joint by deltaDeg degrees (positive = extend). */
  jog: (machineId: string, jointName: string, deltaDeg: number, currentDeg: number) => Promise<void>
  estop: (machineId: string) => Promise<void>
  resume: (machineId: string) => Promise<void>
}

export function useMachineControl(): MachineControl {
  const jog = async (
    machineId: string,
    jointName: string,
    deltaDeg: number,
    currentDeg: number,
  ) => {
    const targetRad = ((currentDeg + deltaDeg) * Math.PI) / 180
    await brainPost('/move/joint', {
      machine_id: machineId,
      joint_targets: { [jointName]: targetRad },
    })
  }

  const estop = async (machineId: string) => {
    await brainPost(`/move/estop?machine_id=${encodeURIComponent(machineId)}`, {})
  }

  const resume = async (machineId: string) => {
    await brainPost(`/mode?machine_id=${encodeURIComponent(machineId)}`, { mode: 'idle' })
  }

  return { jog, estop, resume }
}
