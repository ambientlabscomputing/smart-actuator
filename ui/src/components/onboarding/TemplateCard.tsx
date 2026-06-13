/**
 * TemplateCard — one selectable card in the onboarding template picker.
 *
 * A live procedural thumbnail (auto-rotating on hover/selection) over the
 * template's name, joint count, and one-line summary.  Selection lights the
 * card border in the accent colour.
 */
import { useState } from 'react'
import { TemplateThumbnail } from './TemplateThumbnail'
import type { Template } from '../../lib/types'
import { accent, bg, borderColor, text } from '@/design'

interface TemplateCardProps {
  template: Template
  selected?: boolean
  onSelect: (t: Template) => void
}

const THUMB_H = 172

export function TemplateCard({ template, selected = false, onSelect }: TemplateCardProps) {
  const [hovered, setHovered] = useState(false)
  const active = hovered || selected
  const jointCount = template.joints?.length ?? template.dh?.joints.length ?? 0

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        padding: 0,
        background: bg.surface,
        border: `1px solid ${selected ? accent.default : hovered ? borderColor.focus : borderColor.default}`,
        boxShadow: selected
          ? `0 0 0 1px ${accent.default}, 0 4px 20px rgba(0,0,0,0.45)`
          : hovered
            ? '0 4px 16px rgba(0,0,0,0.40)'
            : '0 1px 4px rgba(0,0,0,0.25)',
        borderRadius: 2,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.12s',
        transform: hovered && !selected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Thumbnail viewport with a subtle bottom vignette so the metadata
          label reads against any background colour from the 3-D scene. */}
      <div style={{ position: 'relative', width: '100%', height: THUMB_H, background: bg.canvas, flexShrink: 0 }}>
        <TemplateThumbnail template={template} active={active} width={240} height={THUMB_H} />
        {/* Bottom fade — helps text below pop without a hard borderline */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(to bottom, transparent, ${bg.surface}bb)`,
            pointerEvents: 'none',
          }}
        />
        {/* DOF badge pinned to the thumbnail top-right */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: selected ? accent.on : text.dim,
            background: selected ? accent.default : `${bg.canvas}cc`,
            border: `1px solid ${selected ? accent.default : borderColor.dim}`,
            padding: '2px 6px',
            backdropFilter: 'blur(4px)',
          }}
        >
          {jointCount} DOF
        </div>
      </div>

      <div
        style={{
          padding: '10px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          background: selected ? `${accent.default}0d` : undefined,
          borderTop: `1px solid ${selected ? `${accent.default}44` : borderColor.dim}`,
        }}
      >
        <span
          style={{
            color: selected ? accent.default : text.primary,
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.01em',
          }}
        >
          {template.name}
        </span>
        <span
          style={{
            color: text.faint,
            fontSize: 11,
            lineHeight: 1.45,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {template.summary}
        </span>
      </div>
    </button>
  )
}
