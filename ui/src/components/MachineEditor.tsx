/**
 * MachineEditor — side-by-side live 3D preview (left) + param sliders (right).
 *
 * Reusable in two contexts:
 *  1. Onboarding wizard "Configure" step (previewAngles = all zeros).
 *  2. Workspace "Edit machine" drawer (previewAngles = live measured angles).
 *
 * The component is purely controlled: call onParamsChange on every slider
 * move for real-time preview; call onSubmit to commit (optional).
 */
import React from 'react'
import type { Template, TemplateParam } from '../lib/types'
import { AppCanvas } from './AppCanvas'
import { ArmCanvas } from './ArmCanvas'

export interface MachineEditorProps {
  template: Template
  params: Record<string, number>
  onParamsChange: (next: Record<string, number>) => void
  /** If provided, a submit button is rendered with this label. */
  onSubmit?: (params: Record<string, number>) => void
  submitLabel?: string
  /** Live or preview joint angles (rad). Defaults to all-zeros. */
  previewAngles?: number[]
  /** Optional error message to display above the submit button. */
  error?: string | null
  /** Slot for caller-supplied action buttons (e.g. Cancel). */
  actionsLeft?: React.ReactNode
}

export function MachineEditor({
  template,
  params,
  onParamsChange,
  onSubmit,
  submitLabel = 'Apply',
  previewAngles,
  error,
  actionsLeft,
}: MachineEditorProps) {
  const paramList = template.parameters ?? []
  const nJoints = template.joints?.length ?? 2

  // Derive canvas props from params
  const linkLengths = Array.from({ length: nJoints }, (_, i) =>
    (params[`link${i}_length_m`] as number | undefined) ?? 0.4,
  )
  const radius = (params['link_radius_m'] as number | undefined) ?? 0.03
  const jointLimitsDeg = Array.from({ length: nJoints }, (_, i) =>
    (params[`joint${i}_limit_deg`] as number | undefined) ?? 180,
  )
  const angles = previewAngles ?? Array(nJoints).fill(0)

  const handleSlider = (name: string, raw: string) => {
    const v = parseFloat(raw)
    if (!isNaN(v)) onParamsChange({ ...params, [name]: v })
  }

  return (
    <div style={containerStyle}>
      {/* ── Left: 3D preview ── */}
      <div style={canvasPaneStyle}>
        <AppCanvas>
          <ArmCanvas
            anglesRad={angles}
            linkLengths={linkLengths}
            radius={radius}
            jointLimitsDeg={jointLimitsDeg}
          />
        </AppCanvas>
      </div>

      {/* ── Right: sliders ── */}
      <div style={sliderPaneStyle}>
        <div style={sliderScrollStyle}>
          {paramList.map((p) => (
            <SliderRow
              key={p.name}
              param={p}
              value={params[p.name] ?? Number(p.default)}
              onChange={(v) => handleSlider(p.name, String(v))}
            />
          ))}
        </div>

        {/* Actions */}
        {(onSubmit || actionsLeft) && (
          <div style={actionsStyle}>
            {actionsLeft}
            {error && <span style={errorStyle}>{error}</span>}
            {onSubmit && (
              <button style={submitBtnStyle} onClick={() => onSubmit(params)}>
                {submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({
  param: p,
  value,
  onChange,
}: {
  param: TemplateParam
  value: number
  onChange: (v: number) => void
}) {
  const min = p.min ?? 0
  const max = p.max ?? 100
  const step = (max - min) / 200

  return (
    <div style={rowStyle}>
      <div style={rowLabelColStyle}>
        <span style={labelStyle}>{p.label}</span>
        {p.description && <span style={descStyle}>{p.description}</span>}
      </div>
      <div style={rowControlColStyle}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={rangeStyle}
        />
        <div style={readoutRowStyle}>
          <span style={readoutStyle}>{formatValue(value, p)}</span>
          {p.unit && <span style={unitStyle}>{p.unit}</span>}
        </div>
      </div>
    </div>
  )
}

function formatValue(v: number, p: TemplateParam): string {
  // Show 3 decimals for metre-scale params, 1 for degrees, 2 for kg
  if (p.unit === 'm') return v.toFixed(3)
  if (p.unit === 'deg') return v.toFixed(1)
  return v.toFixed(2)
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
}

const canvasPaneStyle: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  background: '#111',
}

const sliderPaneStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#1a1a1a',
  borderLeft: '1px solid #333',
}

const sliderScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const actionsStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid #333',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const rowLabelColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const rowControlColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const readoutRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: 13,
  fontWeight: 500,
}

const descStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 11,
  marginBottom: 2,
}

const readoutStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 13,
  fontFamily: 'monospace',
  minWidth: 52,
}

const unitStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 11,
}

const rangeStyle: React.CSSProperties = {
  width: '100%',
  accentColor: '#2563eb',
}

const submitBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: 12,
  flex: 1,
}
