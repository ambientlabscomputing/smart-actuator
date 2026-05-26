/**
 * Typography — thin shim over MUI Typography.
 *
 * This is one of the ONLY files in the project that imports @mui/material.
 * All other files that need text elements must import from '@/components'.
 */
import { Typography as MuiTypography } from '@mui/material'
import type { TypographyProps as MuiTypographyProps } from '@mui/material'
import type { ReactNode } from 'react'

export interface TypographyProps {
  variant?: MuiTypographyProps['variant']
  color?: MuiTypographyProps['color']
  fontFamily?: string
  children: ReactNode
}

export function Typography({ variant = 'body2', color, fontFamily, children }: TypographyProps) {
  return (
    <MuiTypography variant={variant} color={color} sx={fontFamily ? { fontFamily } : undefined}>
      {children}
    </MuiTypography>
  )
}
