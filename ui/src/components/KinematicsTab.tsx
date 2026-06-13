/**
 * KinematicsTab — Kinematics configuration panel for power users.
 *
 * Rendered inside MachineEditor as a third "Kinematics" tab.
 * The tab is hidden by default and only appears when `visible` is true
 * (caller decides based on user role / feature flag).
 *
 * Features:
 *  • EE offset editor (XYZ metres + RPY degrees)
 *  • Task-space selector
 *  • Per-block decomposition status chips from ik_verification
 *  • Solver-in-use label
 *  • "Force numeric IK" toggle
 *  • Numeric tunable knobs (only shown when force_numeric or no decomposition)
 *  • "Try a pose" panel → POST /machine/:id/ik/preview
 */
import React, { useState } from 'react'
import type { EndEffectorSpec, IKBlockVerification, IKNumericConfig, IKPreviewResponse, Machine } from '../lib/types'
import type { UseMachineIKResult } from '../hooks/useMachineIK'

export interface KinematicsTabProps {
  machineId: string
  /** Full machine object (with ik_verification, description.end_effector, etc.) */
  machine: Machine | null
  ik: UseMachineIKResult
}

const TASK_SPACES = ['r3', 'se3', 'planar_xz', 'planar_xy']

export function KinematicsTab({ machineId: _machineId, machine, ik }: KinematicsTabProps) {
  const verification = machine?.ik_verification ?? null
  const ee = machine?.description?.end_effector ?? null
  const overrides = machine?.description?.ik_overrides ?? null
  const forceNumeric = overrides?.force_numeric ?? false

  // Local draft state for EE editor
  const [draftEE, setDraftEE] = useState<EndEffectorSpec>(
    ee ?? { parent: '', offset_m: [0, 0, 0], orientation_offset_deg: [0, 0, 0], task_space: 'r3' }
  )
  const [eeEditing, setEEEditing] = useState(false)

  // Try a pose state
  const [tryPos, setTryPos] = useState<[number, number, number]>([0.1, 0.0, 0.1])
  const [tryStrategy, setTryStrategy] = useState<'auto' | 'analytic' | 'numeric'>('auto')
  const [tryResult, setTryResult] = useState<IKPreviewResponse | null>(null)
  const [tryError, setTryError] = useState<string | null>(null)
  const [tryLoading, setTryLoading] = useState(false)

  // Show numeric tunables when force_numeric or no analytic decomposition
  const showTunables = forceNumeric || !verification || verification.strategy === 'numeric'

  const handleForceNumericToggle = async () => {
    await ik.setForceNumeric(!forceNumeric, overrides?.numeric ?? null)
  }

  const handleEEApply = async () => {
    await ik.setEndEffector(draftEE)
    setEEEditing(false)
  }

  const handleTryPose = async () => {
    setTryError(null)
    setTryResult(null)
    setTryLoading(true)
    try {
      const result = await ik.previewIK(tryPos, undefined, { strategy: tryStrategy })
      setTryResult(result)
    } catch (err) {
      setTryError(err instanceof Error ? err.message : String(err))
    } finally {
      setTryLoading(false)
    }
  }

  return (
    <div style={panelStyle}>
      {/* ── Solver status ─────────────────────────────────────────────────── */}
      <Section title="Solver">
        <Row label="Strategy in use">
          <StrategyBadge strategy={verification?.strategy ?? 'numeric'} />
        </Row>
        {verification && (
          <p style={summaryStyle}>{verification.summary}</p>
        )}

        <Row label="Force numeric IK">
          <label style={toggleLabelStyle}>
            <input
              type="checkbox"
              checked={forceNumeric}
              onChange={handleForceNumericToggle}
              disabled={ik.loading}
            />
            {forceNumeric ? ' Enabled' : ' Disabled'}
          </label>
        </Row>
      </Section>

      {/* ── Decomposition block status ────────────────────────────────────── */}
      {verification && verification.blocks.length > 0 && (
        <Section title="Decomposition blocks">
          {verification.blocks.map((b) => (
            <BlockChip key={b.block_index} block={b} />
          ))}
        </Section>
      )}

      {/* ── End-effector frame ───────────────────────────────────────────── */}
      <Section title="End-effector frame">
        {eeEditing ? (
          <EEEditor draft={draftEE} setDraft={setDraftEE} />
        ) : (
          <EEDisplay ee={ee} />
        )}
        <div style={eeActionsStyle}>
          {eeEditing ? (
            <>
              <button style={btnStyle} onClick={handleEEApply} disabled={ik.loading}>Apply</button>
              <button style={btnSecStyle} onClick={() => { setDraftEE(ee ?? draftEE); setEEEditing(false) }}>
                Cancel
              </button>
            </>
          ) : (
            <button style={btnStyle} onClick={() => setEEEditing(true)}>Edit</button>
          )}
        </div>
      </Section>

      {/* ── Numeric tunables ─────────────────────────────────────────────── */}
      {showTunables && (
        <Section title="Numeric solver settings">
          <NumericDisplay config={overrides?.numeric ?? null} />
        </Section>
      )}

      {/* ── Try a pose ───────────────────────────────────────────────────── */}
      <Section title="Try a pose">
        <TryPosePanel
          pos={tryPos}
          setPos={setTryPos}
          strategy={tryStrategy}
          setStrategy={setTryStrategy}
          onSolve={handleTryPose}
          loading={tryLoading}
          result={tryResult}
          error={tryError}
        />
      </Section>

      {/* Global error display */}
      {ik.error && <p style={errorStyle}>{ik.error}</p>}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h4 style={sectionHeadStyle}>{title}</h4>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const color = strategy === 'analytic' ? '#4caf50' : '#2196f3'
  return (
    <span style={{ ...chipStyle, background: color }}>
      {strategy === 'analytic' ? 'Analytic' : 'Numeric'}
    </span>
  )
}

function BlockChip({ block }: { block: IKBlockVerification }) {
  const colors: Record<string, string> = { ok: '#4caf50', warning: '#ff9800', error: '#f44336' }
  const bg = colors[block.status] ?? '#888'
  return (
    <div style={blockChipStyle}>
      <span style={{ ...chipStyle, background: bg }}>{block.status.toUpperCase()}</span>
      <span style={blockKindStyle}>{block.kind}</span>
      <span style={blockJointsStyle}>joints [{block.joints.join(', ')}]</span>
      {block.reason && <span style={blockReasonStyle}>{block.reason}</span>}
    </div>
  )
}

function EEDisplay({ ee }: { ee: EndEffectorSpec | null }) {
  if (!ee) return <p style={dimStyle}>No end-effector defined.</p>
  return (
    <div style={eeDisplayStyle}>
      <Row label="Parent link"><span>{ee.parent || '(last joint)'}</span></Row>
      <Row label="Offset (m)">
        <span>{ee.offset_m.map(v => v.toFixed(4)).join(', ')}</span>
      </Row>
      <Row label="Orientation (°)">
        <span>{ee.orientation_offset_deg.map(v => v.toFixed(1)).join(', ')}</span>
      </Row>
      <Row label="Task space"><span>{ee.task_space}</span></Row>
    </div>
  )
}

function EEEditor({
  draft,
  setDraft,
}: {
  draft: EndEffectorSpec
  setDraft: (d: EndEffectorSpec) => void
}) {
  const setOffset = (i: number, v: number) => {
    const next = [...draft.offset_m] as [number, number, number]
    next[i] = v
    setDraft({ ...draft, offset_m: next })
  }
  const setOrientation = (i: number, v: number) => {
    const next = [...draft.orientation_offset_deg] as [number, number, number]
    next[i] = v
    setDraft({ ...draft, orientation_offset_deg: next })
  }

  return (
    <div style={eeEditorStyle}>
      <Row label="Parent link">
        <input
          style={inputStyle}
          value={draft.parent}
          placeholder="(last joint)"
          onChange={e => setDraft({ ...draft, parent: e.target.value })}
        />
      </Row>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <Row key={axis} label={`Offset ${axis.toUpperCase()} (m)`}>
          <input
            style={inputStyle}
            type="number"
            step={0.001}
            value={draft.offset_m[i]}
            onChange={e => setOffset(i, parseFloat(e.target.value) || 0)}
          />
        </Row>
      ))}
      {(['roll', 'pitch', 'yaw'] as const).map((axis, i) => (
        <Row key={axis} label={`${axis.charAt(0).toUpperCase() + axis.slice(1)} offset (°)`}>
          <input
            style={inputStyle}
            type="number"
            step={1}
            value={draft.orientation_offset_deg[i]}
            onChange={e => setOrientation(i, parseFloat(e.target.value) || 0)}
          />
        </Row>
      ))}
      <Row label="Task space">
        <select
          style={inputStyle}
          value={draft.task_space}
          onChange={e => setDraft({ ...draft, task_space: e.target.value })}
        >
          {TASK_SPACES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
        </select>
      </Row>
    </div>
  )
}

