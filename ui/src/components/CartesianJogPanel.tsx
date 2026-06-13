/**
 * CartesianJogPanel — popover for jogging the end-effector in Cartesian space.
 *
 * Tracks a target SE(3) pose (position + quaternion orientation), lets the user
 * nudge translation by a configurable step in metres and rotation by a step in
 * degrees, runs IK on each nudge, and sends the resulting joint targets via
 * /move/joint.
 *
 * Rotation jog can be applied in the EE's own tool frame (default) or the world
 * frame, toggled with the World/Tool button.
 *
 * Rotation controls are disabled when the machine's task_space is not 'se3'
 * (e.g. planar 2-DOF arms that can't satisfy orientation constraints).
 */
import React, { useEffect, useState } from 'react'
import Tooltip from '@mui/material/Tooltip'
import type { IKPreviewResponse } from '../lib/types'
import { useMachineIK } from '../hooks/useMachineIK'
import { brainPost } from '../hooks/useJointState'
import { quatFromAxisAngle, quatMultiply, quatToEulerDeg } from '../lib/fk'
import { SectionLabel } from './ui/SectionLabel'
import { Select } from './ui/Select'
import { Stepper } from './ui/Stepper'
import { Button } from './ui/Button'

interface CartesianJogPanelProps {
  machineId: string
  /** Joint names in chain order (used to build the move/joint payload). */
  jointNames: string[]
  /** Current measured joint angles, radians, in chain order. */
  currentQRad: number[]
  /** Current EE position from FK, metres. */
  currentEE: [number, number, number] | null
  /** Current EE orientation from FK as quaternion [x, y, z, w]. */
  currentEEQuat: [number, number, number, number] | null
  disabled?: boolean
}

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1]

const DEFAULT_STEP_M = 0.01    // 1 cm
const STEP_OPTIONS_M = [0.001, 0.005, 0.01, 0.05, 0.1]

const DEFAULT_STEP_DEG = 10
const STEP_OPTIONS_DEG = [1, 5, 10, 30, 90]

