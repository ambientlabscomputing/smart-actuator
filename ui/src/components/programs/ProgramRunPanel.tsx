/**
 * ProgramRunPanel — run-only Programs panel for the canvas.
 *
 * Shows a saved-programs dropdown, Run / Stop controls, and live run
 * progress (via ProgramRunView).  No step editing affordances — those live
 * on the dedicated /programs page.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgramRunView } from './ProgramRunView'
import { brainFetch, nodeToStep } from './programAst'
import type { ProgramMeta, ProgramStep, SavedProgram } from './programAst'

interface ProgramRunPanelProps {
  machineId: string
}

export function ProgramRunPanel({ machineId }: ProgramRunPanelProps) {
  const navigate = useNavigate()
  const [programs, setPrograms] = useState<ProgramMeta[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [steps, setSteps] = useState<ProgramStep[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  // Fetch saved program list on mount
  useEffect(() => {
    setListLoading(true)
    void brainFetch('/api/v1/programs')
      .then((r) => r.json() as Promise<ProgramMeta[]>)
      .then((data) => {
        setPrograms(data)
        if (data.length > 0 && !selectedId) setSelectedId(data[0].program_id)
      })
      .finally(() => setListLoading(false))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load steps whenever the selected program changes (for ProgramRunView labels)
  useEffect(() => {
    if (!selectedId) return
    void brainFetch(`/api/v1/programs/${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SavedProgram>) : null))
      .then((data) => {
        if (data) {
          const parsed = data.root.children
            .map((n, _i) => nodeToStep(n))
            .filter((s): s is ProgramStep => s !== null)
          setSteps(parsed)
        }
      })
  }, [selectedId])

  async function handleRun() {
    if (!selectedId) return
    setRunError(null)
    setRunning(true)
    try {
      const res = await brainFetch(
        `/api/v1/programs/${encodeURIComponent(selectedId)}/runs`,
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
    } finally {
      setRunning(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#f3f4f6',
    fontSize: 12,
    padding: '4px 8px',
    cursor: 'pointer',
  }

  return (
    <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Program selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setRunId(null)
            setRunError(null)
          }}
          disabled={listLoading || programs.length === 0}
          style={inputStyle}
        >
          {programs.length === 0 && <option value="">— no saved programs —</option>}
          {programs.map((p) => (
            <option key={p.program_id} value={p.program_id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Run button */}
      <button
        onClick={() => void handleRun()}
        disabled={!selectedId || running}
        style={{
          background: '#2563eb',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          cursor: selectedId && !running ? 'pointer' : 'not-allowed',
          fontSize: 13,
          fontWeight: 600,
          opacity: !selectedId || running ? 0.5 : 1,
          padding: '8px 0',
          width: '100%',
        }}
      >
        {running ? 'Starting…' : 'Run'}
      </button>

      {runError && (
        <p style={{ color: '#f87171', fontSize: 11, margin: 0 }}>{runError}</p>
      )}

      {/* Live run progress */}
      {runId && (
        <ProgramRunView
          runId={runId}
          steps={steps}
          onClose={() => { setRunId(null); setRunError(null) }}
        />
      )}

      {/* Link to editor */}
      <button
        onClick={() => navigate('/programs')}
        style={{
          marginTop: 4,
          background: 'transparent',
          border: '1px solid #374151',
          borderRadius: 6,
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: 11,
          padding: '5px 0',
          width: '100%',
        }}
      >
        Open Program Editor →
      </button>
    </div>
  )
}
