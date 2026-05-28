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
    completed: '#22c55e',
    aborted: '#f59e0b',
    faulted: '#ef4444',
  }
  const barColor = statusColor[state.status] ?? '#3b82f6'

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: '1px solid #374151',
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
        <span style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Calibration
        </span>
        {isTerminal && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}
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
          background: '#374151',
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
              color: i <= state.step ? '#9ca3af' : '#4b5563',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Prompt */}
      <p
        style={{
          color: '#e5e7eb',
          fontSize: 12,
          margin: '0 0 14px',
          lineHeight: 1.5,
        }}
      >
        {state.prompt}
      </p>

      {/* Error */}
      {error && (
        <p style={{ color: '#f87171', fontSize: 11, margin: '0 0 10px' }}>{error}</p>
      )}

      {/* Result summary */}
      {state.status === 'completed' && Object.keys(state.result).length > 0 && (
        <div
          style={{
            background: '#052e16',
            border: '1px solid #166534',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
            Result
          </span>
          {Object.entries(state.result).map(([k, v]) => (
            <div key={k} style={{ color: '#86efac', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
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
              background: isRunning ? '#1d4ed8' : '#2563eb',
              color: '#fff',
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
              background: '#374151',
              color: '#d1d5db',
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