function NumericDisplay({ config }: { config: IKNumericConfig | null }) {
  const cfg = config ?? { max_iters: 150, pos_tol_m: 1e-4, rot_tol_rad: 1e-3, damping: 0.01, seed: 'current_q' }
  return (
    <div style={eeDisplayStyle}>
      <Row label="Max iterations"><span>{cfg.max_iters}</span></Row>
      <Row label="Position tol (m)"><span>{cfg.pos_tol_m.toExponential(1)}</span></Row>
      <Row label="Rotation tol (rad)"><span>{cfg.rot_tol_rad.toExponential(1)}</span></Row>
      <Row label="Damping λ"><span>{cfg.damping}</span></Row>
      <Row label="Seed"><span>{cfg.seed}</span></Row>
    </div>
  )
}

function TryPosePanel({
  pos,
  setPos,
  strategy,
  setStrategy,
  onSolve,
  loading,
  result,
  error,
}: {
  pos: [number, number, number]
  setPos: (p: [number, number, number]) => void
  strategy: 'auto' | 'analytic' | 'numeric'
  setStrategy: (s: 'auto' | 'analytic' | 'numeric') => void
  onSolve: () => void
  loading: boolean
  result: IKPreviewResponse | null
  error: string | null
}) {
  return (
    <div>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <Row key={axis} label={`${axis.toUpperCase()} (m)`}>
          <input
            style={inputStyle}
            type="number"
            step={0.01}
            value={pos[i]}
            onChange={e => {
              const next = [...pos] as [number, number, number]
              next[i] = parseFloat(e.target.value) || 0
              setPos(next)
            }}
          />
        </Row>
      ))}
      <Row label="Strategy">
        <select style={inputStyle} value={strategy} onChange={e => setStrategy(e.target.value as typeof strategy)}>
          <option value="auto">auto</option>
          <option value="analytic">analytic</option>
          <option value="numeric">numeric</option>
        </select>
      </Row>
      <button style={btnStyle} onClick={onSolve} disabled={loading}>
        {loading ? 'Solving…' : 'Solve'}
      </button>

      {error && <p style={errorStyle}>{error}</p>}

      {result && (
        <div style={resultStyle}>
          <div>
            <strong>Solved q (rad):</strong>{' '}
            {result.solved_q.map(v => v.toFixed(4)).join(', ')}
          </div>
          <div><strong>Residual:</strong> {(result.residual_m * 1000).toFixed(2)} mm</div>
          <div><strong>Strategy:</strong> {result.strategy_used}</div>
          <div><strong>Elapsed:</strong> {result.elapsed_ms.toFixed(1)} ms</div>
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '8px 4px',
  overflowY: 'auto',
  height: '100%',
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 12px',
  background: '#1a1a1a',
}

const sectionHeadStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#888',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#aaa',
  flexShrink: 0,
}