export function CartesianJogPanel({
  machineId,
  jointNames,
  currentQRad,
  currentEE,
  currentEEQuat,
  disabled = false,
}: CartesianJogPanelProps) {
  const ik = useMachineIK(machineId)
  const [step, setStep] = useState<number>(DEFAULT_STEP_M)
  const [rotStep, setRotStep] = useState<number>(DEFAULT_STEP_DEG)
  const [frame, setFrame] = useState<'tool' | 'world'>('tool')
  const [targetPos, setTargetPos] = useState<[number, number, number]>(
    currentEE ?? [0, 0, 0]
  )
  const [targetQuat, setTargetQuat] = useState<[number, number, number, number]>(
    currentEEQuat ?? IDENTITY_QUAT
  )
  const [lastResult, setLastResult] = useState<IKPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [branchPref, setBranchPref] = useState<'' | 'elbow_up' | 'elbow_down'>('')

  // Sync targets to live FK only when no edit is pending
  useEffect(() => {
    if (currentEE && lastResult === null) setTargetPos(currentEE)
  }, [currentEE, lastResult])

  useEffect(() => {
    if (currentEEQuat && lastResult === null) setTargetQuat(currentEEQuat)
  }, [currentEEQuat, lastResult])

  // SE(3) capable = task_space is 'se3'; undefined machine = assume capable to avoid false-disables
  const taskSpace = ik.machine?.description?.end_effector?.task_space
  const isSE3 = taskSpace === undefined || taskSpace === 'se3'

  const sendJog = async (
    newPos: [number, number, number],
    newQuat: [number, number, number, number],
    branch: '' | 'elbow_up' | 'elbow_down' = branchPref,
  ) => {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await ik.previewIK(newPos, newQuat, {
        strategy: 'auto',
        branch_preference: branch,
        seed: currentQRad,
      })
      setLastResult(result)
      if (result.collision_blocked) {
        setError('Floor collision — cannot reach this pose in any configuration')
        return
      }
      const joint_targets: Record<string, number> = {}
      result.solved_q.forEach((angleRad, i) => {
        const name = jointNames[i]
        if (name) joint_targets[name] = angleRad
      })
      await brainPost('/move/joint', { machine_id: machineId, joint_targets })
      setTargetPos(newPos)
      setTargetQuat(newQuat)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const jog = (axis: 0 | 1 | 2, sign: 1 | -1) => {
    const newPos: [number, number, number] = [...targetPos] as [number, number, number]
    newPos[axis] += sign * step
    void sendJog(newPos, targetQuat)
  }

  const rotJog = (axis: 0 | 1 | 2, sign: 1 | -1) => {
    const deltaRad = sign * rotStep * (Math.PI / 180)
    const q_delta = quatFromAxisAngle(axis, deltaRad)
    // Tool frame: post-multiply (rotate about EE's own axes)
    // World frame: pre-multiply (rotate about world axes)
    const newQuat = frame === 'tool'
      ? quatMultiply(targetQuat, q_delta)
      : quatMultiply(q_delta, targetQuat)
    void sendJog(targetPos, newQuat)
  }

  const resetToCurrent = () => {
    if (currentEE) setTargetPos(currentEE)
    if (currentEEQuat) setTargetQuat(currentEEQuat)
    setLastResult(null)
    setError(null)
  }

  // Switch IK branch and immediately re-solve + move at the current target pose.
  const selectBranch = (branch: '' | 'elbow_up' | 'elbow_down') => {
    setBranchPref(branch)
    void sendJog(targetPos, targetQuat, branch)
  }

  const euler = quatToEulerDeg(targetQuat)

  return (
    <div style={{ minWidth: 290 }}>
      <SectionLabel gutterBottom>Cartesian jog</SectionLabel>

      {/* ── Translation ──────────────────────────────────────────────────── */}
      <SectionLabel style={{ marginBottom: 4, marginTop: 4 }}>Translation</SectionLabel>
      <div style={rowStyle}>
        <span style={labelStyle}>Step</span>
        <Select
          value={step}
          onChange={(e) => setStep(parseFloat(e.target.value))}
          style={{ marginLeft: 'auto' }}
        >
          {STEP_OPTIONS_M.map((s) => (
            <option key={s} value={s}>
              {s >= 0.01 ? `${(s * 100).toFixed(0)} cm` : `${(s * 1000).toFixed(0)} mm`}
            </option>
          ))}
        </Select>
      </div>

      {(['X', 'Y', 'Z'] as const).map((axisName, i) => (
        <div key={axisName} style={rowStyle}>
          <span style={axisLabelStyle}>{axisName}</span>
          <Stepper
            label={`Jog ${axisName}`}
            value={`${targetPos[i].toFixed(4)} m`}
            onDecrement={() => jog(i as 0 | 1 | 2, -1)}
            onIncrement={() => jog(i as 0 | 1 | 2, 1)}
            disabled={disabled || busy}
          />
        </div>
      ))}

      {/* ── Rotation (only when task_space supports orientation control) ── */}
      {isSE3 && (
        <>
          <div style={{ ...rowStyle, marginTop: 10 }}>
            <SectionLabel>Rotation</SectionLabel>
            <Tooltip title={frame === 'tool' ? 'Rotating in tool frame — click for world frame' : 'Rotating in world frame — click for tool frame'}>
              <button
                onClick={() => setFrame((f) => f === 'tool' ? 'world' : 'tool')}
                style={frameToggleStyle(frame === 'tool')}
              >
                {frame === 'tool' ? 'Tool' : 'World'}
              </button>
            </Tooltip>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Step</span>
            <Select
              value={rotStep}
              onChange={(e) => setRotStep(parseFloat(e.target.value))}
              style={{ marginLeft: 'auto' }}
            >
              {STEP_OPTIONS_DEG.map((s) => (
                <option key={s} value={s}>{s}°</option>
              ))}
            </Select>
          </div>

          {(['Rx', 'Ry', 'Rz'] as const).map((axisName, i) => (
            <div key={axisName} style={rowStyle}>
              <span style={{ ...axisLabelStyle, color: '#d1d5db' }}>{axisName}</span>
              <Stepper
                label={`Jog ${axisName}`}
                value={`${euler[i].toFixed(1)}°`}
                onDecrement={() => rotJog(i as 0 | 1 | 2, -1)}
                onIncrement={() => rotJog(i as 0 | 1 | 2, 1)}
                disabled={disabled || busy}
              />
            </div>
          ))}
        </>
      )}

      {/* ── Branch preference ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ ...labelStyle, flex: 1 }}>Config</span>
        {(['', 'elbow_up', 'elbow_down'] as const).map((b) => (
          <button
            key={b || 'auto'}
            onClick={() => selectBranch(b)}
            disabled={disabled || busy}
            style={branchBtnStyle(branchPref === b)}
          >
            {b === '' ? 'Auto' : b === 'elbow_up' ? 'Up' : 'Down'}
          </button>
        ))}
      </div>

      {/* ── Re-anchor ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={resetToCurrent} disabled={!currentEE}>
          Re-anchor
        </Button>
      </div>

      {/* ── Status ───────────────────────────────────────────────────────── */}
      {lastResult && (
        <div style={statusStyle}>
          <div><strong>Strategy:</strong> {lastResult.strategy_used}</div>
          <div><strong>Residual:</strong> {(lastResult.residual_m * 1000).toFixed(2)} mm</div>
          <div><strong>Elapsed:</strong> {lastResult.elapsed_ms.toFixed(1)} ms</div>
          {lastResult.collision_resolved && !lastResult.collision_blocked && (
            <div style={collisionResolvedStyle}>
              ↕ Switched to {lastResult.resolved_branch ?? 'alternate'} to clear floor
              {lastResult.requires_reconfig && ' (large reconfiguration)'}
            </div>
          )}
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}

const labelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  minWidth: 36,
}

const axisLabelStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
  fontFeatureSettings: '"tnum" 1',
  minWidth: 24,
  flexShrink: 0,
}

function frameToggleStyle(isActive: boolean): React.CSSProperties {
  return {
    background: isActive ? 'rgba(251,191,36,0.15)' : 'transparent',
    color: isActive ? '#fbbf24' : '#6b7280',
    border: `1px solid ${isActive ? '#fbbf24' : '#374151'}`,
    borderRadius: 2,
    padding: '1px 6px',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'Inter', system-ui, sans-serif",
    cursor: 'pointer',
    letterSpacing: '0.05em',
  }
}

const statusStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 8px',
  background: '#0d0d0d',
  border: '1px solid #1f2937',
  borderRadius: 2,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
  color: '#6b7280',
  lineHeight: 1.6,
}

const errorStyle: React.CSSProperties = {
  marginTop: 6,
  color: '#f87171',
  fontSize: 11,
}

const collisionResolvedStyle: React.CSSProperties = {
  marginTop: 4,
  color: '#fbbf24',
  fontSize: 11,
}

function branchBtnStyle(isActive: boolean): React.CSSProperties {
  return {
    background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
    color: isActive ? '#818cf8' : '#6b7280',
    border: `1px solid ${isActive ? '#818cf8' : '#374151'}`,
    borderRadius: 2,
    padding: '2px 7px',
    fontSize: 10,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.04em',
  }
}
