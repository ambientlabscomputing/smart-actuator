/**
 * TeachPage — record-and-replay teach session UI (RFD-13).
 *
 * - Record / Stop button (pulses red while recording)
 * - Capture button + spacebar shortcut
 * - Waypoint list with index, timestamp, delete
 * - Mode toggle Live/Drag (Live disabled in Phase 1)
 * - Save dialog → navigates to /programs on success
 * - 3-D canvas with drag-to-jog interactions when session is active
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppToolbar } from '../AppToolbar'
import { AppCanvas } from '../AppCanvas'
import { ArmCanvas } from '../ArmCanvas'
import { useTeachSession } from '../../hooks/useTeachSession'
import { useJointState, brainPost } from '../../hooks/useJointState'
import { useMachineIK } from '../../hooks/useMachineIK'
import { forwardKinematics } from '../../lib/fk'
import { bg, text, borderColor, accent, semantic } from '@/design'
import type { TeachMode, Waypoint } from '../../hooks/useTeachSession'
import type { DHJointValues } from '../../lib/types'

// ── Shared styles ─────────────────────────────────────────────────────────────

const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const card: React.CSSProperties = {
  background: bg.surface,
  borderRadius: 10,
  border: `1px solid ${borderColor.dim}`,
  padding: '16px 20px',
  marginBottom: 12,
}

const label: React.CSSProperties = {
  color: text.dim,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const btn = (
  bg: string,
  disabled?: boolean,
): React.CSSProperties => ({
  padding: '10px 20px',
  background: disabled ? borderColor.default : bg,
  border: 'none',
  borderRadius: 8,
  color: disabled ? text.faint : text.primary,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
  fontWeight: 600,
})

const toggleBtn = (active: boolean, disabled?: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '6px 0',
  background: active ? accent.default : 'transparent',
  border: '1px solid',
  borderColor: active ? accent.default : borderColor.default,
  borderRadius: 6,
  color: disabled ? text.disabled : active ? text.primary : text.dim,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 12,
  fontWeight: 600,
})

// ── Waypoint row ──────────────────────────────────────────────────────────────

function WaypointRow({
  waypoint,
  index,
  onDelete,
}: {
  waypoint: Waypoint
  index: number
  onDelete: () => void
}) {
  const time = new Date(waypoint.captured_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const jointCount = Object.keys(waypoint.joint_positions).length

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 6,
        background: bg.surfaceAlt,
        marginBottom: 4,
        gap: 10,
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: accent.default,
          color: accent.default,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <div style={{ flex: 1, ...col, gap: 1 }}>
        <span style={{ color: text.secondary, fontSize: 12, fontWeight: 500 }}>{time}</span>
        <span style={{ color: text.faint, fontSize: 10 }}>{jointCount} joint{jointCount !== 1 ? 's' : ''}</span>
      </div>
      <button
        onClick={onDelete}
        style={{
          background: 'none',
          border: 'none',
          color: text.faint,
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 4px',
          lineHeight: 1,
        }}
        title="Delete waypoint"
      >
        ×
      </button>
    </div>
  )
}

// ── Save dialog ───────────────────────────────────────────────────────────────

function SaveDialog({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{ background: bg.surface, borderRadius: 12, padding: 28, width: 340, ...col, gap: 16 }}>
        <h3 style={{ color: text.primary, margin: 0, fontSize: 16, fontWeight: 700 }}>Save program</h3>
        <div style={{ ...col, gap: 6 }}>
          <label style={label}>Program name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
            placeholder="my-program"
            style={{
              background: borderColor.dim,
              border: `1px solid ${borderColor.default}`,
              borderRadius: 6,
              color: text.primary,
              fontSize: 14,
              padding: '8px 12px',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn(borderColor.default)} onClick={onCancel}>Cancel</button>
          <button
            style={btn(accent.default, !name.trim())}
            onClick={() => name.trim() && onSave(name.trim())}
          >
            Save &amp; go to Programs
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Joint picker overlay ──────────────────────────────────────────────────────
//
// Floating panel listing every joint with a slider. Designed for co-located
// joints (e.g. spherical wrist where j4/j5/j6 share an origin) — the 3D
// spheres overlap in screen space so direct click-and-drag can only reach
// the topmost one. This panel gives unambiguous access to every joint.

function JointPickerOverlay({
  joints,
  anglesRad,
  picked,
  onPick,
  onChange,
}: {
  joints: DHJointValues[]
  anglesRad: number[]
  picked: number | null
  onPick: (idx: number | null) => void
  onChange: (idx: number, valueSI: number) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        left: 10,
        background: 'rgba(15, 23, 42, 0.85)',
        border: `1px solid ${borderColor.dim}`,
        borderRadius: 8,
        padding: 8,
        minWidth: 200,
        maxHeight: '70vh',
        overflowY: 'auto',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        color: text.dim,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '2px 6px 6px',
      }}>Joints</div>
      {joints.map((j, i) => {
        const isPrismatic = (j.type ?? 'revolute') === 'prismatic'
        const value = anglesRad[i] ?? 0
        const display = isPrismatic
          ? `${(value * 1000).toFixed(1)} mm`
          : `${((value * 180) / Math.PI).toFixed(1)}°`
        const isPicked = picked === i
        // Slider works in SI internally; for revolute we map degrees → radians
        // on input so the user feels a natural scale.
        const minSI = isPrismatic ? j.limit_lower : j.limit_lower * (Math.PI / 180)
        const maxSI = isPrismatic ? j.limit_upper : j.limit_upper * (Math.PI / 180)
        const step = isPrismatic ? 0.001 : Math.PI / 720  // 1 mm or 0.25°
        return (
          <div
            key={j.name}
            onClick={() => onPick(isPicked ? null : i)}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              background: isPicked ? accent.dim : 'transparent',
              cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                color: isPicked ? accent.default : text.secondary,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'monospace',
              }}>
                {isPrismatic ? '↔' : '↻'} {j.name}
              </span>
              <span style={{
                color: isPicked ? accent.default : text.dim,
                fontSize: 10,
                fontFamily: 'monospace',
              }}>{display}</span>
            </div>
            {isPicked && (
              <input
                type="range"
                min={minSI}
                max={maxSI}
                step={step}
                value={value}
                onChange={(e) => onChange(i, parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', marginTop: 4, accentColor: semantic.info }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface TeachPageProps {
  machineId: string
}

export function TeachPage({ machineId }: TeachPageProps) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<TeachMode>('drag')
  const [showSave, setShowSave] = useState(false)
  const { session, error, startSession, startRecording, capture, deleteWaypoint, save, abort } =
    useTeachSession(machineId)

  // Live joint state for 3-D canvas
  const { state: machineState } = useJointState(machineId)
  const { machine } = useMachineIK(machineId)

  // Extract dhJoints from machine config
  const dhJoints: DHJointValues[] = machine?.description?.dh_chain?.joints ?? []
  const linkRadius: number = machine?.description?.dh_chain?.link_radius ?? 0.05

  // Smart camera placement — same logic as App.tsx Workspace
  const cameraConfig: { position: [number, number, number]; target: [number, number, number] } = (() => {
    if (dhJoints.length === 0) return { position: [1.5, 1.5, 1.0], target: [0, 0, 0] }
    const allPrismatic = dhJoints.every(j => (j.type ?? 'revolute') === 'prismatic')
    if (!allPrismatic) return { position: [1.5, 1.5, 1.0], target: [0, 0, 0] }
    const midQ = dhJoints.map(j => (j.limit_lower + j.limit_upper) / 2)
    const { ee: target } = forwardKinematics(dhJoints, midQ)
    const reach = dhJoints.reduce((s, j) => s + (j.limit_upper - j.limit_lower), 0)
    const dist = Math.max(0.4, Math.min(5, reach * 1.4))
    return {
      position: [target[0] + dist * 0.65, target[1] + dist * 0.65, target[2] + dist * 0.35] as [number, number, number],
      target: target as [number, number, number],
    }
  })()

  // anglesRad in slot order from live telemetry
  const anglesRad = dhJoints.map((j) => {
    const measured = machineState?.measured.find((m) => m.joint_name === j.name)
    return measured?.position ?? 0
  })

  // Forward-kinematics result for the live pose (used by EE-drag IK)
  const fkResult = dhJoints.length > 0 ? forwardKinematics(dhJoints, anglesRad) : null
  const currentEE = fkResult?.ee ?? null
  const currentEEQuat = fkResult?.eeQuat ?? null

  // IK hook for end-effector drag
  const ikHook = useMachineIK(machineId)

  // Per-joint picker: lets the user control co-located joints (e.g. spherical
  // wrist) via a slider when the 3D spheres overlap.
  const [pickedJoint, setPickedJoint] = useState<number | null>(null)

  const isRecording = session?.status === 'recording'
  const isActive = session !== null && session.status !== 'saved' && session.status !== 'aborted'
  const canCapture = session?.status === 'recording' || session?.status === 'armed'
  const canSave = isActive && (session?.waypoints.length ?? 0) > 0
  const canDrag = isActive && mode === 'drag'

  const [isDragging, setIsDragging] = useState(false)

  // Spacebar → capture
  const captureRef = useRef(capture)
  captureRef.current = capture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && canCapture) {
        e.preventDefault()
        void captureRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCapture])

  const handleRecord = useCallback(async () => {
    if (!session || session.status === 'saved' || session.status === 'aborted') {
      await startSession(mode)
    } else if (session.status === 'armed') {
      await startRecording()
    } else if (session.status === 'recording') {
      // Stop recording → go back to armed (allows further capture or save)
      // We don't abort here — user still has the waypoints
    }
  }, [session, mode, startSession, startRecording])

  const handleSave = useCallback(
    async (name: string) => {
      const programId = await save(name)
      setShowSave(false)
      if (programId) navigate('/programs')
    },
    [save, navigate],
  )

  // Drag-to-jog: send move/joint when user drags a joint in the 3D canvas
  const handleJointDrag = useCallback(
    async (_jointIndex: number, jointName: string, newValue: number) => {
      if (!canDrag) return
      try {
        await brainPost('/move/joint', {
          machine_id: machineId,
          joint_targets: { [jointName]: newValue },
        })
      } catch {
        // silently ignore — stale commands during fast drag are fine
      }
    },
    [canDrag, machineId],
  )

  // EE drag: invoke server-side IK to compute joint targets for a Cartesian
  // delta applied to the current EE pose. Throttled: skip new requests while
  // one is in flight (preview latency would otherwise dominate drag UX).
  const ikInFlight = useRef(false)
  const pendingDelta = useRef<[number, number, number] | null>(null)
  const eeDragStart = useRef<{ pos: [number, number, number]; quat: [number, number, number, number] } | null>(null)
  // Capture start pose at drag begin so accumulated deltas stay smooth.
  useEffect(() => {
    if (isDragging && currentEE && currentEEQuat && eeDragStart.current === null) {
      eeDragStart.current = { pos: [...currentEE], quat: [...currentEEQuat] as [number, number, number, number] }
    }
    if (!isDragging) {
      eeDragStart.current = null
      pendingDelta.current = null
    }
  }, [isDragging, currentEE, currentEEQuat])

  const handleEEDrag = useCallback(
    async (delta: [number, number, number]) => {
      if (!canDrag) return
      const start = eeDragStart.current
      if (!start) return
      // Accumulate latest delta; only one IK request in flight at a time.
      pendingDelta.current = delta
      if (ikInFlight.current) return
      ikInFlight.current = true
      try {
        while (pendingDelta.current) {
          const d = pendingDelta.current
          pendingDelta.current = null
          const target: [number, number, number] = [
            start.pos[0] + d[0],
            start.pos[1] + d[1],
            start.pos[2] + d[2],
          ]
          try {
            const res = await ikHook.previewIK(target, start.quat, {
              strategy: 'auto',
              seed: anglesRad,
            })
            const joint_targets: Record<string, number> = {}
            res.solved_q.forEach((q, i) => {
              const name = dhJoints[i]?.name
              if (name) joint_targets[name] = q
            })
            await brainPost('/move/joint', { machine_id: machineId, joint_targets })
          } catch {
            // IK failed (unreachable) — skip this frame
          }
        }
      } finally {
        ikInFlight.current = false
      }
    },
    [canDrag, machineId, anglesRad, dhJoints, ikHook],
  )

  return (
    <div style={{ height: '100dvh', background: bg.canvas, display: 'flex', flexDirection: 'column' }}>
      <AppToolbar title="Teach" />

      {/* Body: 3D canvas + control panel side-by-side */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 3-D viewport */}
        <div style={{ flex: 1, position: 'relative' }}>
          <AppCanvas
            initialCameraPosition={cameraConfig.position}
            initialCameraTarget={cameraConfig.target}
            orbitEnabled={!isDragging}
          >
            <ArmCanvas
              anglesRad={anglesRad}
              linkLengths={dhJoints.map((j) => j.a)}
              radius={linkRadius}
              dhJoints={dhJoints}
              interactionMode={canDrag ? 'drag' : 'view'}
              onJointDrag={canDrag ? (idx, name, val) => void handleJointDrag(idx, name, val) : undefined}
              onEEDrag={canDrag ? (delta) => void handleEEDrag(delta) : undefined}
              onDragStateChange={canDrag ? setIsDragging : undefined}
            />
          </AppCanvas>
          {canDrag && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)',
              color: accent.default,
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 20,
              pointerEvents: 'none',
            }}>
              Drag joints to pose · Spacebar to capture
            </div>
          )}

          {/* Joint picker — slider per joint, for co-located joints
              (spherical wrist) whose 3D spheres overlap. */}
          {canDrag && dhJoints.length > 0 && (
            <JointPickerOverlay
              joints={dhJoints}
              anglesRad={anglesRad}
              picked={pickedJoint}
              onPick={setPickedJoint}
              onChange={(idx, val) => void handleJointDrag(idx, dhJoints[idx].name, val)}
            />
          )}
        </div>

        {/* Control panel */}
        <div
          style={{
            width: 320,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            borderLeft: `1px solid ${borderColor.dim}`,
          }}
        >
          {/* Mode toggle */}
          <div style={card}>
            <p style={label}>Mode</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={toggleBtn(mode === 'drag', false)}
                onClick={() => setMode('drag')}
              >
                Drag (sim)
              </button>
              <button
                style={toggleBtn(mode === 'live', true)}
                disabled
                title="Live teach requires hardware with SetMode support (Phase 2)"
              >
                Live (hardware)
              </button>
            </div>
          </div>

          {/* Record / Stop control */}
          <div style={card}>
            <p style={label}>Session</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                style={{
                  ...btn(isRecording ? semantic.danger : semantic.ok),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  animation: 'none',
                }}
                className={isRecording ? 'motion-pulse' : undefined}
                onClick={() => void handleRecord()}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isRecording ? semantic.danger : semantic.ok,
                    display: 'inline-block',
                  }}
                />
                {!session || session.status === 'saved' || session.status === 'aborted'
                  ? 'Start'
                  : session.status === 'armed'
                  ? 'Begin Recording'
                  : 'Recording…'}
              </button>

              {isActive && (
                <button
                  style={btn(borderColor.default)}
                  onClick={() => void abort()}
                  title="Discard session"
                >
                  Discard
                </button>
              )}
            </div>

            {error && (
              <p style={{ color: semantic.danger, fontSize: 12, marginTop: 10, margin: '10px 0 0' }}>
                {error}
              </p>
            )}
          </div>

          {/* Capture */}
          {canCapture && (
            <div style={card}>
              <p style={label}>Capture waypoint</p>
              <button
                style={{ ...btn(accent.default), width: '100%' }}
                onClick={() => void capture()}
              >
                📍 Capture  <span style={{ opacity: 0.6, fontSize: 11 }}>(or Spacebar)</span>
              </button>
            </div>
          )}

          {/* Waypoint list */}
          {(session?.waypoints.length ?? 0) > 0 && (
            <div style={card}>
              <p style={label}>Waypoints ({session!.waypoints.length})</p>
              <div>
                {session!.waypoints.map((wp, i) => (
                  <WaypointRow
                    key={wp.captured_at + i}
                    waypoint={wp}
                    index={i}
                    onDelete={() => void deleteWaypoint(i)}
                  />
                ))}
              </div>

              {canSave && (
                <button
                  style={{ ...btn(accent.default), width: '100%', marginTop: 12 }}
                  onClick={() => setShowSave(true)}
                >
                  Save as Program →
                </button>
              )}
            </div>
          )}

          {/* Saved confirmation */}
          {session?.status === 'saved' && session.program_id && (
            <div style={{ ...card, borderColor: semantic.ok, background: bg.surfaceRaised }}>
              <p style={{ color: semantic.ok, fontSize: 13, margin: 0 }}>
                ✓ Saved! <button
                  style={{ background: 'none', border: 'none', color: semantic.ok, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                  onClick={() => navigate('/programs')}
                >Go to Programs</button>
              </p>
            </div>
          )}
        </div>
      </div>

      {showSave && (
        <SaveDialog onSave={(n) => void handleSave(n)} onCancel={() => setShowSave(false)} />
      )}
    </div>
  )
}
