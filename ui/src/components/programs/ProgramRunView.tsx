/**
 * ProgramRunView — live program execution panel.
 *
 * Subscribes to a run's WS topic and renders step progress + Stop button.
 * Mirrors the calibration InteractiveJob layout.
 */
import { useProgramRun, PROGRAM_RUN_TERMINAL } from '../../hooks/useProgramRun'
import type { ProgramStep } from './programAst'
import { stepLabel } from './programAst'

interface ProgramRunViewProps {
  runId: string | null
  steps: ProgramStep[]
  onClose: () => void
}

const statusColor: Record<string, string> = {
  completed: '#22c55e',
  stopped: '#f59e0b',
  faulted: '#ef4444',
  interrupted: '#ef4444',
}

export function ProgramRunView({ runId, steps, onClose }: ProgramRunViewProps) {
  const { state, error, stop } = useProgramRun(runId)

  if (!runId || !state) return null

  const isTerminal = PROGRAM_RUN_TERMINAL.includes(state.status)
  const isRunning = state.status === 'running'
  const totalSteps = state.total_steps
  const pct = totalSteps > 0
    ? Math.min(100, Math.round((state.current_step_index / totalSteps) * 100))
    : 0
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
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Running
        </span>
        {isTerminal && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 16,
            }}
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

      {/* Step list */}
      <div style={{ marginBottom: 12 }}>
        {steps.map((step, i) => {
          const active = i === state.current_step_index && isRunning
          const done = i < state.current_step_index || state.status === 'completed'
          return (
            <div
              key={i}
              style={{
                fontSize: 11,
                padding: '3px 0',
                color: done ? '#4ade80' : active ? '#f3f4f6' : '#6b7280',
                fontWeight: active ? 600 : 400,
              }}
            >
              {done ? '✓' : active ? '▶' : '○'} {stepLabel(step, i)}
            </div>
          )
        })}
      </div>

      {/* Status / error */}
      {state.error && (
        <p style={{ color: '#f87171', fontSize: 11, margin: '0 0 10px' }}>{state.error}</p>
      )}
      {error && (
        <p style={{ color: '#f87171', fontSize: 11, margin: '0 0 10px' }}>{error}</p>
      )}

      {/* Status label */}
      <p
        style={{
          color: '#9ca3af',
          fontSize: 11,
          margin: '0 0 12px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {state.status}
        {isRunning &&
          ` — step ${state.current_step_index + 1} / ${totalSteps}`}
      </p>

      {/* Actions */}
      {!isTerminal && (
        <button
          onClick={() => void stop()}
          style={{
            width: '100%',
            padding: '7px 0',
            background: '#374151',
            color: '#d1d5db',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Stop
        </button>
      )}
    </div>
  )
}
