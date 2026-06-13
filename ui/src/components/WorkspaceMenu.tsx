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
import GrainIcon from '@mui/icons-material/Grain'

import { CartesianJogPanel } from './CartesianJogPanel'
import type { DHJointValues } from '../lib/types'
import { bg, text, borderColor, semantic, accent, colorForMode } from '@/design'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap any accumulated angle into the -180 … 180 range. */
function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

const JOG_STEP_DEG = 5
const JOG_STEP_MM = 5

// ── Shared icon button style ──────────────────────────────────────────────────

function toolBtn(color?: string): React.CSSProperties {
  return { color: color ?? text.dim, padding: 5 }
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
  showReachabilityHull?: boolean
  showWorkspaceSamples?: boolean
  onToggleReachability?: () => void
  onToggleWorkspaceSamples?: () => void
  // ── Cartesian jog (optional; only shown when machineId is provided) ─────
  machineId?: string | null
  /** Joint names in chain order, e.g. ['shoulder', 'elbow']. */
  jointNamesOrdered?: string[]
  /** Current measured joint angles, radians, in chain order. */
  currentQRad?: number[]
  /** Current EE position from FK, metres, in world frame. */
  currentEE?: [number, number, number] | null
  /** Current EE orientation from FK as quaternion [x, y, z, w]. */
  currentEEQuat?: [number, number, number, number] | null
  /** DH joint specs — used to detect prismatic joints for unit display. */
  dhJoints?: DHJointValues[]
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
  showReachabilityHull,
  showWorkspaceSamples,
  onToggleReachability,
  onToggleWorkspaceSamples,
  machineId,
  jointNamesOrdered,
  currentQRad,
  currentEE,
  currentEEQuat,
  dhJoints,
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
          background: `${bg.canvas}eb`,
          backdropFilter: 'blur(6px)',
          border: `1px solid ${borderColor.dim}`,
          borderRadius: 3,
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4px 0',
          gap: 0,
          minWidth: 40,
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
              background: colorForMode(mode),
              margin: '6px 0',
              boxShadow: `0 0 6px ${colorForMode(mode)}88`,
              flexShrink: 0,
            }}
          />
        </Tooltip>

        <Divider flexItem style={{ borderColor: borderColor.dim }} />

        {/* E-Stop ─────────────────────────────────────────────────────────── */}
        <Tooltip title={isEstopped ? 'Estopped' : 'Emergency Stop  (Space)'} placement="right">
          <span>
            <IconButton
              onClick={handleEstop}
              disabled={isEstopped || busy}
              style={{
                ...toolBtn(isEstopped ? `${semantic.danger}88` : semantic.danger),
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
                style={toolBtn(semantic.ok)}
                size="small"
              >
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Divider flexItem style={{ borderColor: borderColor.dim, margin: '2px 0' }} />

        {/* Jog controls popover trigger ────────────────────────────────────── */}
        <Tooltip title="Jog joints" placement="right">
          <span>
            <IconButton
              onClick={(e) => setJogAnchor(jogAnchor ? null : e.currentTarget)}
              style={{
                ...toolBtn(jogAnchor ? accent.default : undefined),
                background: jogAnchor ? accent.dim : 'transparent',
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
                  ...toolBtn(cartesianAnchor ? accent.default : undefined),
                  background: cartesianAnchor ? accent.dim : 'transparent',
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
                ...toolBtn(programsActive ? accent.default : undefined),
                background: programsActive ? accent.dim : 'transparent',
              }}
              size="small"
            >
              <PlaylistPlayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Workspace overlay toggle ────────────────────────────────────────── */}
        {onToggleReachability && (
          <Tooltip title={showReachabilityHull ? 'Hide reachability hull' : 'Show reachability hull'} placement="right">
            <IconButton
              onClick={onToggleReachability}
              style={{
                ...toolBtn(showReachabilityHull ? text.primary : undefined),
                background: showReachabilityHull ? bg.surfaceAlt : 'transparent',
              }}
              size="small"
            >
              <BlurOnIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {showReachabilityHull && onToggleWorkspaceSamples && (
          <Tooltip title={showWorkspaceSamples ? 'Hide workspace samples' : 'Show workspace samples'} placement="right">
            <IconButton
              onClick={onToggleWorkspaceSamples}
              style={{
                ...toolBtn(showWorkspaceSamples ? text.primary : text.dim),
                background: showWorkspaceSamples ? bg.surfaceAlt : 'transparent',
              }}
              size="small"
            >
              <GrainIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Divider flexItem style={{ borderColor: borderColor.dim, margin: '2px 0' }} />

        {/* Connection status ───────────────────────────────────────────────── */}
        <Tooltip title={connected ? 'Live' : 'Offline'} placement="right">
          <div style={{ padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {connected
              ? <WifiIcon style={{ fontSize: 18, color: semantic.ok }} />
              : <WifiOffIcon style={{ fontSize: 18, color: text.disabled }} />}
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
              background: `${bg.canvas}f5`,
              border: `1px solid ${borderColor.default}`,
              borderRadius: '3px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              padding: '10px 12px',
              minWidth: 220,
              backdropFilter: 'blur(6px)',
            },
          },
        }}
      >
        <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: text.faint, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Jog  ·  joints
        </div>

        {joints.length === 0 && (
          <div style={{ color: text.disabled, fontSize: 12, padding: '4px 0' }}>No joints</div>
        )}

        {joints.map((joint) => {
          const isPrismatic = dhJoints?.find((j) => j.name === joint)?.type === 'prismatic'
          const displayVal = isPrismatic
            ? (jointDegrees[joint] ?? 0).toFixed(1)   // already stored as mm
            : normalizeDeg(jointDegrees[joint] ?? 0).toFixed(1)
          const unit = isPrismatic ? 'mm' : '°'
          const stepLabel = isPrismatic ? `${JOG_STEP_MM} mm` : `${JOG_STEP_DEG}°`
          // Deltas in SI units (metres for prismatic, radians for revolute)
          const deltaPos = isPrismatic ? JOG_STEP_MM / 1000 : (JOG_STEP_DEG * Math.PI) / 180
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
                  color: text.dim,
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
                  minWidth: 72,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {joint}
              </span>

              {/* − button */}
              <Tooltip title={`−${stepLabel}`} placement="top">
                <span>
                  <IconButton
                    onClick={() => void handleJog(joint, -deltaPos)}
                    disabled={isDisabled}
                    size="small"
                    style={{ padding: 3, color: isDisabled ? borderColor.default : text.dim }}
                  >
                    <ChevronLeftIcon style={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* Current value */}
              <span
                style={{
                  color: text.secondary,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
                  fontFeatureSettings: '"tnum" 1',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 52,
                  textAlign: 'right',
                }}
              >
                {displayVal}{unit}
              </span>

              {/* + button */}
              <Tooltip title={`+${stepLabel}`} placement="top">
                <span>
                  <IconButton
                    onClick={() => void handleJog(joint, deltaPos)}
                    disabled={isDisabled}
                    size="small"
                    style={{ padding: 3, color: isDisabled ? borderColor.default : text.dim }}
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
              background: `${bg.canvas}f5`,
              border: `1px solid ${borderColor.default}`,
              borderRadius: '3px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              padding: '10px 12px',
              backdropFilter: 'blur(6px)',
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
            currentEEQuat={currentEEQuat ?? null}
            disabled={isDisabled}
          />
        )}
      </Popover>
    </>
  )
}
