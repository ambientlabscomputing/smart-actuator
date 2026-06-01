/**
 * useWorkspace — lazy hook for the machine's reachable end-effector workspace.
 *
 * Only fetches when `enabled` is true.  Re-fetches when `machineId` or
 * `enabled` changes (or when `refetch()` is called manually, e.g. after
 * an edit-apply that may have changed the DH chain).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { brainGet } from './useJointState'
import type { WorkspaceResult } from '../lib/types'

export interface UseWorkspaceResult {
  data: WorkspaceResult | null
  loading: boolean
  error: string | null
  /** Call to force a re-fetch without toggling the overlay off and on. */
  refetch: () => void
}

export function useWorkspace(machineId: string | null, enabled: boolean): UseWorkspaceResult {
  const [data, setData] = useState<WorkspaceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchCounter = useRef(0)

  const doFetch = useCallback(async () => {
    if (!machineId || !enabled) return

    fetchCounter.current += 1
    const thisRequest = fetchCounter.current

    setLoading(true)
    setError(null)

    try {
      const result = await brainGet(`/machine/${encodeURIComponent(machineId)}/workspace`)
      if (thisRequest !== fetchCounter.current) return  // stale, drop it
      setData(result as WorkspaceResult)
    } catch (err) {
      if (thisRequest !== fetchCounter.current) return
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      if (thisRequest === fetchCounter.current) setLoading(false)
    }
  }, [machineId, enabled])

  // Fetch (or clear) whenever dependencies change.
  useEffect(() => {
    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    doFetch()
  }, [machineId, enabled, doFetch])

  return { data, loading, error, refetch: doFetch }
}
