/**
 * WorkspaceMenu — floating on-canvas tool palette (Photoshop / CAD style).
 *
 * Sits over the 3-D canvas in the top-left corner.  All actions are icon
 * buttons with tooltips; no text labels.  Jog controls appear in a compact
 * popover anchored to the jog icon button.
 *
 * Props mirror the old AppToolbar to keep the call-site diff minimal.
 */
import React, { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import Popover from '@mui/material/Popover'

import ReportIcon from '@mui/icons-material/Report'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TuneIcon from '@mui/icons-material/Tune'
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay'
import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import GamepadIcon from '@mui/icons-material/Gamepad'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import BlurOnIcon from '@mui/icons-material/BlurOn'
import OpenWithIcon from '@mui/icons-material/OpenWith'

import { CartesianJogPanel } from './CartesianJogPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap any accumulated angle into the -180 … 180 range. */
function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

function modeColor(mode: string): string {
  switch (mode) {
    case 'idle':
    case 'manual':
      return '#22c55e'
    case 'estopped':
    case 'fault':
      return '#ef4444'
    case 'run':
      return '#3b82f6'
    default:
      return '#6b7280'
  }
}

const JOG_STEP_DEG = 5

// ── Shared icon button style ──────────────────────────────────────────────────

function toolBtn(color?: string): React.CSSProperties {
  return { color: color ?? '#9ca3af', padding: 7 }
}

// ── WorkspaceMenu ─────────────────────────────────────────────────────────────

interface WorkspaceMenuProps {
  mode: string
  connected: boolean
  joints: string[]
  jointDegrees: Record<string, number>
  onJog: (jointName: string, deltaDeg: number) => Promise<void>
  onEstop: () => Promise<void>
  onResume: () => Promise<void>
  onEdit?: () => void
  onPrograms?: () => void
  programsActive?: boolean
  showWorkspace?: boolean
  onToggleWorkspace?: () => void
  // ── Cartesian jog (optional; only shown when machineId is provided) ─────
  machineId?: string | null
  /** Joint names in chain order, e.g. ['shoulder', 'elbow']. */
  jointNamesOrdered?: string[]
  /** Current measured joint angles, radians, in chain order. */
  currentQRad?: number[]
  /** Current EE position from FK, metres, in world frame. */
  currentEE?: [number, number, number] | null
}

export function WorkspaceMenu({
  mode,
  connected,
  joints,
  jointDegrees,
  onJog,
  onEstop,
  onResume,
  onEdit,
  onPrograms,
  programsActive,
  showWorkspace,
  onToggleWorkspace,
  machineId,
  jointNamesOrdered,
  currentQRad,
  currentEE,
}: WorkspaceMenuProps) {
  const [busy, setBusy] = useState(false)
  const [jogAnchor, setJogAnchor] = useState<null | HTMLElement>(null)
  const [cartesianAnchor, setCartesianAnchor] = useState<null | HTMLElement>(null)

  const isEstopped = mode === 'estopped'
  const isDisabled = mode === 'offline' || isEstopped || busy

  async function handleEstop() {
    if (isEstopped || busy) return
    setBusy(true)
    try { await onEstop() } finally { setBusy(false) }
  }

  async function handleResume() {
    if (!isEstopped || busy) return
    setBusy(true)
    try { await onResume() } finally { setBusy(false) }
  }

  async function handleJog(jointName: string, delta: number) {
    if (isDisabled) return
    setBusy(true)
    try { await onJog(jointName, delta) } finally { setBusy(false) }
  }

  return (
    <>
      {/* ── Floating palette ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 20,
          background: 'rgba(13, 13, 13, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #1f2937',
          borderRadius: 10,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '6px 0',
          gap: 0,
          minWidth: 44,
          userSelect: 'none',
        }}
      >
        {/* Mode pill ─────────────────────────────────────────────────────── */}
        <Tooltip title={`Mode: ${mode || 'offline'}`} placement="right">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: modeColor(mode),
              margin: '6px 0',
              boxShadow: `0 0 6px ${modeColor(mode)}88`,
              flexShrink: 0,
            }}
          />
        </Tooltip>

        <Divider flexItem style={{ borderColor: '#1f2937' }} />

        {/* E-Stop ─────────────────────────────────────────────────────────── */}
        <Tooltip title={isEstopped ? 'Estopped' : 'Emergency Stop  (Space)'} placement="right">
          <span>
            <IconButton
              onClick={handleEstop}
              disabled={isEstopped || busy}
              style={{
                ...toolBtn(isEstopped ? '#7f1d1d' : '#ef4444'),
                opacity: isEstopped ? 0.5 : 1,
              }}
              size="small"
            >
              <ReportIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Resume (only when estopped) ─────────────────────────────────────── */}
        {isEstopped && (
          <Tooltip title="Resume" placement="right">
            <span>
              <IconButton
                onClick={handleResume}
                disabled={busy}
                style={toolBtn('#22c55e')}
                size="small"
              >
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Divider flexItem style={{ borderColor: '#1f2937', margin: '2px 0' }} />

        {/* Jog controls popover trigger ────────────────────────────────────── */}
        <Tooltip title="Jog joints" placement="right">
          <span>
            <IconButton
              onClick={(e) => setJogAnchor(jogAnchor ? null : e.currentTarget)}
              disabled={isDisabled}
              style={{
                ...toolBtn(jogAnchor ? '#60a5fa' : undefined),
                background: jogAnchor ? 'rgba(37,99,235,0.2)' : 'transparent',
              }}
              size="small"
            >
              <GamepadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Cartesian jog popover trigger ──────────────────────────────────── */}
        {machineId && (
          <Tooltip title="Cartesian jog (XYZ)" placement="right">
            <span>
              <IconButton
                onClick={(e) => setCartesianAnchor(cartesianAnchor ? null : e.currentTarget)}
                disabled={isDisabled}
                style={{
                  ...toolBtn(cartesianAnchor ? '#fbbf24' : undefined),
                  background: cartesianAnchor ? 'rgba(251,191,36,0.18)' : 'transparent',
                }}
                size="small"
              >
                <OpenWithIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Edit machine ───────────────────────────────────────────────────── */}
        {onEdit && (
          <Tooltip title="Edit machine" placement="right">
            <IconButton onClick={onEdit} style={toolBtn()} size="small">
              <TuneIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Programs ───────────────────────────────────────────────────────── */}
        {onPrograms && (
          <Tooltip title="Programs" placement="right">
            <IconButton
              onClick={onPrograms}
              style={{
                ...toolBtn(programsActive ? '#60a5fa' : undefined),
                background: programsActive ? 'rgba(37,99,235,0.2)' : 'transparent',
              }}
              size="small"
            >
              <PlaylistPlayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Workspace overlay toggle ────────────────────────────────────────── */}
        {onToggleWorkspace && (
          <Tooltip title={showWorkspace ? 'Hide workspace' : 'Show workspace'} placement="right">
            <IconButton
              onClick={onToggleWorkspace}
              style={{
                ...toolBtn(showWorkspace ? '#a78bfa' : undefined),
                background: showWorkspace ? 'rgba(124,58,237,0.2)' : 'transparent',
              }}
              size="small"
            >
              <BlurOnIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Divider flexItem style={{ borderColor: '#1f2937', margin: '2px 0' }} />

        {/* Connection status ───────────────────────────────────────────────── */}
        <Tooltip title={connected ? 'Live' : 'Offline'} placement="right">
          <div style={{ padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {connected
              ? <WifiIcon style={{ fontSize: 18, color: '#22c55e' }} />
              : <WifiOffIcon style={{ fontSize: 18, color: '#6b7280' }} />}
          </div>
        </Tooltip>
      </div>

      {/* ── Jog popover ──────────────────────────────────────────────────── */}
      <Popover
        open={Boolean(jogAnchor)}
        anchorEl={jogAnchor}
        onClose={() => setJogAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        marginThreshold={8}
        slotProps={{
          paper: {
            sx: {
              background: 'rgba(13,13,13,0.96)',
              border: '1px solid #1f2937',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              padding: '10px 12px',
              minWidth: 220,
              backdropFilter: 'blur(8px)',
            },
          },
        }}
      >
        <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Jog  ·  {JOG_STEP_DEG}° / step
        </div>

        {joints.length === 0 && (
          <div style={{ color: '#4b5563', fontSize: 12, padding: '4px 0' }}>No joints</div>
        )}

        {joints.map((joint) => {
          const deg = normalizeDeg(jointDegrees[joint] ?? 0).toFixed(1)
          return (
            <div
              key={joint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 0',
              }}
            >
              {/* Joint name */}
              <span
                style={{
                  color: '#9ca3af',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  minWidth: 72,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {joint}
              </span>

              {/* − button */}
              <Tooltip title={`−${JOG_STEP_DEG}°`} placement="top">
                <span>
                  <IconButton
                    onClick={() => void handleJog(joint, -JOG_STEP_DEG)}
                    disabled={isDisabled}
                    size="small"
                    style={{ padding: 3, color: isDisabled ? '#374151' : '#9ca3af' }}
                  >
                    <ChevronLeftIcon style={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* Current angle */}
              <span
                style={{
                  color: '#e5e7eb',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  minWidth: 52,
                  textAlign: 'center',
                }}
              >
                {deg}°
              </span>

              {/* + button */}
              <Tooltip title={`+${JOG_STEP_DEG}°`} placement="top">
                <span>
                  <IconButton
                    onClick={() => void handleJog(joint, JOG_STEP_DEG)}
                    disabled={isDisabled}
                    size="small"
                    style={{ padding: 3, color: isDisabled ? '#374151' : '#9ca3af' }}
                  >
                    <ChevronRightIcon style={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          )
        })}
      </Popover>

      {/* ── Cartesian jog popover ────────────────────────────────────────── */}
      <Popover
        open={Boolean(cartesianAnchor)}
        anchorEl={cartesianAnchor}
        onClose={() => setCartesianAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        marginThreshold={8}
        slotProps={{
          paper: {
            sx: {
              background: 'rgba(13,13,13,0.96)',
              border: '1px solid #1f2937',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              padding: '10px 12px',
              backdropFilter: 'blur(8px)',
            },
          },
        }}
      >
        {machineId && (
          <CartesianJogPanel
            machineId={machineId}
            jointNames={jointNamesOrdered ?? joints}
            currentQRad={currentQRad ?? []}
            currentEE={currentEE ?? null}
            disabled={isDisabled}
          />
        )}
      </Popover>
    </>
  )
}
