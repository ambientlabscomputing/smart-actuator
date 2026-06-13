/**
 * Card — surface container with a hairline border and square edges.
 *
 * TE discipline: no drop shadows on 2D chrome. Elevation is expressed
 * through border contrast, not shadow blur.
 *
 * Usage:
 *   <Card>…content…</Card>
 *   <Card padding="lg" style={{ gap: 8 }}>…</Card>
 */
import type React from 'react'
import { space } from '../../design/chrome'
import { bg, borderColor } from '../../design/neutrals'
import { radius, elevation } from '../../design/chrome'

type PaddingKey = keyof typeof space

interface CardProps {
  children: React.ReactNode
  /** Inner padding preset. Defaults to 'md' (12px). */
  padding?: PaddingKey
  /** Use the subtle popover shadow (for on-canvas overlays). Default: none. */
  floating?: boolean
  style?: React.CSSProperties
  className?: string
}

export function Card({
  children,
  padding = 'md',
  floating = false,
  style,
  className,
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: bg.surface,
        border: `1px solid ${borderColor.default}`,
        borderRadius: radius.card,
        padding: space[padding],
        boxShadow: floating ? elevation.popover : elevation.none,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
