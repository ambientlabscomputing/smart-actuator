import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppCanvas, AppToolbar, ArmCanvas, JointDataPanel, LoadingScreen, ProgramListView } from '@/components'
import type { JointHistory } from '@/components'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { MachineEditor } from '@/components/MachineEditor'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { useJointState, useMachineControl, brainGet, brainPatch } from './hooks/useJointState'
import { RequireAuth } from '@/lib/RequireAuth'
import { useAuth } from '@/lib/AuthContext'
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
  const [showPrograms, setShowPrograms] = useState(false)

  // ── Telemetry panel ────────────────────────────────────────────────────────
  const [selectedJoint, setSelectedJoint] = useState<number | null>(null)
  // Ring buffer: last 300 frames per joint name, keyed by actuator slot index.
  const historyRef = useRef<Map<number, JointHistory>>(new Map())

  // Accumulate history on every state update.
  if (state) {
    for (let i = 0; i < state.measured.length; i++) {
      const j = state.measured[i]
      // eslint-disable-next-line react-hooks/refs
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
      // eslint-disable-next-line react-hooks/refs
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
        joints={joints}
        jointDegrees={jointDegrees}
        onJog={(jointName, deltaDeg) =>
          jog(machineId, jointName, deltaDeg, jointDegrees[jointName] ?? 0)
        }
        onEstop={() => estop(machineId)}
        onResume={() => resume(machineId)}
        onEdit={() => void handleOpenEdit()}
        onPrograms={() => setShowPrograms((v) => !v)}
        programsActive={showPrograms}
      />
      {editError && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: 12, padding: '6px 16px' }}>
          {editError}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AppCanvas>
          <ArmCanvas
            anglesRad={anglesRad}
            linkLengths={linkLengths}
            onJointClick={(i) => setSelectedJoint(prev => prev === i ? null : i)}
          />
        </AppCanvas>
        <JointDataPanel
          joint={selectedJoint !== null ? (state?.measured[selectedJoint] ?? null) : null}
          // eslint-disable-next-line react-hooks/refs
          history={selectedJoint !== null ? (historyRef.current.get(selectedJoint) ?? null) : null}
          machineId={machineId}
          jointIndex={selectedJoint}
          onClose={() => setSelectedJoint(null)}
        />
        {showPrograms && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 360,
              background: '#0d0d0d',
              borderLeft: '1px solid #374151',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: '1px solid #374151',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  color: '#f3f4f6',
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Programs
              </span>
              <button
                onClick={() => setShowPrograms(false)}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
              <ProgramListView machineId={machineId} joints={joints} />
            </div>
          </div>
        )}
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
  const { status } = useAuth()
  const [machineId, setMachineId] = useState<string | null>(null)
  const [linkLengths, setLinkLengths] = useState<number[]>([1.5, 1.0])
  const [machineLoading, setMachineLoading] = useState(true)

  // Fetch machines whenever auth becomes confirmed. Reset when logged out.
  useEffect(() => {
    if (status !== 'authed') {
      // Synchronous state reset on logout — react-hooks/set-state-in-effect
      // flags this, but this is the correct pattern for clearing derived state
      // when an external auth event happens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMachineId(null)
      setMachineLoading(true)
      return
    }
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
          if (!cancelled) setMachineLoading(false)
          return
        } catch {
          await new Promise<void>((res) => setTimeout(res, 500))
        }
      }
      if (!cancelled) setMachineLoading(false)
    }
    void checkMachines()
    return () => { cancelled = true }
  }, [status])

  const handleWizardDone = (id: string, params: Record<string, number>) => {
    setLinkLengths([params.link0_length_m ?? 1.5, params.link1_length_m ?? 1.0])
    setMachineId(id)
  }

  // Root route: show loading spinner, redirect to onboarding, or show workspace.
  const rootElement = machineLoading
    ? <LoadingScreen />
    : !machineId
      ? <Navigate to="/onboarding" replace />
      : <Workspace machineId={machineId} linkLengths={linkLengths} onLinkLengthsChange={setLinkLengths} />

  // Onboarding route: once machineId is set, go back to root.
  const onboardingElement = machineId
    ? <Navigate to="/" replace />
    : <OnboardingWizard onDone={handleWizardDone} />

  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={rootElement} />
        <Route path="/onboarding" element={onboardingElement} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
