/**
 * useCalibrationJob — manages a single calibration job's lifecycle.
 *
 * On mount: fetches the current state (recovery path), then opens a WS to
 * stream live updates.  Exposes advance() and abort() actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type CalibrationStatus =
  | 'started'
  | 'waiting_for_home'
  | 'running_sweep'
  | 'completed'
  | 'aborted'
  | 'faulted'

export interface CalibrationJobState {
  job_id: string
  machine_id: string
  joint_index: number
  status: CalibrationStatus
  step: number
  prompt: string
  last_measurement: Record<string, unknown>
  result: Record<string, unknown>
  error: string
}

const TERMINAL: CalibrationStatus[] = ['completed', 'aborted', 'faulted']

function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

interface UseCalibrationJobResult {
  state: CalibrationJobState | null
  error: string | null
  advance: () => Promise<void>
  abort: () => Promise<void>
}

export function useCalibrationJob(jobId: string | null): UseCalibrationJobResult {
  const [state, setState] = useState<CalibrationJobState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    if (!jobId) return
    unmounted.current = false

    // Fetch initial state for recovery
    brainFetch(`/api/v1/calibrations/${encodeURIComponent(jobId)}`)
      .then((r) => r.json() as Promise<CalibrationJobState>)
      .then((s) => {
        if (!unmounted.current) setState(s)
      })
      .catch(() => {
        if (!unmounted.current) setError('Failed to load calibration job')
      })

    // Open WebSocket for live updates
    const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
    const base = `/api/v1/calibrations/${encodeURIComponent(jobId)}/ws`
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev: MessageEvent) => {
      if (unmounted.current) return
      try {
        const s = JSON.parse(ev.data as string) as CalibrationJobState
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
  }, [jobId])

  const advance = useCallback(async () => {
    if (!jobId) return
    setError(null)
    const res = await brainFetch(`/api/v1/calibrations/${encodeURIComponent(jobId)}/advance`, {
      method: 'POST',
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as { detail: string }
      setError(body.detail)
    }
    // State update arrives via WS
  }, [jobId])

  const abort = useCallback(async () => {
    if (!jobId) return
    setError(null)
    const res = await brainFetch(`/api/v1/calibrations/${encodeURIComponent(jobId)}/abort`, {
      method: 'POST',
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as { detail: string }
      setError(body.detail)
    }
  }, [jobId])

  return { state, error, advance, abort }
}

export { TERMINAL }
