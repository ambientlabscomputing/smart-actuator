/**
 * Stack — thin shim over MUI Stack.
 *
 * This is one of the ONLY files in the project that imports @mui/material.
 * All other files that need a Stack must import from '@/components'.
 */
import { Stack as MuiStack } from '@mui/material'
import type { StackProps as MuiStackProps } from '@mui/material'
import type { CSSProperties, ReactNode } from 'react'

export interface StackProps {
  direction?: MuiStackProps['direction']
  spacing?: number
  // MUI v9: alignItems/justifyContent are not direct Stack props — passed via sx
  alignItems?: CSSProperties['alignItems']
  justifyContent?: CSSProperties['justifyContent']
  sx?: MuiStackProps['sx']
  children: ReactNode
}

export function Stack({
  direction = 'column',
  spacing = 1,
  alignItems,
  justifyContent,
  sx,
  children,
}: StackProps) {
  return (
    <MuiStack
      direction={direction}
      spacing={spacing}
      sx={{ alignItems, justifyContent, ...sx }}
    >
      {children}
    </MuiStack>
  )
}
