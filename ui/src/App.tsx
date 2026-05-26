import { useEffect } from 'react'
import { AppCanvas, AppToolbar, Joint } from '@/components'
import { useJointState, useMachineControl } from './hooks/useJointState'
import './App.css'

const MACHINE_ID = 'j1'

export default function App() {
  const { state, connected } = useJointState()
  const { jog, estop, resume } = useMachineControl()

  const mode = state?.mode ?? 'offline'
  const angleRad = state?.measured[0]?.angle_rad ?? 0

  // Derive joint names + current degrees from measured state.
  const joints = state?.measured.map((j) => j.joint_name) ?? []
  const jointDegrees: Record<string, number> = {}
  for (const j of state?.measured ?? []) {
    jointDegrees[j.joint_name] = (j.angle_rad * 180) / Math.PI
  }

  // Spacebar → E-stop
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        void estop(MACHINE_ID)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [estop])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Jog toolbar (includes status) */}
      <AppToolbar
        mode={mode}
        connected={connected}
        angleRad={angleRad}
        joints={joints}
        jointDegrees={jointDegrees}
        onJog={(jointName, deltaDeg) =>
          jog(MACHINE_ID, jointName, deltaDeg, jointDegrees[jointName] ?? 0)
        }
        onEstop={() => estop(MACHINE_ID)}
        onResume={() => resume(MACHINE_ID)}
      />

      {/* 3-D canvas */}
      <div style={{ flex: 1 }}>
        <AppCanvas>
          <Joint angleRad={angleRad} />
        </AppCanvas>
      </div>
    </div>
  )
}

