import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppCanvas, AppToolbar, ArmCanvas, JointDataPanel, LoadingScreen, ProgramRunPanel, WorkspaceMenu } from '@/components'
import type { JointHistory } from '@/components'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { MachineEditor } from '@/components/MachineEditor'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { ProgramsPage } from '@/components/programs/ProgramsPage'
import { GCodePage } from '@/components/programs/GCodePage'
import { useJointState, useMachineControl, brainGet, brainPatch } from './hooks/useJointState'
import { useWorkspace } from './hooks/useWorkspace'
import { RequireAuth } from '@/lib/RequireAuth'
import { useAuth } from '@/lib/AuthContext'
import type { DHChainValues, DHJointValues, Template } from './lib/types'
import { dhToLinkLengths, dhValuesFromSchema } from './lib/dh'
import { forwardKinematics } from './lib/fk'
import './App.css'

// ── Workspace view (machine already exists) ──────────────────────────────────

interface WorkspaceProps {
  machineId: string
  linkLengths: number[]
  dhJoints: DHJointValues[] | null
  linkRadius: number | null
  onDhChange: (dh: DHChainValues) => void
}

function Workspace({ machineId, linkLengths, dhJoints, linkRadius, onDhChange }: WorkspaceProps) {
  const { state, connected } = useJointState(machineId)
  const { jog, estop, resume } = useMachineControl()

  const [editing, setEditing] = useState(false)
  const [editTemplate, setEditTemplate] = useState<Template | null>(null)
  const [editDhValues, setEditDhValues] = useState<DHChainValues>({ link_radius: 0.03, joints: [] })
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [showPrograms, setShowPrograms] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)

  // Workspace overlay — lazy-loaded when toggled on; refetched after edits.
  const { data: workspaceData, refetch: refetchWorkspace } = useWorkspace(machineId, showWorkspace)

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
        position: [],
        velocity: [],
        current_a: [],
        temperature_c: [],
      }
      buf.position.push(j.position)
      buf.velocity.push(j.velocity)
      buf.current_a.push(j.current_a)
      buf.temperature_c.push(j.temperature_c)
      const MAX = 300
      if (buf.position.length > MAX) { buf.position.shift(); buf.velocity.shift(); buf.current_a.shift(); buf.temperature_c.shift() }
      // eslint-disable-next-line react-hooks/refs
      historyRef.current.set(i, buf)
    }
  }

  const mode = state?.mode ?? 'offline'
  // Show every configured joint in the jog panel, not just the ones currently
  // reporting telemetry — so disconnected/offline actuators are still jog-able.
  const joints = dhJoints && dhJoints.length > 0
    ? dhJoints.map((j) => j.name)
    : state?.measured.map((j) => j.joint_name) ?? []
  const jointDegrees: Record<string, number> = {}
  for (const name of joints) jointDegrees[name] = 0
  for (const j of state?.measured ?? []) {
    jointDegrees[j.joint_name] = j.type === 'prismatic'
      ? j.position * 1000  // store mm for display in prismatic joints
      : (j.position * 180) / Math.PI
  }
  const anglesRad = joints.map((name) => {
    const m = state?.measured.find((j) => j.joint_name === name)
    return m ? m.position : 0
  })
  const eePose = dhJoints ? forwardKinematics(dhJoints, anglesRad) : null

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
        description: {
          dh_chain?: DHChainValues
          parameters: Record<string, number>
          template_ref: { template_id: string }
        }
      }
      const templateId = m.description.template_ref.template_id
      const tmpl = (await brainGet(`/templates/${encodeURIComponent(templateId)}`)) as Template

      // Use dh_chain from server if present; fall back to schema defaults
      const dh: DHChainValues =
        m.description.dh_chain ??
        (tmpl.dh ? dhValuesFromSchema(tmpl.dh) : { link_radius: 0.03, joints: [] })

      setEditDhValues(dh)
      setEditTemplate(tmpl)
      setEditing(true)
    } catch (e) {
      setEditError(String(e))
    } finally {
      setEditLoading(false)
    }
  }

  const handleApplyEdit = async (dh: DHChainValues) => {
    setEditError(null)
    try {
      await brainPatch(`/machine/${encodeURIComponent(machineId)}`, { dh_chain: dh })
      onDhChange(dh)
      setEditing(false)
      // DH changed → reachable workspace will have been recomputed server-side.
      // Refetch so the overlay reflects the new hull immediately.
      refetchWorkspace()
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
            dhValues={editDhValues}
            onDhChange={setEditDhValues}
            onSubmit={(dh) => void handleApplyEdit(dh)}
            submitLabel="Apply"
            previewAngles={anglesRad}
            error={editError}
            machineId={machineId}
            showKinematicsTab={true}
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

  // ── Camera auto-positioning ────────────────────────────────────────────────
  // For pure-Cartesian (all-prismatic) machines the world origin may be a
  // corner of the working envelope, so we position the camera to look at the
  // workspace centre instead.  For revolute arms the arm base at the origin
  // is already the natural anchor, so we keep the original defaults.
  const cameraConfig: {
    position: [number, number, number]
    target: [number, number, number]
  } = (() => {
    const allPrismatic =
      dhJoints &&
      dhJoints.length > 0 &&
      dhJoints.every(j => (j.type ?? 'revolute') === 'prismatic')

    if (!allPrismatic) {
      return { position: [1.5, 1.5, 1.0], target: [0, 0, 0] }
    }

    // FK at mid-travel to find the workspace centre
    const midQ = dhJoints!.map(j => (j.limit_lower + j.limit_upper) / 2)
    const { ee: target } = forwardKinematics(dhJoints!, midQ)

    // Total travel extent = rough radius of the workspace
    const reach = dhJoints!.reduce(
      (s, j) => s + (j.limit_upper - j.limit_lower), 0)
    const dist = Math.max(0.4, Math.min(5, reach * 1.4))
    return {
      position: [
        target[0] + dist * 0.65,
        target[1] + dist * 0.65,
        target[2] + dist * 0.35,
      ] as [number, number, number],
      target: target as [number, number, number],
    }
  })()

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppToolbar />
      {editError && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: 12, padding: '6px 16px' }}>
          {editError}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AppCanvas
          initialCameraPosition={cameraConfig.position}
          initialCameraTarget={cameraConfig.target}
        >
          <ArmCanvas
            anglesRad={anglesRad}
            linkLengths={linkLengths}
            dhJoints={dhJoints ?? undefined}
            radius={linkRadius ?? undefined}
            onJointClick={(i) => setSelectedJoint(prev => prev === i ? null : i)}
            workspace={workspaceData}
            showWorkspacePoints={showWorkspace}
          />
        </AppCanvas>
        <WorkspaceMenu
          mode={mode}
          connected={connected}
          joints={joints}
          jointDegrees={jointDegrees}
          onJog={(jointName, deltaSI) => {
            const idx = joints.indexOf(jointName)
            const currentSI = idx >= 0 ? (anglesRad[idx] ?? 0) : 0
            return jog(machineId, jointName, currentSI + deltaSI)
          }}
          onEstop={() => estop(machineId)}
          onResume={() => resume(machineId)}
          onEdit={() => void handleOpenEdit()}
          onPrograms={() => setShowPrograms((v) => !v)}
          programsActive={showPrograms}
          showWorkspace={showWorkspace}
          onToggleWorkspace={() => setShowWorkspace((v) => !v)}
          machineId={machineId}
          jointNamesOrdered={joints}
          currentQRad={anglesRad}
          currentEE={eePose?.ee ?? null}
          currentEEQuat={eePose?.eeQuat ?? null}
          dhJoints={dhJoints ?? undefined}
        />
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
              <ProgramRunPanel machineId={machineId} />
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
    dh_chain?: DHChainValues
    parameters: Record<string, number>
    template_ref: { template_id: string }
  }
  joint_names: string[]
}

