/**
 * StepRow — editable row for a single program step (MOVE / MOVE_SE3 / WAIT).
 */
import type React from 'react'
import { quatToEulerDeg, quatFromEulerDeg } from '../../lib/fk'
import { emptyStep } from './programAst'
import type { ProgramStep, StepKind } from './programAst'

export interface StepRowProps {
  step: ProgramStep
  index: number
  total: number
  joints: string[]
  /** Current EE position from FK, for "Snap to EE" in MOVE_SE3 steps. */
  currentEE: [number, number, number] | null
  /** Current EE orientation quaternion from FK, for "Snap to EE". */
  currentEEQuat: [number, number, number, number] | null
  onChange: (s: ProgramStep) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

const labelStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 11,
  marginRight: 4,
  whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 4,
  color: '#f3f4f6',
  fontSize: 12,
  padding: '3px 6px',
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #374151',
  borderRadius: 4,
  color: '#9ca3af',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 6px',
}

export function StepRow({
  step,
  index,
  total,
  joints,
  currentEE,
  currentEEQuat,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepRowProps) {
  // Euler angles for MOVE_SE3 orientation display
  const [roll, pitch, yaw] =
    step.kind === 'move_se3'
      ? quatToEulerDeg(step.orientation_quat)
      : [0, 0, 0]

  function handleKindChange(newKind: StepKind) {
    onChange(emptyStep(newKind, joints[0] ?? ''))
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        background: '#111',
        borderRadius: 6,
        marginBottom: 6,
      }}
    >
      {/* Row 1: step number + kind selector + reorder/remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#4b5563', fontSize: 10, minWidth: 16 }}>{index + 1}</span>
        <select
          value={step.kind}
          onChange={(e) => handleKindChange(e.target.value as StepKind)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="move">MoveJoint</option>
          <option value="move_se3">MovePose (SE3)</option>
          <option value="wait">Wait</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={onMoveUp} disabled={index === 0} style={btnStyle} title="Move up">↑</button>
          <button onClick={onMoveDown} disabled={index === total - 1} style={btnStyle} title="Move down">↓</button>
          <button onClick={onRemove} style={{ ...btnStyle, color: '#f87171' }} title="Remove">✕</button>
        </div>
      </div>

      {/* Row 2: kind-specific fields */}
      {step.kind === 'move' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={labelStyle}>Joint</span>
          <select
            value={step.joint_name ?? ''}
            onChange={(e) => onChange({ ...step, joint_name: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {joints.length === 0 && <option value="">—</option>}
            {joints.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <span style={labelStyle}>Target (°)</span>
          <input
            type="number"
            value={Math.round(((step.target_rad ?? 0) * 180) / Math.PI)}
            onChange={(e) =>
              onChange({ ...step, target_rad: (Number(e.target.value) * Math.PI) / 180 })
            }
            style={{ ...inputStyle, width: 64 }}
          />
        </div>
      )}

      {step.kind === 'move_se3' && (
        <>
          {/* Position */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={labelStyle}>Pos (m)</span>
            {(['x', 'y', 'z'] as const).map((axis, ai) => (
              <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ ...labelStyle, marginRight: 2 }}>{axis}</span>
                <input
                  type="number"
                  step={0.001}
                  value={step.position[ai].toFixed(3)}
                  onChange={(e) => {
                    const pos: [number, number, number] = [...step.position]
                    pos[ai] = Number(e.target.value)
                    onChange({ ...step, position: pos })
                  }}
                  style={{ ...inputStyle, width: 70 }}
                />
              </label>
            ))}
          </div>
          {/* Orientation (RPY) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={labelStyle}>Orient (°)</span>
            {([['Roll', roll], ['Pitch', pitch], ['Yaw', yaw]] as [string, number][]).map(
              ([label, val], oi) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ ...labelStyle, marginRight: 2 }}>{label}</span>
                  <input
                    type="number"
                    step={1}
                    value={val.toFixed(1)}
                    onChange={(e) => {
                      const rpy: [number, number, number] = [roll, pitch, yaw]
                      rpy[oi] = Number(e.target.value)
                      const quat = quatFromEulerDeg(rpy[0], rpy[1], rpy[2])
                      onChange({ ...step, orientation_quat: quat })
                    }}
                    style={{ ...inputStyle, width: 64 }}
                  />
                </label>
              ),
            )}
          </div>
          {/* Snap to current EE */}
          {currentEE && currentEEQuat && (
            <button
              onClick={() =>
                onChange({
                  ...step,
                  position: [...currentEE] as [number, number, number],
                  orientation_quat: [...currentEEQuat] as [number, number, number, number],
                })
              }
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: '1px solid #4b5563',
                borderRadius: 4,
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: 11,
                padding: '3px 10px',
              }}
            >
              Snap to current EE
            </button>
          )}
        </>
      )}

      {step.kind === 'wait' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyle}>Duration (s)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={step.duration_s ?? 1}
            onChange={(e) => onChange({ ...step, duration_s: Number(e.target.value) })}
            style={{ ...inputStyle, width: 64 }}
          />
        </div>
      )}
    </div>
  )
}
