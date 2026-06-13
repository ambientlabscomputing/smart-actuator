/**
 * LoginScreen — the public login page.
 *
 * Calls useAuth().login() and navigates to the originally requested route on
 * success. If the user is already authed, redirects to /.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { bg, text, borderColor, accent, semantic } from '@/design'
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
    '& .MuiInputBase-input': { color: text.primary },
    '& .MuiInputLabel-root': { color: text.dim },
    '& .MuiInputLabel-root.Mui-focused': { color: accent.default },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: text.disabled },
    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: text.faint },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: semantic.info },
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: bg.canvas,
      }}
    >
      <Card sx={{ width: 360, background: bg.surfaceRaised, border: `1px solid ${borderColor.default}` }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ color: text.primary, mb: 3, fontWeight: 600 }}>
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
