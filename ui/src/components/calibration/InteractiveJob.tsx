/**
 * InteractiveJob — generic operator-driven job UI.
 *
 * Shows the current prompt, step progress, Continue / Abort buttons, and a
 * result summary when the job reaches a terminal state.  Reused by J5 program
 * runs without modification.
 *
 * Props:
 *  jobId    – the job to observe (or null to render nothing)
 *  onClose  – called when the user dismisses a completed / aborted job
 */
import { useCalibrationJob, TERMINAL } from '../../hooks/useCalibrationJob'
import { bg, text, borderColor, accent, semantic } from '@/design'

const STEP_LABELS: Record<string, string[]> = {
  default: ['Start', 'Move to home', 'Range sweep', 'Done'],
}

interface InteractiveJobProps {
  jobId: string | null
  onClose: () => void
}

export function InteractiveJob({ jobId, onClose }: InteractiveJobProps) {
  const { state, error, advance, abort } = useCalibrationJob(jobId)

  if (!jobId || !state) return null

  const isTerminal = TERMINAL.includes(state.status)
  const isRunning = state.status === 'running_sweep'
  const steps = STEP_LABELS.default
  const totalSteps = steps.length - 1
  const pct = Math.min(100, Math.round((state.step / totalSteps) * 100))

  const statusColor: Record<string, string> = {
    completed: semantic.ok,
    aborted: semantic.warn,
    faulted: semantic.danger,
  }
  const barColor = statusColor[state.status] ?? semantic.info

  return (
    <div
      style={{
        background: bg.surfaceRaised,
        border: `1px solid ${borderColor.default}`,
        borderRadius: 10,
        padding: '14px 16px',
        fontFamily: 'system-ui, sans-serif',
        marginTop: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span style={{ color: text.primary, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Calibration
        </span>
        {isTerminal && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: text.faint, cursor: 'pointer', fontSize: 16 }}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: borderColor.default,
          borderRadius: 2,
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Step labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        {steps.map((label, i) => (
          <span
            key={i}
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: i <= state.step ? text.dim : text.disabled,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Prompt */}
      <p
        style={{
          color: text.secondary,
          fontSize: 12,
          margin: '0 0 14px',
          lineHeight: 1.5,
        }}
      >
        {state.prompt}
      </p>

      {/* Error */}
      {error && (
        <p style={{ color: semantic.danger, fontSize: 11, margin: '0 0 10px' }}>{error}</p>
      )}

      {/* Result summary */}
      {state.status === 'completed' && Object.keys(state.result).length > 0 && (
        <div
          style={{
            background: bg.surfaceRaised,
            border: `1px solid ${semantic.ok}`,
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          <span style={{ color: semantic.ok, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
            Result
          </span>
          {Object.entries(state.result).map(([k, v]) => (
              <div key={k} style={{ color: semantic.ok, fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
              {k}: {JSON.stringify(v)}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void advance()}
            disabled={isRunning}
            style={{
              flex: 1,
              padding: '7px 0',
              background: isRunning ? accent.hover : accent.default,
              color: text.primary,
              border: 'none',
              borderRadius: 6,
              cursor: isRunning ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {isRunning ? 'Running…' : 'Continue'}
          </button>
          <button
            onClick={() => void abort()}
            style={{
              padding: '7px 14px',
              background: borderColor.default,
              color: text.secondary,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Abort
          </button>
        </div>
      )}
    </div>
  )
}
