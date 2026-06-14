import { motion as fm } from 'framer-motion'
import { accent, bg, borderColor, semantic, text } from '@/design'
import { motion as motionTokens } from '@/design/motion'

interface LoadingBarProps {
  label?: string
  tone?: 'accent' | 'danger'
}

const toneColors = {
  accent: accent.default,
  danger: semantic.danger,
} as const

export function LoadingBar({ label = 'Loading', tone = 'accent' }: LoadingBarProps) {
  const barColor = toneColors[tone]

  return (
    <div
      aria-label={label}
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            color: text.dim,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: text.faint,
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          …
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          height: 3,
          overflow: 'hidden',
          borderRadius: 999,
          background: bg.surfaceAlt,
          border: `1px solid ${borderColor.dim}`,
        }}
      >
        <fm.div
          style={{
            position: 'absolute',
            inset: 0,
            width: '36%',
            borderRadius: 999,
            background: `linear-gradient(90deg, transparent 0%, ${barColor} 45%, ${barColor} 55%, transparent 100%)`,
            boxShadow: `0 0 16px ${barColor}55`,
          }}
          initial={{ x: '-45%' }}
          animate={{ x: '145%' }}
          transition={{
            duration: motionTokens.duration.indeterminate / 1000,
            ease: motionTokens.ease.indeterminate,
            repeat: Infinity,
          }}
        />
      </div>
    </div>
  )
}
