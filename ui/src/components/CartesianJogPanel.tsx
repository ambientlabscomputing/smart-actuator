/**
 * CartesianJogPanel — popover for jogging the end-effector in Cartesian space.
 *
 * Tracks a target XYZ position (initialised from the current EE pose), lets the
 * user nudge it by a configurable step, runs IK on each nudge, and sends the
 * resulting joint targets via /move/joint.
 *
 * Includes a small status row showing the current EE FK position, the last IK
 * residual, and the strategy used (analytic / numeric).
 */
import React, { useEffect, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import type { IKPreviewResponse } from '../lib/types'
import { useMachineIK } from '../hooks/useMachineIK'
import { brainPost } from '../hooks/useJointState'

interface CartesianJogPanelProps {
  machineId: string
  /** Joint names in chain order (used to build the move/joint payload). */
  jointNames: string[]
  /** Current measured joint angles, radians, in chain order. */
  currentQRad: number[]
  /** Current EE position from FK, metres. */
  currentEE: [number, number, number] | null
  disabled?: boolean
}

const DEFAULT_STEP_M = 0.01    // 1 cm
const STEP_OPTIONS_M = [0.001, 0.005, 0.01, 0.05, 0.1]

export function CartesianJogPanel({
  machineId,
  jointNames,
  currentQRad,
  currentEE,
  disabled = false,
}: CartesianJogPanelProps) {
  const ik = useMachineIK(machineId)
  const [step, setStep] = useState<number>(DEFAULT_STEP_M)
  const [target, setTarget] = useState<[number, number, number]>(
    currentEE ?? [0, 0, 0]
  )
  const [lastResult, setLastResult] = useState<IKPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Sync target to current EE only when there's no pending edit (avoid clobbering)
  useEffect(() => {
    if (currentEE && lastResult === null) {
      setTarget(currentEE)
    }
  }, [currentEE, lastResult])

  const jog = async (axis: 0 | 1 | 2, sign: 1 | -1) => {
    if (disabled || busy) return
    const newTarget: [number, number, number] = [...target] as [number, number, number]
    newTarget[axis] += sign * step

    setBusy(true)
    setError(null)
    try {
      // Use the current measured q as the seed for smoothest motion
      const result = await ik.previewIK(newTarget, undefined, {
        strategy: 'auto',
        seed: currentQRad,
      })
      // Send absolute joint targets
      const joint_targets: Record<string, number> = {}
      result.solved_q.forEach((angleRad, i) => {
        const name = jointNames[i]
        if (name) joint_targets[name] = angleRad
      })
      await brainPost('/move/joint', { machine_id: machineId, joint_targets })

      setTarget(newTarget)
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const resetToCurrent = () => {
    if (currentEE) {
      setTarget(currentEE)
      setLastResult(null)
      setError(null)
    }
  }

  return (
    <div style={{ minWidth: 260 }}>
      <div style={headerStyle}>Cartesian jog</div>

      {/* Step size selector */}
      <div style={rowStyle}>
        <span style={labelStyle}>Step</span>
        <select
          value={step}
          onChange={(e) => setStep(parseFloat(e.target.value))}
          style={selectStyle}
        >
          {STEP_OPTIONS_M.map((s) => (
            <option key={s} value={s}>
              {s >= 0.01 ? `${(s * 100).toFixed(0)} cm` : `${(s * 1000).toFixed(0)} mm`}
            </option>
          ))}
        </select>
      </div>

      {/* XYZ jog buttons */}
      {(['X', 'Y', 'Z'] as const).map((axisName, i) => (
        <div key={axisName} style={rowStyle}>
          <span style={axisLabelStyle}>{axisName}</span>
          <span style={valStyle}>{target[i].toFixed(4)} m</span>
          <Tooltip title={`−${axisName}`}>
            <span>
              <IconButton
                onClick={() => void jog(i as 0 | 1 | 2, -1)}
                disabled={disabled || busy}
                size="small"
                style={btnStyle}
              >
                −
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={`+${axisName}`}>
            <span>
              <IconButton
                onClick={() => void jog(i as 0 | 1 | 2, 1)}
                disabled={disabled || busy}
                size="small"
                style={btnStyle}
              >
                +
              </IconButton>
            </span>
          </Tooltip>
        </div>
      ))}

      {/* Reset to current EE */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={resetToCurrent} disabled={!currentEE} style={resetBtnStyle}>
          Reset to current
        </button>
      </div>

      {/* Status */}
      {lastResult && (
        <div style={statusStyle}>
          <div><strong>Strategy:</strong> {lastResult.strategy_used}</div>
          <div><strong>Residual:</strong> {(lastResult.residual_m * 1000).toFixed(2)} mm</div>
          <div><strong>Elapsed:</strong> {lastResult.elapsed_ms.toFixed(1)} ms</div>
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 0',
}

const labelStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 11,
  fontFamily: 'monospace',
  minWidth: 36,
}

const axisLabelStyle: React.CSSProperties = {
  color: '#d1d5db',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'monospace',
  minWidth: 14,
}

const valStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 11,
  fontFamily: 'monospace',
  flex: 1,
  textAlign: 'right',
}

const selectStyle: React.CSSProperties = {
  background: '#1f2937',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 4,
  padding: '2px 4px',
  fontSize: 11,
  marginLeft: 'auto',
}

const btnStyle: React.CSSProperties = {
  color: '#9ca3af',
  padding: 2,
  width: 26,
  height: 26,
  fontSize: 16,
  fontWeight: 700,
}

const resetBtnStyle: React.CSSProperties = {
  background: '#374151',
  color: '#d1d5db',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
}

const statusStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 8px',
  background: '#0d1117',
  borderRadius: 4,
  fontSize: 11,
  color: '#9ca3af',
  lineHeight: 1.6,
}

const errorStyle: React.CSSProperties = {
  marginTop: 8,
  color: '#f87171',
  fontSize: 11,
}
