/**
 * Button — rectangle with a 1px border. TE discipline: no pill shapes, no blur,
 * no gradients.
 *
 * Variants:
 *   primary  — filled accent background (provisionalAccent, replaced in Box 4)
 *   secondary — dim surface fill, default border
 *   ghost    — transparent fill, dim border, dim text
 *   danger   — filled danger red
 *
 * Usage:
 *   <Button onClick={fn}>Save</Button>
 *   <Button variant="ghost" size="sm" onClick={fn}>Cancel</Button>
 *   <Button variant="danger" disabled>Delete</Button>
 */
import type React from 'react'
import { fontStacks, fontWeight, fontSize } from '../../design/typography'
import { radius } from '../../design/chrome'
import { bg, borderColor, text, semantic, provisionalAccent } from '../../design/neutrals'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

function variantStyle(variant: Variant, disabled: boolean): React.CSSProperties {
  if (disabled) {
    return {
      background: bg.surfaceAlt,
      border: `1px solid ${borderColor.default}`,
      color: text.disabled,
      cursor: 'not-allowed',
      opacity: 0.6,
    }
  }
  switch (variant) {
    case 'primary':
      return {
        background: provisionalAccent.default,
        border: `1px solid ${provisionalAccent.default}`,
        color: '#fff',
        cursor: 'pointer',
      }
    case 'secondary':
      return {
        background: bg.surfaceAlt,
        border: `1px solid ${borderColor.default}`,
        color: text.secondary,
        cursor: 'pointer',
      }
    case 'ghost':
      return {
        background: 'transparent',
        border: `1px solid ${borderColor.default}`,
        color: text.dim,
        cursor: 'pointer',
      }
    case 'danger':
      return {
        background: semantic.danger,
        border: `1px solid ${semantic.danger}`,
        color: '#fff',
        cursor: 'pointer',
      }
  }
}

function sizeStyle(size: Size): React.CSSProperties {
  switch (size) {
    case 'sm': return { padding: '3px 8px', fontSize: fontSize.label }
    case 'md': return { padding: '7px 16px', fontSize: fontSize.body }
  }
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Stretch to fill container width. */
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  style,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      style={{
        fontFamily: fontStacks.sans,
        fontWeight: fontWeight.semibold,
        borderRadius: radius.control,
        lineHeight: 1.4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: fullWidth ? '100%' : undefined,
        transition: 'opacity 0.1s',
        ...variantStyle(variant, disabled),
        ...sizeStyle(size),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
