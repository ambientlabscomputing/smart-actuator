/**
 * StatusBadge — connected / disconnected indicator.
 *
 * Composed entirely from components in this folder; no direct visual-library
 * imports.
 */
import { Stack } from './Stack'
import { Typography } from './Typography'
import { semantic } from '@/design'

interface StatusBadgeProps {
  connected: boolean
}

export function StatusBadge({ connected }: StatusBadgeProps) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: connected ? semantic.ok : semantic.danger,
          flexShrink: 0,
        }}
      />
      <Typography variant="caption" color={connected ? 'success.main' : 'error.main'}>
        {connected ? 'Live' : 'Disconnected'}
      </Typography>
    </Stack>
  )
}
