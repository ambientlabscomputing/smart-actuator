/**
 * useMachineIK — hook for reading and mutating a machine's IK configuration.
 *
 * Provides:
 *  - `machine`       The current machine object (with ik_verification, end_effector, etc.)
 *  - `loading`       True while any request is in flight
 *  - `error`         Last error message (null if none)
 *  - `setForceNumeric(bool)` — toggle force-numeric override
 *  - `setEndEffector(spec)`  — update EE offset/task-space
 *  - `previewIK(pose, opts)` — fire a POST /ik/preview and return the result
 *  - `refetch()`     — reload the machine from the API
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { brainGet, brainPost, brainPut } from './useJointState'
import type {
  EndEffectorSpec,
  IKNumericConfig,
  IKOverrides,
  IKPreviewResponse,
  Machine,
} from '../lib/types'

export interface PreviewOptions {
  strategy?: 'auto' | 'analytic' | 'numeric'
  branch_preference?: string
  seed?: number[]
}

export interface UseMachineIKResult {
  machine: Machine | null
  loading: boolean
  error: string | null
  setForceNumeric: (enabled: boolean, numericConfig?: IKNumericConfig | null) => Promise<void>
  setEndEffector: (spec: EndEffectorSpec) => Promise<void>
  previewIK: (
    position: [number, number, number],
    orientationQuat?: [number, number, number, number],
    opts?: PreviewOptions,
  ) => Promise<IKPreviewResponse>
  refetch: () => void
}

export function useMachineIK(machineId: string | null): UseMachineIKResult {
  const [machine, setMachine] = useState<Machine | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchCounter = useRef(0)

  const doFetch = useCallback(async () => {
    if (!machineId) return
    fetchCounter.current += 1
    const thisRequest = fetchCounter.current
    setLoading(true)
    setError(null)
    try {
      const result = await brainGet(`/machine/${encodeURIComponent(machineId)}`)
      if (thisRequest !== fetchCounter.current) return
      setMachine(result as Machine)
    } catch (err) {
      if (thisRequest !== fetchCounter.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (thisRequest === fetchCounter.current) setLoading(false)
    }
  }, [machineId])

  useEffect(() => {
    setMachine(null)
    doFetch()
  }, [machineId, doFetch])

  const setForceNumeric = useCallback(
    async (enabled: boolean, numericConfig?: IKNumericConfig | null) => {
      if (!machineId) return
      setLoading(true)
      setError(null)
      try {
        const body: IKOverrides = { force_numeric: enabled, numeric: numericConfig ?? null }
        const result = await brainPut(
          `/machine/${encodeURIComponent(machineId)}/ik_overrides`,
          body,
        )
        setMachine(result as Machine)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [machineId],
  )

  const setEndEffector = useCallback(
    async (spec: EndEffectorSpec) => {
      if (!machineId) return
      setLoading(true)
      setError(null)
      try {
        const result = await brainPut(
          `/machine/${encodeURIComponent(machineId)}/end_effector`,
          spec,
        )
        setMachine(result as Machine)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [machineId],
  )

  const previewIK = useCallback(
    async (
      position: [number, number, number],
      orientationQuat?: [number, number, number, number],
      opts?: PreviewOptions,
    ): Promise<IKPreviewResponse> => {
      if (!machineId) throw new Error('No machine selected')
      const body = {
        target_pose: {
          position,
          orientation_quat: orientationQuat ?? [0, 0, 0, 1],
        },
        strategy: opts?.strategy ?? 'auto',
        branch_preference: opts?.branch_preference ?? '',
        seed: opts?.seed ?? [],
      }
      return brainPost(
        `/machine/${encodeURIComponent(machineId)}/ik/preview`,
        body,
      ) as Promise<IKPreviewResponse>
    },
    [machineId],
  )

  return {
    machine,
    loading,
    error,
    setForceNumeric,
    setEndEffector,
    previewIK,
    refetch: doFetch,
  }
}
