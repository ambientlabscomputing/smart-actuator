import { Box } from '@mui/material'
import { LoadingBar } from './LoadingBar'

export function LoadingScreen() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        px: 3,
      }}
    >
      <Box sx={{ width: 'min(360px, 100%)' }}>
        <LoadingBar label="Loading workspace" />
      </Box>
    </Box>
  )
}
