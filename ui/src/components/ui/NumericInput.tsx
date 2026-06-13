/**
 * NumericInput — monospace, tabular-figures, right-aligned number input.
 *
 * Usage:
 *   <NumericInput value={val} step={0.001} onChange={e => setVal(Number(e.target.value))} />
 */
import type React from 'react'
import { fontStacks, fontSize } from '../../design/typography'
import { radius } from '../../design/chrome'
import { bg, borderColor, text } from '../../design/neutrals'

interface NumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Override width (default: '80px'). */
  width?: string | number
}

export function NumericInput({ width = '80px', style, ...rest }: NumericInputProps) {
  return (
    <input
      type="number"
      style={{
        fontFamily: fontStacks.mono,
        fontFeatureSettings: '"tnum" 1',
        fontVariantNumeric: 'tabular-nums',
        fontSize: fontSize.body,
        textAlign: 'right',
        background: bg.surface,
        border: `1px solid ${borderColor.default}`,
        borderRadius: radius.control,
        color: text.primary,
        padding: '3px 6px',
        width,
        outline: 'none',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'textfield',
        ...style,
      }}
      {...rest}
    />
  )
}
