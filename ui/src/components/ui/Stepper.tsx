/**
 * Stepper — integrated [−  value  +] control.
 *
 * A single bordered group: minus button | monospace value | plus button.
 * The value is display-only (read from `value` prop); the buttons fire
 * `onDecrement` / `onIncrement`. This keeps the jog panel stateless w.r.t.
 * the displayed value — the parent owns the state.
 *
 * Usage:
 *   <Stepper
 *     value="0.0100 m"
 *     onDecrement={() => jog(axis, -step)}
 *     onIncrement={() => jog(axis, +step)}
 *     disabled={busy}
 *   />
 */
import type React from 'react'
import { fontStacks, fontSize, fontWeight } from '../../design/typography'
import { radius } from '../../design/chrome'
import { bg, borderColor, text } from '../../design/neutrals'

interface StepperProps {
  /** Formatted display value (e.g. "0.0100 m" or "15.00 °"). */
  value: string
  onDecrement: () => void
  onIncrement: () => void
  disabled?: boolean
  /** Optional aria-label for accessibility. */
  label?: string
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: 'none',
  color: disabled ? text.disabled : text.dim,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: fontStacks.sans,
  fontSize: 15,
  fontWeight: fontWeight.semibold,
  padding: '0 8px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  userSelect: 'none',
})

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  disabled = false,
  label,
}: StepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        border: `1px solid ${borderColor.default}`,
        borderRadius: radius.control,
        background: bg.surface,
        overflow: 'hidden',
        height: 26,
      }}
    >
      {/* Minus */}
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        style={btnStyle(disabled)}
        aria-label="Decrement"
      >
        −
      </button>

      {/* Value */}
      <span
        style={{
          fontFamily: fontStacks.mono,
          fontFeatureSettings: '"tnum" 1',
          fontVariantNumeric: 'tabular-nums',
          fontSize: fontSize.body,
          color: disabled ? text.disabled : text.primary,
          borderLeft: `1px solid ${borderColor.dim}`,
          borderRight: `1px solid ${borderColor.dim}`,
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          minWidth: 70,
          justifyContent: 'flex-end',
          userSelect: 'none',
        }}
      >
        {value}
      </span>

      {/* Plus */}
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled}
        style={btnStyle(disabled)}
        aria-label="Increment"
      >
        +
      </button>
    </div>
  )
}
