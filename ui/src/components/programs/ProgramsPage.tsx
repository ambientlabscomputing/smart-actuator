/**
 * ProgramsPage — full-page program management and authoring (/programs).
 *
 * Left rail  : saved-programs list + New / Delete.
 * Main pane  : step editor (MOVE, MOVE_SE3, WAIT), Save, Run, Stop.
 * Bottom     : inline ProgramRunView when a run is in-flight.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppToolbar } from '../AppToolbar'
import { ProgramRunView } from './ProgramRunView'
import { StepRow } from './StepRow'
import {
  brainFetch,
  emptyStep,
  nodeToStep,
  programPayload,
} from './programAst'
import type { ProgramMeta, ProgramStep, SavedProgram, StepKind } from './programAst'
import { useJointState } from '../../hooks/useJointState'
import { forwardKinematics } from '../../lib/fk'
import type { DHJointValues } from '../../lib/types'

interface ProgramsPageProps {
  machineId: string
  joints: string[]
  dhJoints: DHJointValues[] | null
}

const sectionLabel: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#f3f4f6',
  fontSize: 13,
  padding: '5px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

const actionBtn = (color: string): React.CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  background: color,
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
})

export function ProgramsPage({ machineId, joints, dhJoints }: ProgramsPageProps) {
  const navigate = useNavigate()

  // Derive current EE pose from live joint state + DH chain
  const { state: machineState } = useJointState(machineId)
  const anglesRad = useMemo(() => {
    if (!dhJoints || !machineState) return []
    return dhJoints.map((j) => {
      const m = machineState.measured.find((ms) => ms.joint_name === j.name)
      return m ? m.angle_rad : 0
    })
  }, [dhJoints, machineState])
  const eePose = useMemo(
    () => (dhJoints ? forwardKinematics(dhJoints, anglesRad) : null),
    [dhJoints, anglesRad],
  )
  const currentEE = eePose?.ee ?? null
  const currentEEQuat = eePose?.eeQuat ?? null

  // ── Saved-programs list ───────────────────────────────────────────────────
  const [savedPrograms, setSavedPrograms] = useState<ProgramMeta[]>([])
  const [listLoading, setListLoading] = useState(false)

  const fetchPrograms = async () => {
    setListLoading(true)
    try {
      const res = await brainFetch('/api/v1/programs')
      if (res.ok) setSavedPrograms((await res.json()) as ProgramMeta[])
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { void fetchPrograms() }, [])

  // ── Current editor state ──────────────────────────────────────────────────
  const [programId, setProgramId] = useState<string>(() => crypto.randomUUID())
  const [name, setName] = useState('My program')
  const [steps, setSteps] = useState<ProgramStep[]>([
    { kind: 'move', joint_name: joints[0] ?? '', target_rad: 0 },
  ])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Run state ─────────────────────────────────────────────────────────────
  const [runId, setRunId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // ── Program CRUD ──────────────────────────────────────────────────────────

  function newProgram() {
    setProgramId(crypto.randomUUID())
    setName('My program')
    setSteps([{ kind: 'move', joint_name: joints[0] ?? '', target_rad: 0 }])
    setRunId(null)
    setSaveError(null)
    setDeleteError(null)
    setRunError(null)
  }

  async function loadProgram(id: string) {
    const res = await brainFetch(`/api/v1/programs/${encodeURIComponent(id)}`)
    if (!res.ok) return
    const data = (await res.json()) as SavedProgram
    setProgramId(data.meta.program_id)
    setName(data.meta.name)
    const parsed = data.root.children
      .map((n) => nodeToStep(n))
      .filter((s): s is ProgramStep => s !== null)
    setSteps(
      parsed.length > 0
        ? parsed
        : [{ kind: 'move', joint_name: joints[0] ?? '', target_rad: 0 }],
    )
    setRunId(null)
    setSaveError(null)
    setDeleteError(null)
    setRunError(null)
  }

  async function handleSave(): Promise<boolean> {
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
        return false
      }
      await fetchPrograms()
      return true
    } catch (e) {
      setSaveError(String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!savedPrograms.some((p) => p.program_id === programId)) return
    setDeleteError(null)
    const res = await brainFetch(
      `/api/v1/programs/${encodeURIComponent(programId)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      setDeleteError('Delete failed')
      return
    }
    await fetchPrograms()
    newProgram()
  }

  async function handleRun() {
    setRunError(null)
    const saved = await handleSave()
    if (!saved) return
    const res = await brainFetch(
      `/api/v1/programs/${encodeURIComponent(programId)}/runs`,
      { method: 'POST', body: JSON.stringify({ machine_id: machineId }) },
    )
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

  // ── Step editor helpers ───────────────────────────────────────────────────

  const updateStep = (i: number, s: ProgramStep) =>
    setSteps((prev) => prev.map((p, idx) => (idx === i ? s : p)))

  const removeStep = (i: number) =>
    setSteps((prev) => prev.filter((_, idx) => idx !== i))

  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const addStep = (kind: StepKind) =>
    setSteps((prev) => [...prev, emptyStep(kind, joints[0] ?? '')])

  const isSaved = savedPrograms.some((p) => p.program_id === programId)

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
      <AppToolbar title="Programs" />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Left rail: saved programs ────────────────────────────────────── */}
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            background: '#111',
            borderRight: '1px solid #1f2937',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
            <p style={sectionLabel}>Saved programs</p>
            <button
              onClick={newProgram}
              style={{
                width: '100%',
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 6,
                color: '#d1d5db',
                cursor: 'pointer',
                fontSize: 12,
                padding: '5px 0',
              }}
            >
              + New program
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {listLoading && (
              <p style={{ color: '#4b5563', fontSize: 11, padding: '4px 14px' }}>Loading…</p>
            )}
            {savedPrograms.map((p) => (
              <button
                key={p.program_id}
                onClick={() => void loadProgram(p.program_id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: p.program_id === programId ? '#1e3a5f' : 'transparent',
                  border: 'none',
                  color: p.program_id === programId ? '#93c5fd' : '#d1d5db',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '6px 14px',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid #1f2937', flexShrink: 0 }}>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid #374151',
                borderRadius: 6,
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: 11,
                padding: '5px 0',
              }}
            >
              ← Back to workspace
            </button>
          </div>
        </aside>

        {/* ── Main pane: editor ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Program name */}
          <section>
            <p style={sectionLabel}>Program name</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Untitled program"
            />
          </section>

          {/* Steps */}
          <section>
            <p style={sectionLabel}>Steps</p>
            {steps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                total={steps.length}
                joints={joints}
                currentEE={currentEE}
                currentEEQuat={currentEEQuat}
                onChange={(s) => updateStep(i, s)}
                onRemove={() => removeStep(i)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
              />
            ))}

            {/* Add step buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {(['move', 'move_se3', 'wait'] as StepKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => addStep(k)}
                  style={{
                    background: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    color: '#9ca3af',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '5px 12px',
                  }}
                >
                  + {k === 'move' ? 'MoveJoint' : k === 'move_se3' ? 'MovePose' : 'Wait'}
                </button>
              ))}
            </div>
          </section>

          {/* Error banners */}
          {saveError && (
            <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{saveError}</p>
          )}
          {deleteError && (
            <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{deleteError}</p>
          )}
          {runError && (
            <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{runError}</p>
          )}

          {/* Actions */}
          <section style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ ...actionBtn('#374151'), color: '#d1d5db', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => void handleRun()}
              disabled={saving}
              style={{ ...actionBtn('#2563eb'), opacity: saving ? 0.6 : 1 }}
            >
              Save & Run
            </button>
            {isSaved && (
              <button
                onClick={() => void handleDelete()}
                style={{ ...actionBtn('#7f1d1d'), color: '#fca5a5', flex: 0, padding: '8px 16px' }}
              >
                Delete
              </button>
            )}
          </section>

          {/* Live run view */}
          {runId && (
            <ProgramRunView
              runId={runId}
              steps={steps}
              onClose={() => { setRunId(null); setRunError(null) }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