const toggleLabelStyle: React.CSSProperties = {
  fontSize: 12,
  cursor: 'pointer',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 7px',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 600,
  color: '#fff',
}

const blockChipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 4,
  flexWrap: 'wrap',
}

const blockKindStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600 }
const blockJointsStyle: React.CSSProperties = { fontSize: 11, color: '#aaa' }
const blockReasonStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#ff9800',
  width: '100%',
  marginTop: 2,
  paddingLeft: 4,
}

const eeDisplayStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const eeEditorStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const eeActionsStyle: React.CSSProperties = { display: 'flex', gap: 8, marginTop: 8 }

const inputStyle: React.CSSProperties = {
  background: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#eee',
  padding: '3px 6px',
  fontSize: 12,
  width: 120,
}

const btnStyle: React.CSSProperties = {
  background: '#2563eb',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  padding: '5px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

const btnSecStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#444',
}

const summaryStyle: React.CSSProperties = { fontSize: 11, color: '#aaa', margin: '4px 0 0' }
const dimStyle: React.CSSProperties = { fontSize: 12, color: '#666' }
const errorStyle: React.CSSProperties = { color: '#f44336', fontSize: 12 }

const resultStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 10px',
  background: '#111',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: 1.7,
  color: '#ccc',
}
