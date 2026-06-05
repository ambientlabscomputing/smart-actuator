/**
 * useTeachSession — manages a teach session's full lifecycle.
 *
 * On mount: fetches the current session for the machine (recovery path),
 * then opens a WS to stream live updates.  Mirrors useProgramRun / useCalibrationJob.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getToken } from '../lib/authClient'

export type TeachStatus = 'idle' | 'armed' | 'recording' | 'saved' | 'aborted'
export type TeachMode = 'live' | 'drag'

export interface Waypoint {
  joint_positions: Record<string, number>
  captured_at: string
  label: string | null
  velocity: Record<string, number> | null
}

export interface TeachSessionState {
  session_id: string
  machine_id: string
  mode: TeachMode
  status: TeachStatus
  waypoints: Waypoint[]
  error: string
  created_by: string
  created_at: string
  updated_at: string
  program_id: string | null
}

export const TEACH_TERMINAL: TeachStatus[] = ['saved', 'aborted']

function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

interface UseTeachSessionResult {
  session: TeachSessionState | null
  error: string | null
  startSession: (mode?: TeachMode) => Promise<TeachSessionState | null>
  startRecording: () => Promise<void>
  capture: () => Promise<void>
  deleteWaypoint: (index: number) => Promise<void>
  save: (name: string) => Promise<string | null>
  abort: () => Promise<void>
}

export function useTeachSession(machineId: string): UseTeachSessionResult {
  const [session, setSession] = useState<TeachSessionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const unmounted = useRef(false)
  // Track the session_id we last opened a WS for so we can reopen on session change
  const wsSessionId = useRef<string | null>(null)

  // Fetch current session for this machine and open WS
  useEffect(() => {
    unmounted.current = false

    brainFetch(`/api/v1/machines/${encodeURIComponent(machineId)}/teach`)
      .then((r) => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<TeachSessionState>
      })
      .then((s) => {
        if (!unmounted.current && s) setSession(s)
      })
      .catch(() => {
        // no active session — that's fine
      })

    return () => {
      unmounted.current = true
      wsRef.current?.close()
    }
  }, [machineId])

  // Whenever the session_id changes, (re)open the WS
  useEffect(() => {
    if (!session) return
    if (wsSessionId.current === session.session_id) return

    wsRef.current?.close()
    wsSessionId.current = session.session_id

    const token = getToken()
    const base = `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/ws`
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev: MessageEvent) => {
      if (unmounted.current) return
      try {
        setSession(JSON.parse(ev.data as string) as TeachSessionState)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => ws.close()
  }, [session?.session_id])

  // ── Actions ────────────────────────────────────────────────────────────────

  const startSession = useCallback(
    async (mode: TeachMode = 'drag'): Promise<TeachSessionState | null> => {
      setError(null)
      const res = await brainFetch(`/api/v1/machines/${encodeURIComponent(machineId)}/teach`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
          detail: string
        }
        setError(body.detail ?? 'Failed to start session')
        return null
      }
      const s = (await res.json()) as TeachSessionState
      setSession(s)
      return s
    },
    [machineId],
  )

  const startRecording = useCallback(async () => {
    if (!session) return
    setError(null)
    const res = await brainFetch(
      `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/record`,
      { method: 'POST' },
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
        detail: string
      }
      setError(body.detail ?? 'Failed to start recording')
    }
    // State update arrives via WS
  }, [session])

  const capture = useCallback(async () => {
    if (!session) return
    setError(null)
    const res = await brainFetch(
      `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/capture`,
      { method: 'POST' },
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
        detail: string
      }
      setError(body.detail ?? 'Capture failed')
    }
  }, [session])

  const deleteWaypoint = useCallback(
    async (index: number) => {
      if (!session) return
      setError(null)
      const res = await brainFetch(
        `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/waypoints/${index}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
          detail: string
        }
        setError(body.detail ?? 'Delete waypoint failed')
      }
    },
    [session],
  )

  const save = useCallback(
    async (name: string): Promise<string | null> => {
      if (!session) return null
      setError(null)
      const res = await brainFetch(
        `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/save`,
        { method: 'POST', body: JSON.stringify({ name }) },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
          detail: string
        }
        setError(body.detail ?? 'Save failed')
        return null
      }
      const result = (await res.json()) as { program_id: string }
      return result.program_id
    },
    [session],
  )

  const abort = useCallback(async () => {
    if (!session) return
    setError(null)
    const res = await brainFetch(
      `/api/v1/teach/sessions/${encodeURIComponent(session.session_id)}/abort`,
      { method: 'POST' },
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ detail: 'Unknown error' }))) as {
        detail: string
      }
      setError(body.detail ?? 'Abort failed')
    }
  }, [session])

  return { session, error, startSession, startRecording, capture, deleteWaypoint, save, abort }
}
