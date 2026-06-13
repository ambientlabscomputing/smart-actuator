/**
 * ProgramListView — linear-step program editor + runner (J5).
 *
 * Renders a list of MOVE / WAIT steps.  Lets the user add, edit, reorder,
 * and remove steps, then save and run the program.  When a run is in-flight
 * it shows ProgramRunView inline.
 */
import { useState, useEffect } from 'react'
import { ProgramRunView } from './ProgramRunView'
import { getToken } from '../../lib/authClient'
import { bg, text, borderColor, accent, semantic } from '@/design'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepKind = 'move' | 'wait'

export interface ProgramStep {
  kind: StepKind
  joint_name?: string
  /** SI target: radians for revolute, metres for prismatic */
  target?: number
  duration_s?: number
}

interface ProgramListViewProps {
  machineId: string
  joints: string[]  // joint names from live state
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyStep(kind: StepKind): ProgramStep {
  if (kind === 'move') return { kind: 'move', joint_name: '', target: 0 }
  return { kind: 'wait', duration_s: 1 }
}

function stepToNode(step: ProgramStep) {
  if (step.kind === 'move') {
    return {
      kind: 'move',
      children: [],
      attributes: {
        joint_name: step.joint_name ?? '',
        target: step.target ?? 0,
      },
    }
  }
  return {
    kind: 'wait',
    children: [],
    attributes: { duration_s: step.duration_s ?? 1 },
  }
}

function programPayload(
  programId: string,
  machineId: string,
  name: string,
  steps: ProgramStep[],
) {
  return {
    meta: { program_id: programId, name, description: '' },
    machine_id: machineId,
    root: { kind: 'sequence', children: steps.map(stepToNode), attributes: {} },
  }
}

// ── Response types (mirror brain/models/program.py) ─────────────────────────

interface ProgramMeta {
  program_id: string
  name: string
  description: string
}

interface ProgramNode {
  kind: string
  children: ProgramNode[]
  attributes: Record<string, unknown>
}

interface SavedProgram {
  meta: ProgramMeta
  machine_id: string
  root: ProgramNode
}

// ── AST → step conversion ─────────────────────────────────────────────────────

function nodeToStep(node: ProgramNode): ProgramStep | null {
  if (node.kind === 'move') {
    // Support both 'target' (current) and 'target_rad' (legacy) attribute names.
    const rawTarget = node.attributes.target ?? node.attributes.target_rad ?? 0
    return {
      kind: 'move',
      joint_name: String(node.attributes.joint_name ?? ''),
      target: Number(rawTarget),
    }
  }
  if (node.kind === 'wait') {
    return { kind: 'wait', duration_s: Number(node.attributes.duration_s ?? 1) }
  }
  return null
}

function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

// ── Step editor row ───────────────────────────────────────────────────────────

interface StepRowProps {
  step: ProgramStep
  index: number
  total: number
  joints: string[]
  onChange: (s: ProgramStep) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function StepRow({
  step,
  index,
  total,
  joints,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepRowProps) {
  const labelStyle: React.CSSProperties = {
    color: text.dim,
    fontSize: 11,
    marginRight: 6,
  }
  const inputStyle: React.CSSProperties = {
    background: bg.surface,
    border: `1px solid ${borderColor.default}`,
    borderRadius: 4,
    color: text.primary,
    fontSize: 12,
    padding: '3px 6px',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: bg.canvas,
        borderRadius: 6,
        marginBottom: 4,
      }}
    >
      {/* Step number */}
      <span style={{ color: text.disabled, fontSize: 10, minWidth: 16 }}>{index + 1}</span>

      {/* Kind selector */}
      <select
        value={step.kind}
        onChange={(e) => onChange(emptyStep(e.target.value as StepKind))}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="move">MoveJoint</option>
        <option value="wait">Wait</option>
      </select>

      {/* Kind-specific fields */}
      {step.kind === 'move' && (
        <>
          <span style={labelStyle}>Joint</span>
          <select
            value={step.joint_name ?? ''}
            onChange={(e) => onChange({ ...step, joint_name: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {joints.length === 0 && <option value="">—</option>}
            {joints.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          <span style={labelStyle}>Target (°)</span>
          <input
            type="number"
            value={Math.round(((step.target ?? 0) * 180) / Math.PI)}
            onChange={(e) =>
              onChange({
                ...step,
                target: (Number(e.target.value) * Math.PI) / 180,
              })
            }
            style={{ ...inputStyle, width: 64 }}
          />
        </>
      )}
      {step.kind === 'wait' && (
        <>
          <span style={labelStyle}>Duration (s)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={step.duration_s ?? 1}
            onChange={(e) => onChange({ ...step, duration_s: Number(e.target.value) })}
            style={{ ...inputStyle, width: 64 }}
          />
        </>
      )}

      {/* Reorder / remove */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          style={btnStyle}
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          style={btnStyle}
          title="Move down"
        >
          ↓
        </button>
        <button onClick={onRemove} style={{ ...btnStyle, color: semantic.danger }} title="Remove">
          ✕
        </button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${borderColor.default}`,
  borderRadius: 4,
  color: text.dim,
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 6px',
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProgramListView({ machineId, joints }: ProgramListViewProps) {
  const [programId, setProgramId] = useState<string>(() => crypto.randomUUID())
  const [name, setName] = useState('My program')
  const [steps, setSteps] = useState<ProgramStep[]>([
    { kind: 'move', joint_name: joints[0] ?? '', target: 0 },
  ])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [savedPrograms, setSavedPrograms] = useState<ProgramMeta[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Fetch saved program list
  const fetchPrograms = async () => {
    setListLoading(true)
    try {
      const res = await brainFetch('/api/v1/programs')
      if (res.ok) {
        const data = (await res.json()) as ProgramMeta[]
        setSavedPrograms(data)
      }
    } finally {
      setListLoading(false)
    }
  }

  // Load a specific program into the editor
  const loadProgram = async (id: string) => {
    const res = await brainFetch(`/api/v1/programs/${encodeURIComponent(id)}`)
    if (!res.ok) return
    const data = (await res.json()) as SavedProgram
    setProgramId(data.meta.program_id)
    setName(data.meta.name)
    const parsed = data.root.children.map(nodeToStep).filter((s): s is ProgramStep => s !== null)
    setSteps(parsed.length > 0 ? parsed : [{ kind: 'move', joint_name: joints[0] ?? '', target: 0 }])
    setRunId(null)
    setSaveError(null)
    setRunError(null)
  }

  // Start a blank program
  const newProgram = () => {
    setProgramId(crypto.randomUUID())
    setName('My program')
    setSteps([{ kind: 'move', joint_name: joints[0] ?? '', target: 0 }])
    setRunId(null)
    setSaveError(null)
    setRunError(null)
  }

  // Fetch list on mount
  useEffect(() => { void fetchPrograms() }, [])

  // Update a step
  const updateStep = (i: number, s: ProgramStep) => {
    setSteps((prev) => prev.map((p, idx) => (idx === i ? s : p)))
  }

  // Remove step
  const removeStep = (i: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Move step up/down
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // Add step
  const addStep = (kind: StepKind) => {
    const step = emptyStep(kind)
    if (kind === 'move' && joints.length > 0) step.joint_name = joints[0]
    setSteps((prev) => [...prev, step])
  }

  // Save program
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const body = programPayload(programId, machineId, name, steps)
      const res = await brainFetch('/api/v1/programs', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ detail: 'Save failed' }))) as {
          detail: string
        }
        setSaveError(err.detail ?? 'Save failed')
      } else {
        // Refresh the list so the newly saved program appears in the selector
        await fetchPrograms()
      }
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // Run program
  const handleRun = async () => {
    setRunError(null)
    // Save first to make sure the brain has the latest AST
    await handleSave()
    const res = await brainFetch(`/api/v1/programs/${encodeURIComponent(programId)}/runs`, {
      method: 'POST',
      body: JSON.stringify({ machine_id: machineId }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ detail: 'Run failed' }))) as {
        detail: string
      }
      setRunError(err.detail ?? 'Run failed')
      return
    }
    const run = (await res.json()) as { run_id: string }
    setRunId(run.run_id)
  }

  return (
    <div
      style={{
        padding: '16px',
        fontFamily: 'system-ui, sans-serif',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      {/* ── Saved programs selector ──────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <select
          value={programId}
          onChange={(e) => { void loadProgram(e.target.value) }}
          disabled={listLoading}
          style={{
            flex: 1,
            background: bg.surface,
            border: `1px solid ${borderColor.default}`,
            borderRadius: 6,
            color: savedPrograms.some(p => p.program_id === programId) ? text.primary : text.faint,
            fontSize: 12,
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >
          {!savedPrograms.some(p => p.program_id === programId) && (
            <option value={programId} disabled>— unsaved draft —</option>
          )}
          {savedPrograms.map((p) => (
            <option key={p.program_id} value={p.program_id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={newProgram}
          title="New program"
          style={{
            background: 'transparent',
            border: `1px solid ${borderColor.default}`,
            borderRadius: 6,
            color: text.dim,
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          + New
        </button>
      </div>

      {/* Program name */}
      <div style={{ marginBottom: 12 }}>
        <label
          style={{ color: text.dim, fontSize: 11, display: 'block', marginBottom: 4 }}
        >
          Program name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: bg.surface,
            border: `1px solid ${borderColor.default}`,
            borderRadius: 6,
            color: text.primary,
            fontSize: 13,
            padding: '5px 10px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Step list */}
      <div style={{ marginBottom: 8 }}>
        {steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            index={i}
            total={steps.length}
            joints={joints}
            onChange={(s) => updateStep(i, s)}
            onRemove={() => removeStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
          />
        ))}
      </div>

      {/* Add step buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => addStep('move')} style={addBtnStyle}>
          + MoveJoint
        </button>
        <button onClick={() => addStep('wait')} style={addBtnStyle}>
          + Wait
        </button>
      </div>

      {/* Save / Run */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            ...actionBtnStyle,
            background: borderColor.default,
            color: text.secondary,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => void handleRun()}
          disabled={saving || steps.length === 0}
          style={{
            ...actionBtnStyle,
            background: accent.default,
            color: text.primary,
            opacity: saving || steps.length === 0 ? 0.5 : 1,
          }}
        >
          Run
        </button>
      </div>

      {saveError && (
        <p style={{ color: semantic.danger, fontSize: 11, marginTop: 8 }}>{saveError}</p>
      )}
      {runError && (
        <p style={{ color: semantic.danger, fontSize: 11, marginTop: 8 }}>{runError}</p>
      )}

      {/* Live run view */}
      {runId && (
        <ProgramRunView
          runId={runId}
          steps={steps}
          onClose={() => setRunId(null)}
        />
      )}
    </div>
  )
}

const addBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${borderColor.default}`,
  borderRadius: 6,
  color: text.dim,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 12px',
}

const actionBtnStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 0',
}
