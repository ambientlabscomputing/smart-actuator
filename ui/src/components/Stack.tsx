/**
 * Stack — thin shim over MUI Stack.
 *
 * This is one of the ONLY files in the project that imports @mui/material.
 * All other files that need a Stack must import from '@/components'.
 */
import { Stack as MuiStack } from '@mui/material'
import type { StackProps as MuiStackProps } from '@mui/material'
import type { ReactNode } from 'react'

export interface StackProps {
  direction?: MuiStackProps['direction']
  spacing?: number
  alignItems?: MuiStackProps['alignItems']
  justifyContent?: MuiStackProps['justifyContent']
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
      alignItems={alignItems}
      justifyContent={justifyContent}
      sx={sx}
    >
      {children}
    </MuiStack>
  )
}
