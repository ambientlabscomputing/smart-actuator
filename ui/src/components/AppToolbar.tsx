/**
 * AppToolbar — global top navigation bar, present on every authenticated page.
 *
 * Left  : hamburger menu → slides open a side navigation drawer.
 * Center: page title ("Jog Actuators").
 * Right : avatar chip with user initials → small user menu (sign out, etc.)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import IconButton from '@mui/material/IconButton'
import Avatar from '@mui/material/Avatar'
import Drawer from '@mui/material/Drawer'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import MenuIcon from '@mui/icons-material/Menu'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import CodeIcon from '@mui/icons-material/Code'
import DataObjectIcon from '@mui/icons-material/DataObject'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import { bg, text, borderColor, accent, semantic } from '@/design'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Side nav contents ─────────────────────────────────────────────────────────

function SideNav({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  function go(path: string) {
    onClose()
    navigate(path)
  }

  return (
    <div
      style={{ width: 240, height: '100%', background: bg.surface, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${borderColor.dim}` }}
      role="presentation"
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 16px 14px',
          borderBottom: `1px solid ${borderColor.dim}`,
        }}
      >
        <SmartToyOutlinedIcon style={{ color: accent.default, fontSize: 18 }} />
        <span style={{ fontFamily: "'Inter', system-ui, sans-serif", color: text.primary, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>
          Smart Actuator
        </span>
      </div>

      <List disablePadding sx={{ flex: 1, padding: '8px 0' }}>
        <ListItemButton
          onClick={() => go('/')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: bg.surfaceAlt } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: accent.default }}>
            <SmartToyOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Jog Actuators"
            slotProps={{ primary: { sx: { color: text.secondary, fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => go('/programs')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: bg.surfaceAlt } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: accent.default }}>
            <CodeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Programs"
            slotProps={{ primary: { sx: { color: text.secondary, fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => go('/gcode')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: bg.surfaceAlt } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: accent.default }}>
            <DataObjectIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="G-code"
            slotProps={{ primary: { sx: { color: text.secondary, fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => go('/teach')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: bg.surfaceAlt } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: accent.default }}>
            <RadioButtonCheckedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Teach"
            slotProps={{ primary: { sx: { color: text.secondary, fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
      </List>

      {/* Footer version hint */}
      <div style={{ padding: '12px 20px', borderTop: `1px solid ${borderColor.dim}` }}>
        <span style={{ color: text.disabled, fontSize: 11 }}>Smart Actuator UI</span>
      </div>
    </div>
  )
}

// ── AppToolbar ────────────────────────────────────────────────────────────────

interface AppToolbarProps {
  title?: string
  /** Optional dim breadcrumb shown below the title, e.g. "2-DOF Planar Arm". */
  subtitle?: string
}

export function AppToolbar({ title = 'Jog Actuators', subtitle }: AppToolbarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null)

  const initials = user ? getInitials(user.name || user.username) : '?'

  function handleSignOut() {
    setUserAnchor(null)
    logout()
    navigate('/login')
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          padding: '0 8px 0 4px',
          background: bg.canvas,
          borderBottom: `1px solid ${borderColor.dim}`,
          zIndex: 100,
          flexShrink: 0,
          userSelect: 'none',
          gap: 8,
        }}
      >
        {/* ── Left: hamburger ─────────────────────────────────── */}
        <Tooltip title="Menu" placement="bottom">
          <IconButton
            onClick={() => setDrawerOpen(true)}
            size="small"
            style={{ color: text.dim, flexShrink: 0 }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* ── Title block (left-aligned, vertically centred) ──── */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              color: text.primary,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.03em',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                color: text.disabled,
                fontSize: 10,
                letterSpacing: '0.04em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* ── Right: user avatar ───────────────────────────────── */}
        <div style={{ flexShrink: 0 }}>
          <Tooltip title={user?.name ?? user?.username ?? 'User'} placement="bottom-end">
            <IconButton
              onClick={(e) => setUserAnchor(e.currentTarget)}
              size="small"
              style={{ padding: 4 }}
            >
              <Avatar
                style={{
                  width: 28,
                  height: 28,
                  fontSize: 11,
                  fontWeight: 700,
                  background: accent.default,
                  color: accent.on,
                }}
              >
                {initials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </div>
      </header>

      {/* ── Side drawer ─────────────────────────────────────────── */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { background: 'transparent', border: 'none', boxShadow: 'none' } } }}
      >
        <SideNav onClose={() => setDrawerOpen(false)} />
      </Drawer>

      {/* ── User menu ────────────────────────────────────────────── */}
      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: {
              background: bg.surfaceRaised,
              border: `1px solid ${borderColor.dim}`,
              borderRadius: '2px',
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            },
          },
        }}
      >
        {/* User info header */}
        <div style={{ padding: '12px 16px 10px' }}>
          <div style={{ color: text.primary, fontSize: 13, fontWeight: 600 }}>
            {user?.name ?? user?.username}
          </div>
          {user?.name && user.username && (
            <div style={{ color: text.faint, fontSize: 11, marginTop: 2 }}>
              @{user.username}
            </div>
          )}
        </div>

        <Divider style={{ borderColor: borderColor.dim, margin: '0 0 4px' }} />

        <MenuItem
          style={{ color: text.dim, fontSize: 13, padding: '8px 16px', gap: 10 }}
          disabled
        >
          <PersonOutlineIcon style={{ fontSize: 16, color: text.faint }} />
          Profile
        </MenuItem>

        <Divider style={{ borderColor: borderColor.dim, margin: '4px 0' }} />

        <MenuItem
          onClick={handleSignOut}
          style={{ color: semantic.danger, fontSize: 13, padding: '8px 16px', gap: 10 }}
        >
          <LogoutIcon style={{ fontSize: 16 }} />
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}