export default function App() {
  const { status } = useAuth()
  const [machineId, setMachineId] = useState<string | null>(null)
  const [linkLengths, setLinkLengths] = useState<number[]>([1.5, 1.0])
  const [dhJoints, setDhJoints] = useState<DHJointValues[] | null>(null)
  const [linkRadius, setLinkRadius] = useState<number | null>(null)
  const [machineLoading, setMachineLoading] = useState(true)

  const applyDh = (dh: DHChainValues) => {
    setDhJoints(dh.joints)
    setLinkRadius(dh.link_radius)
    setLinkLengths(dhToLinkLengths(dh))
  }

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
                if (m.description.dh_chain) {
                  applyDh(m.description.dh_chain)
                } else {
                  setLinkLengths([
                    (p['link0_length_m'] as number) ?? 1.5,
                    (p['link1_length_m'] as number) ?? 1.0,
                  ])
                }
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

  const handleWizardDone = (id: string, dh: DHChainValues) => {
    applyDh(dh)
    setMachineId(id)
  }

  // Root route: show loading spinner, redirect to onboarding, or show workspace.
  const rootElement = machineLoading
    ? <LoadingScreen />
    : !machineId
      ? <Navigate to="/onboarding" replace />
      : <Workspace machineId={machineId} linkLengths={linkLengths} dhJoints={dhJoints} linkRadius={linkRadius} onDhChange={applyDh} />

  // Programs route: redirect to onboarding if no machine, or show full editor.
  const programsElement = machineLoading
    ? <LoadingScreen />
    : !machineId
      ? <Navigate to="/onboarding" replace />
      : <ProgramsPage
          machineId={machineId}
          joints={dhJoints ? dhJoints.map((j) => j.name) : []}
          dhJoints={dhJoints}
        />

  // Onboarding route: once machineId is set, go back to root.
  const onboardingElement = machineId
    ? <Navigate to="/" replace />
    : <OnboardingWizard onDone={handleWizardDone} />

  // G-code route: share the same guard as programs.
  const gcodeElement = machineLoading
    ? <LoadingScreen />
    : !machineId
      ? <Navigate to="/onboarding" replace />
      : <GCodePage machineId={machineId} />

  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={rootElement} />
        <Route path="/onboarding" element={onboardingElement} />
        <Route path="/programs" element={programsElement} />
        <Route path="/gcode" element={gcodeElement} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
