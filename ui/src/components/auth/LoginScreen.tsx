/**
 * LoginScreen — the public login page.
 *
 * Calls useAuth().login() and navigates to the originally requested route on
 * success. If the user is already authed, redirects to /.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material'
import { useAuth } from '@/lib/AuthContext'

interface LocationState {
  from?: { pathname: string }
}

export function LoginScreen() {
  const { status, error, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/'

  const [username, setUsername] = useState(import.meta.env.DEV ? 'admin' : '')
  const [password, setPassword] = useState(import.meta.env.DEV ? 'admin' : '')
  const [submitting, setSubmitting] = useState(false)

  // Navigate on successful login (also handles already-authed on mount).
  // Must be before any conditional return so the hook is always called.
  useEffect(() => {
    if (status === 'authed') {
      navigate(from, { replace: true })
    }
  }, [status, from, navigate])

  // Render-time redirect (avoids flash when user is already authed).
  if (status === 'authed') {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    await login(username, password)
    setSubmitting(false)
  }

  const textFieldSx = {
    mb: 2,
    '& .MuiInputBase-input': { color: '#f3f4f6' },
    '& .MuiInputLabel-root': { color: '#9ca3af' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#60a5fa' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4b5563' },
    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7280' },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0d0d0d',
      }}
    >
      <Card sx={{ width: 360, background: '#1a1a1a', border: '1px solid #374151' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 3, fontWeight: 600 }}>
            Sign in to Brain
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, fontSize: 13 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              required
              autoComplete="username"
              size="small"
              sx={textFieldSx}
              disabled={submitting}
              slotProps={{ htmlInput: { autoCapitalize: 'none' } }}
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
              autoComplete="current-password"
              size="small"
              sx={{ ...textFieldSx, mb: 3 }}
              disabled={submitting}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting || !username || !password}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
