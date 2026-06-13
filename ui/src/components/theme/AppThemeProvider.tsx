/**
 * AppThemeProvider — wraps children in the MUI ThemeProvider + CssBaseline.
 *
 * Lives in the components layer because `@mui/material` imports are restricted
 * to `src/components/**` by the ESLint visual-boundary rule.
 * Import this from `@/components` in main.tsx / any root bootstrap file.
 */
import { ThemeProvider, CssBaseline } from '@mui/material'
import { muiTheme } from './muiTheme'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export function AppThemeProvider({ children }: Props) {
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
