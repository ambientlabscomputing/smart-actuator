import { useEffect, useRef, useState } from 'react'
import { AppCanvas, AppToolbar, ArmCanvas, JointDataPanel } from '@/components'
import type { JointHistory } from '@/components'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { MachineEditor } from '@/components/MachineEditor'
import { useJointState, useMachineControl, brainGet, brainPatch } from './hooks/useJointState'
import type { Template } from './lib/types'
import './App.css'

// ── Workspace view (machine already exists) ──────────────────────────────────

interface WorkspaceProps {
  machineId: string
  linkLengths: number[]
  onLinkLengthsChange: (ll: number[]) => void
}

function Workspace({ machineId, linkLengths, onLinkLengthsChange }: WorkspaceProps) {
  const { state, connected } = useJointState(machineId)
  const { jog, estop, resume } = useMachineControl()

  const [editing, setEditing] = useState(false)
  const [editTemplate, setEditTemplate] = useState<Template | null>(null)
  const [editParams, setEditParams] = useState<Record<string, number>>({})
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // ── Telemetry panel ────────────────────────────────────────────────────────
  const [selectedJoint, setSelectedJoint] = useState<number | null>(null)
  // Ring buffer: last 300 frames per joint name, keyed by actuator slot index.
  const historyRef = useRef<Map<number, JointHistory>>(new Map())

  // Accumulate history on every state update.
  if (state) {
    for (let i = 0; i < state.measured.length; i++) {
      const j = state.measured[i]
      const buf = historyRef.current.get(i) ?? {
        angle_rad: [],
        velocity_rad_s: [],
        current_a: [],
        temperature_c: [],
      }
      buf.angle_rad.push(j.angle_rad)
      buf.velocity_rad_s.push(j.velocity_rad_s)
      buf.current_a.push(j.current_a)
      buf.temperature_c.push(j.temperature_c)
      const MAX = 300
      if (buf.angle_rad.length > MAX) { buf.angle_rad.shift(); buf.velocity_rad_s.shift(); buf.current_a.shift(); buf.temperature_c.shift() }
      historyRef.current.set(i, buf)
    }
  }

  const mode = state?.mode ?? 'offline'
  const joints = state?.measured.map((j) => j.joint_name) ?? []
  const jointDegrees: Record<string, number> = {}
  for (const j of state?.measured ?? []) {
    jointDegrees[j.joint_name] = (j.angle_rad * 180) / Math.PI
  }
  const anglesRad = state?.measured.map((j) => j.angle_rad) ?? []

  // Spacebar → E-stop
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        void estop(machineId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [estop, machineId])

  const handleOpenEdit = async () => {
    setEditError(null)
    setEditLoading(true)
    try {
      const m = (await brainGet(`/machine/${encodeURIComponent(machineId)}`)) as {
        description: { parameters: Record<string, number>; template_ref: { template_id: string } }
      }
      const templateId = m.description.template_ref.template_id
      const tmpl = (await brainGet(`/templates/${encodeURIComponent(templateId)}`)) as Template
      const params: Record<string, number> = {}
      for (const [k, v] of Object.entries(m.description.parameters)) {
        params[k] = Number(v)
      }
      setEditParams(params)
      setEditTemplate(tmpl)
      setEditing(true)
    } catch (e) {
      setEditError(String(e))
    } finally {
      setEditLoading(false)
    }
  }

  const handleApplyEdit = async (params: Record<string, number>) => {
    setEditError(null)
    try {
      await brainPatch(`/machine/${encodeURIComponent(machineId)}`, { parameters: params })
      onLinkLengthsChange([
        params['link0_length_m'] ?? linkLengths[0],
        params['link1_length_m'] ?? linkLengths[1],
      ])
      setEditing(false)
    } catch (e) {
      setEditError(String(e))
    }
  }

  // When editing, show the editor full-screen instead of the workspace
  if (editing && editTemplate) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>Edit machine</span>
          <div style={{ flex: 1 }} />
          {editLoading && <span style={{ color: '#9ca3af', fontSize: 12 }}>Saving…</span>}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MachineEditor
            template={editTemplate}
            params={editParams}
            onParamsChange={setEditParams}
            onSubmit={(p) => void handleApplyEdit(p)}
            submitLabel="Apply"
            previewAngles={anglesRad}
            error={editError}
            actionsLeft={
              <button
                onClick={() => setEditing(false)}
                style={{ background: '#374151', border: 'none', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', padding: '8px 16px', fontSize: 14 }}
              >
                Cancel
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppToolbar
        mode={mode}
        connected={connected}
        angleRad={anglesRad[0] ?? 0}
        joints={joints}
        jointDegrees={jointDegrees}
        onJog={(jointName, deltaDeg) =>
          jog(machineId, jointName, deltaDeg, jointDegrees[jointName] ?? 0)
        }
        onEstop={() => estop(machineId)}
        onResume={() => resume(machineId)}
        onEdit={() => void handleOpenEdit()}
      />
      {editError && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: 12, padding: '6px 16px' }}>
          {editError}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative' }}>
        <AppCanvas>
          <ArmCanvas
            anglesRad={anglesRad}
            linkLengths={linkLengths}
            onJointClick={(i) => setSelectedJoint(prev => prev === i ? null : i)}
          />
        </AppCanvas>
        <JointDataPanel
          joint={selectedJoint !== null ? (state?.measured[selectedJoint] ?? null) : null}
          history={selectedJoint !== null ? (historyRef.current.get(selectedJoint) ?? null) : null}
          machineId={machineId}
          jointIndex={selectedJoint}
          onClose={() => setSelectedJoint(null)}
        />
      </div>
    </div>
  )
}

// ── Root — decide whether to show wizard or workspace ────────────────────────

interface MachineRecord {
  description: {
    machine_id: string
    parameters: Record<string, number>
    template_ref: { template_id: string }
  }
  joint_names: string[]
}

export default function App() {
  const [machineId, setMachineId] = useState<string | null>(null)
  const [linkLengths, setLinkLengths] = useState<number[]>([1.5, 1.0])
  const [loading, setLoading] = useState(true)

  // On mount: fetch the machines list. If non-empty, use the first one.
  // Retry up to ~15s if Brain isn't up yet — avoids opening the wizard
  // before Brain is reachable (which would leave templates stuck loading).
  useEffect(() => {
    let cancelled = false
    async function checkMachines() {
      const MAX_ATTEMPTS = 30   // 30 × 500 ms = 15 s
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return
        try {
          const ids = (await brainGet('/machines')) as string[]
          if (cancelled) return
          if (ids.length > 0) {
            try {
              const m = (await brainGet(`/machine/${encodeURIComponent(ids[0])}`)) as MachineRecord
              if (!cancelled) {
                const p = m.description.parameters
                setLinkLengths([
                  (p['link0_length_m'] as number) ?? 1.5,
                  (p['link1_length_m'] as number) ?? 1.0,
                ])
                setMachineId(m.description.machine_id)
              }
            } catch {
              if (!cancelled) setMachineId(ids[0])
            }
          }
          if (!cancelled) setLoading(false)
          return
        } catch {
          // Brain not ready yet — wait and retry
          await new Promise<void>((res) => setTimeout(res, 500))
        }
      }
      // Gave up — show wizard anyway
      if (!cancelled) setLoading(false)
    }
    void checkMachines()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
        Connecting to Brain…
      </div>
    )
  }

  if (!machineId) {
    return (
      <OnboardingWizard
        onDone={(id, params) => {
          setLinkLengths([params.link0_length_m ?? 1.5, params.link1_length_m ?? 1.0])
          setMachineId(id)
        }}
      />
    )
  }

  return <Workspace machineId={machineId} linkLengths={linkLengths} onLinkLengthsChange={setLinkLengths} />
}
