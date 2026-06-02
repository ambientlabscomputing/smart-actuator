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
      style={{ width: 260, height: '100%', background: '#111827', display: 'flex', flexDirection: 'column' }}
      role="presentation"
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '20px 20px 16px',
          borderBottom: '1px solid #1f2937',
        }}
      >
        <SmartToyOutlinedIcon style={{ color: '#3b82f6', fontSize: 22 }} />
        <span style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Smart Actuator
        </span>
      </div>

      <List disablePadding sx={{ flex: 1, padding: '8px 0' }}>
        <ListItemButton
          onClick={() => go('/')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: '#1f2937' } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: '#60a5fa' }}>
            <SmartToyOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Jog Actuators"
            slotProps={{ primary: { sx: { color: '#e5e7eb', fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => go('/programs')}
          sx={{ padding: '10px 20px', borderRadius: 0, '&:hover': { background: '#1f2937' } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: '#60a5fa' }}>
            <CodeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Programs"
            slotProps={{ primary: { sx: { color: '#e5e7eb', fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
      </List>

      {/* Footer version hint */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #1f2937' }}>
        <span style={{ color: '#4b5563', fontSize: 11 }}>Smart Actuator UI</span>
      </div>
    </div>
  )
}

// ── AppToolbar ────────────────────────────────────────────────────────────────

interface AppToolbarProps {
  title?: string
}

export function AppToolbar({ title = 'Jog Actuators' }: AppToolbarProps) {
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
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 52,
          padding: '0 8px',
          background: '#0d0d0d',
          borderBottom: '1px solid #1f2937',
          zIndex: 100,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {/* ── Left: hamburger ─────────────────────────────────── */}
        <Tooltip title="Menu" placement="bottom">
          <IconButton
            onClick={() => setDrawerOpen(true)}
            size="small"
            style={{ color: '#9ca3af' }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* ── Center: page title ───────────────────────────────── */}
        <span
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#f3f4f6',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.02em',
            pointerEvents: 'none',
          }}
        >
          {title}
        </span>

        {/* ── Right: user avatar ───────────────────────────────── */}
        <div style={{ marginLeft: 'auto' }}>
          <Tooltip title={user?.name ?? user?.username ?? 'User'} placement="bottom-end">
            <IconButton
              onClick={(e) => setUserAnchor(e.currentTarget)}
              size="small"
              style={{ padding: 4 }}
            >
              <Avatar
                style={{
                  width: 30,
                  height: 30,
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#2563eb',
                  color: '#fff',
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
              background: '#1a1a2e',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            },
          },
        }}
      >
        {/* User info header */}
        <div style={{ padding: '12px 16px 10px' }}>
          <div style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600 }}>
            {user?.name ?? user?.username}
          </div>
          {user?.name && user.username && (
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
              @{user.username}
            </div>
          )}
        </div>

        <Divider style={{ borderColor: '#1f2937', margin: '0 0 4px' }} />

        <MenuItem
          style={{ color: '#9ca3af', fontSize: 13, padding: '8px 16px', gap: 10 }}
          disabled
        >
          <PersonOutlineIcon style={{ fontSize: 16, color: '#6b7280' }} />
          Profile
        </MenuItem>

        <Divider style={{ borderColor: '#1f2937', margin: '4px 0' }} />

        <MenuItem
          onClick={handleSignOut}
          style={{ color: '#f87171', fontSize: 13, padding: '8px 16px', gap: 10 }}
        >
          <LogoutIcon style={{ fontSize: 16 }} />
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}

