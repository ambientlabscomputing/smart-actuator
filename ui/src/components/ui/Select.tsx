/**
 * Select — styled native <select>. Square edges, hairline border, monospace.
 *
 * Usage:
 *   <Select value={step} onChange={e => setStep(Number(e.target.value))}>
 *     {STEP_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
 *   </Select>
 */
import type React from 'react'
import { fontStacks, fontSize } from '../../design/typography'
import { radius } from '../../design/chrome'
import { bg, borderColor, text } from '../../design/neutrals'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Display value in monospace (default: true — most selects pick numeric steps). */
  mono?: boolean
}

export function Select({ mono = true, style, ...rest }: SelectProps) {
  return (
    <select
      style={{
        fontFamily: mono ? fontStacks.mono : fontStacks.sans,
        fontSize: fontSize.label,
        background: bg.surface,
        border: `1px solid ${borderColor.default}`,
        borderRadius: radius.control,
        color: text.secondary,
        padding: '3px 6px',
        cursor: 'pointer',
        outline: 'none',
        appearance: 'none',
        WebkitAppearance: 'none',
        ...style,
      }}
      {...rest}
    />
  )
}
