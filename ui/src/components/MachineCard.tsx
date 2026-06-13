import { useMemo, useState } from 'react'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import type { DHJointValues } from '../lib/types'
import type { JointState } from '../hooks/useJointState'
import { JointDetailPopover } from './JointDetailPopover'
import { MachineSilhouette } from './MachineSilhouette'
import { accent, bg, borderColor, colorForMode, semantic, text } from '@/design'

interface MachineCardProps {
  machineId: string
  templateName: string | null
  mode: string
  connected: boolean
  dhJoints: DHJointValues[] | null
  measured: JointState[]
  jointOrigins: [number, number, number][]
  ee: [number, number, number] | null
  onSelectJoint?: (index: number) => void
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function jointRatio(dh: DHJointValues | null, state: JointState | null): number {
  if (!dh || !state) return 0
  const isPrismatic = (dh.type ?? state.type ?? 'revolute') === 'prismatic'
  const current = isPrismatic ? state.position : (state.position * 180) / Math.PI
  const low = dh.limit_lower
  const high = dh.limit_upper
  const denom = high - low
  if (Math.abs(denom) < 1e-9) return 0.5
  return clamp01((current - low) / denom)
}

export function MachineCard({
  machineId,
  templateName,
  mode,
  connected,
  dhJoints,
  measured,
  jointOrigins,
  ee,
  onSelectJoint,
}: MachineCardProps) {
  const [detailAnchorEl, setDetailAnchorEl] = useState<HTMLElement | null>(null)
  const [detailIndex, setDetailIndex] = useState<number | null>(null)

  const measuredByName = useMemo(() => {
    const m = new Map<string, JointState>()
    for (const joint of measured) m.set(joint.joint_name, joint)
    return m
  }, [measured])

  const rows = (dhJoints && dhJoints.length > 0)
    ? dhJoints.map((j, i) => ({
        key: `${j.slot}-${j.name}`,
        index: i,
        name: j.name,
        slot: j.slot,
        type: j.type ?? 'revolute',
        dh: j,
        state: measuredByName.get(j.name) ?? measured[i] ?? null,
      }))
    : measured.map((j, i) => ({
        key: `${i}-${j.joint_name}`,
        index: i,
        name: j.joint_name,
        slot: i,
        type: j.type ?? 'revolute',
        dh: null,
        state: j,
      }))

  function openDetails(index: number, el: HTMLElement) {
    onSelectJoint?.(index)
    setDetailIndex(index)
    setDetailAnchorEl(el)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        zIndex: 30,
        width: 302,
        background: bg.surfaceRaised,
        border: `1px solid ${borderColor.default}`,
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        padding: '10px 10px 8px',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: text.primary, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {machineId}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span
              style={{
                fontSize: 10,
                color: text.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                border: `1px solid ${borderColor.default}`,
                padding: '1px 4px',
              }}
            >
              {(templateName ?? 'Template').toUpperCase()}
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connected ? semantic.ok : text.disabled,
                boxShadow: connected ? `0 0 6px ${semantic.ok}` : 'none',
              }}
              title={connected ? 'Connected' : 'Offline'}
            />
          </div>
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: mode === 'run' || mode === 'teach' ? accent.on : text.secondary,
            background: mode === 'run' || mode === 'teach' ? colorForMode(mode) : bg.surfaceAlt,
            border: `1px solid ${borderColor.default}`,
            padding: '3px 6px',
          }}
        >
          {(mode || 'offline').toUpperCase()}
        </span>
      </div>

      <MachineSilhouette joints={dhJoints ?? []} jointOrigins={jointOrigins} ee={ee} />

      <div style={{ marginTop: 8 }}>
        {rows.map((row) => {
          const ratio = jointRatio(row.dh, row.state)
          const isPrismatic = row.type === 'prismatic'
          const hasFault = !!row.state?.fault
          return (
            <button
              key={row.key}
              onClick={(e) => openDetails(row.index, e.currentTarget)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 4,
                padding: '4px 4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  minWidth: 20,
                  color: text.faint,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(row.slot).padStart(2, '0')}
              </span>
              {isPrismatic
                ? <SwapHorizIcon style={{ color: text.dim, fontSize: 14 }} />
                : <AutorenewIcon style={{ color: text.dim, fontSize: 14 }} />}
              <span style={{ minWidth: 78, color: text.secondary, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </span>

              <span
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 99,
                  background: bg.surface,
                  border: `1px solid ${borderColor.dim}`,
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: `${(ratio * 100).toFixed(1)}%`,
                    top: -3,
                    width: 2,
                    height: 11,
                    marginLeft: -1,
                    borderRadius: 1,
                    background: hasFault ? semantic.danger : accent.default,
                  }}
                />
              </span>
            </button>
          )
        })}
      </div>

      <JointDetailPopover
        anchorEl={detailAnchorEl}
        open={detailIndex !== null && Boolean(detailAnchorEl)}
        onClose={() => {
          setDetailIndex(null)
          setDetailAnchorEl(null)
        }}
        joint={detailIndex !== null ? rows[detailIndex]?.state ?? null : null}
        dhJoint={detailIndex !== null ? rows[detailIndex]?.dh ?? null : null}
      />
    </div>
  )
}
