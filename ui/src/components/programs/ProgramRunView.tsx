/**
 * ProgramRunView — live program execution panel.
 *
 * Subscribes to a run's WS topic and renders step progress + Stop button.
 * Mirrors the calibration InteractiveJob layout.
 */
import { useProgramRun, PROGRAM_RUN_TERMINAL } from '../../hooks/useProgramRun'
import type { ProgramStep } from './programAst'
import { stepLabel } from './programAst'
import { motion as fm } from 'framer-motion'
import { accent, bg, text, borderColor, semantic } from '@/design'
import { motion as motionTokens } from '@/design/motion'

interface ProgramRunViewProps {
  runId: string | null
  steps: ProgramStep[]
  onClose: () => void
}

const statusColor: Record<string, string> = {
  completed: semantic.ok,
  stopped: semantic.warn,
  faulted: semantic.danger,
  interrupted: semantic.danger,
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
  const barColor = statusColor[state.status] ?? semantic.info

  return (
    <div
      style={{
        background: bg.surfaceRaised,
        border: `1px solid ${borderColor.default}`,
        borderRadius: 6,
        padding: '14px 16px',
        fontFamily: 'inherit',
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
            color: text.primary,
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
              color: text.faint,
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
          background: borderColor.default,
          borderRadius: 999,
          marginBottom: 12,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <fm.div
          style={{
            position: 'absolute',
            inset: 0,
            height: '100%',
            background: `linear-gradient(90deg, ${barColor} 0%, ${barColor} 100%)`,
            borderRadius: 999,
            transformOrigin: 'left center',
          }}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: motionTokens.duration.base / 1000, ease: motionTokens.ease.out }}
        />
      </div>

      {/* Step list */}
      <div style={{ marginBottom: 12 }}>
        {steps.map((step, i) => {
          const active = i === state.current_step_index && isRunning
          const done = i < state.current_step_index || state.status === 'completed'
          const rowColor = done ? semantic.ok : active ? accent.default : text.faint
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                overflow: 'hidden',
                fontSize: 11,
                padding: '5px 8px',
                marginBottom: 4,
                borderRadius: 4,
                color: rowColor,
                fontWeight: active ? 600 : 400,
                background: active ? accent.dim : 'transparent',
                border: active ? `1px solid ${accent.default}33` : '1px solid transparent',
              }}
            >
              {active && (
                <fm.div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '38%',
                    background: `linear-gradient(90deg, transparent 0%, ${accent.default}22 50%, transparent 100%)`,
                    filter: 'blur(2px)',
                  }}
                  initial={{ x: '-120%' }}
                  animate={{ x: '260%' }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                {done ? '✓' : active ? '▶' : '○'} {stepLabel(step, i)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Status / error */}
      {state.error && (
        <p style={{ color: semantic.danger, fontSize: 11, margin: '0 0 10px' }}>{state.error}</p>
      )}
      {error && (
        <p style={{ color: semantic.danger, fontSize: 11, margin: '0 0 10px' }}>{error}</p>
      )}

      {/* Status label */}
      <p
        style={{
          color: isRunning ? accent.default : text.dim,
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
            background: borderColor.default,
            color: text.secondary,
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
