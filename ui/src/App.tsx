import { AppCanvas, Joint, StatusBadge, Stack, Typography } from '@/components'
import { useJointState } from './hooks/useJointState'
import './App.css'

export default function App() {
  const { state, connected } = useJointState()
  const angleRad = state?.measured[0]?.angle_rad ?? 0

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 8,
          padding: '6px 12px',
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <StatusBadge connected={connected} />
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
            joint0: {angleRad.toFixed(3)} rad
          </Typography>
        </Stack>
      </div>

      {/* 3-D canvas */}
      <div style={{ flex: 1 }}>
        <AppCanvas>
          <Joint angleRad={angleRad} />
        </AppCanvas>
      </div>
    </div>
  )
}

