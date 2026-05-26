/**
 * useJointState — subscribes to the Brain's state WebSocket and returns the
 * latest joint angles together with the current connection status.
 */
import { useEffect, useRef, useState } from 'react'

export interface JointState {
  joint_name: string
  angle_rad: number
  velocity_rad_s: number
  current_a: number
  fault: string | null
}

export interface MachineState {
  machine_id: string
  measured: JointState[]
  modeled: unknown[]
  timestamp: string
}

interface UseJointStateResult {
  state: MachineState | null
  connected: boolean
}

const WS_URL = '/api/v1/state/ws?machine_id=j1'
const RECONNECT_DELAY_MS = 2000

export function useJointState(): UseJointStateResult {
  const [state, setState] = useState<MachineState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    unmounted.current = false

    function connect() {
      if (unmounted.current) return

      const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
      const url = token ? `${WS_URL}&token=${encodeURIComponent(token)}` : WS_URL
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!unmounted.current) setConnected(true)
      }

      ws.onmessage = (event: MessageEvent) => {
        if (unmounted.current) return
        try {
          const parsed = JSON.parse(event.data as string) as MachineState
          setState(parsed)
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (unmounted.current) return
        setConnected(false)
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS)
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
  }, [])

  return { state, connected }
}
