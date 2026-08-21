/**
 * ChangePasswordDialog — lets the signed-in user set a new password.
 *
 * Used both for the ordinary "Change password" menu action and to clear the
 * default-credential nudge banner (see AppToolbar).
 */
import { useState } from 'react'
import { bg, text, borderColor, accent, semantic } from '@/design'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'
import { useAuth } from '@/lib/AuthContext'
import { brainPatch } from '@/hooks/useJointState'

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const { user, refreshUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPassword('')
    setConfirm('')
    setError(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !user) return
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await brainPatch(`/users/${user.id}`, { password })
      await refreshUser()
      reset()
      onClose()
    } catch {
      setError('Failed to change password')
    } finally {
      setSubmitting(false)
    }
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
    <Dialog
      open={open}
      onClose={handleClose}
      slotProps={{ paper: { sx: { background: bg.surfaceRaised, border: `1px solid ${borderColor.default}`, width: 360 } } }}
    >
      <DialogTitle sx={{ color: text.primary, fontSize: 15, fontWeight: 600 }}>
        Change password
      </DialogTitle>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <DialogContent sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, fontSize: 13 }}>
              {error}
            </Alert>
          )}
          <TextField
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            required
            autoFocus
            autoComplete="new-password"
            size="small"
            sx={textFieldSx}
            disabled={submitting}
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            fullWidth
            required
            autoComplete="new-password"
            size="small"
            sx={{ ...textFieldSx, mb: 0 }}
            disabled={submitting}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleClose} disabled={submitting} sx={{ color: text.dim }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || !password || !confirm}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
