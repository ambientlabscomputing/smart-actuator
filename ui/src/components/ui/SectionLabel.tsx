/**
 * SectionLabel — canonical uppercase section heading.
 *
 * Replaces the copy-pasted `sectionLabel` / `label` style objects
 * spread across CartesianJogPanel, ProgramsPage, GCodePage, etc.
 *
 * Usage:
 *   <SectionLabel>Translation</SectionLabel>
 *   <SectionLabel as="h2" gutterBottom>Saved Programs</SectionLabel>
 */
import type React from 'react'
import { sectionLabelStyle } from '../../design/typography'
import { text } from '../../design/neutrals'

interface SectionLabelProps {
  children: React.ReactNode
  /** HTML element to render. Defaults to 'p'. */
  as?: 'p' | 'span' | 'h2' | 'h3' | 'div'
  /** Add marginBottom: 6px. */
  gutterBottom?: boolean
  style?: React.CSSProperties
  className?: string
}

export function SectionLabel({
  children,
  as: Tag = 'p',
  gutterBottom = false,
  style,
  className,
}: SectionLabelProps) {
  return (
    <Tag
      className={className}
      style={{
        ...sectionLabelStyle,
        color: text.faint,
        margin: 0,
        ...(gutterBottom ? { marginBottom: 6 } : {}),
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}
