import Popover from '@mui/material/Popover'
import type { JointState } from '../hooks/useJointState'
import type { DHJointValues } from '../lib/types'
import { bg, borderColor, semantic, text } from '@/design'

interface JointDetailPopoverProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  joint: JointState | null
  dhJoint: DHJointValues | null
}

function detailRow(label: string, value: string) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 6 }}>
      <span style={{ color: text.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span
        style={{
          color: text.secondary,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function JointDetailPopover({ anchorEl, open, onClose, joint, dhJoint }: JointDetailPopoverProps) {
  const isPrismatic = (joint?.type ?? dhJoint?.type) === 'prismatic'
  const pos = joint
    ? (isPrismatic ? `${(joint.position * 1000).toFixed(2)} mm` : `${((joint.position * 180) / Math.PI).toFixed(2)}°`)
    : '—'
  const vel = joint
    ? (isPrismatic ? `${(joint.velocity * 1000).toFixed(2)} mm/s` : `${joint.velocity.toFixed(3)} rad/s`)
    : '—'
  const current = joint ? `${joint.current_a.toFixed(3)} A` : '—'
  const temp = joint ? `${joint.temperature_c.toFixed(1)} °C` : '—'

  const lower = dhJoint
    ? (isPrismatic ? `${(dhJoint.limit_lower * 1000).toFixed(1)} mm` : `${dhJoint.limit_lower.toFixed(1)}°`)
    : '—'
  const upper = dhJoint
    ? (isPrismatic ? `${(dhJoint.limit_upper * 1000).toFixed(1)} mm` : `${dhJoint.limit_upper.toFixed(1)}°`)
    : '—'

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      marginThreshold={8}
      slotProps={{
        paper: {
          sx: {
            minWidth: 220,
            background: bg.surfaceRaised,
            border: `1px solid ${borderColor.default}`,
            borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            padding: '10px 12px',
          },
        },
      }}
    >
      <div style={{ color: text.primary, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
        {joint?.joint_name ?? dhJoint?.name ?? 'Joint'}
      </div>
      <div style={{ color: text.faint, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {(joint?.type ?? dhJoint?.type ?? 'revolute').toUpperCase()} details
      </div>

      {detailRow('Position', pos)}
      {detailRow('Velocity', vel)}
      {detailRow('Current', current)}
      {detailRow('Temp', temp)}
      {detailRow('Limit low', lower)}
      {detailRow('Limit high', upper)}

      {joint?.fault && (
        <div style={{ marginTop: 8, color: semantic.danger, fontSize: 11, fontWeight: 600 }}>
          FAULT: {joint.fault}
        </div>
      )}
    </Popover>
  )
}
