/**
 * useProgramRun — manages a single program run's lifecycle.
 *
 * On mount: fetches the current run state (recovery path), then opens a WS
 * to stream live updates.  Mirrors useCalibrationJob.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type ProgramRunStatus =
  | 'pending'
  | 'running'
  | 'stopped'
  | 'completed'
  | 'faulted'
  | 'interrupted'

export interface ProgramRunState {
  run_id: string
  program_id: string
  machine_id: string
  status: ProgramRunStatus
  current_step_index: number
  total_steps: number
  current_node_id: string
  error: string
  created_at: number
  updated_at: number
}

export const PROGRAM_RUN_TERMINAL: ProgramRunStatus[] = [
  'stopped',
  'completed',
  'faulted',
  'interrupted',
]

function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

interface UseProgramRunResult {
  state: ProgramRunState | null
  error: string | null
  stop: () => Promise<void>
}

export function useProgramRun(runId: string | null): UseProgramRunResult {
  const [state, setState] = useState<ProgramRunState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    if (!runId) return
    unmounted.current = false

    // Fetch initial state for recovery
    brainFetch(`/api/v1/runs/${encodeURIComponent(runId)}`)
      .then((r) => r.json() as Promise<ProgramRunState>)
      .then((s) => {
        if (!unmounted.current) setState(s)
      })
      .catch(() => {
        if (!unmounted.current) setError('Failed to load program run')
      })

    // Open WebSocket for live updates
    const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
    const base = `/api/v1/runs/${encodeURIComponent(runId)}/ws`
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev: MessageEvent) => {
      if (unmounted.current) return
      try {
        const s = JSON.parse(ev.data as string) as ProgramRunState
        setState(s)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => ws.close()

    return () => {
      unmounted.current = true
      wsRef.current?.close()
    }
  }, [runId])

  const stop = useCallback(async () => {
    if (!runId) return
    setError(null)
    const res = await brainFetch(`/api/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
        detail: string
      }
      setError(body.detail ?? 'Stop failed')
    }
    // State update arrives via WS
  }, [runId])

  return { state, error, stop }
}
