/**
 * MachineEditor — side-by-side live 3D preview (left) + tabbed editor (right).
 *
 * Tabs:
 *  • Easy   — friendly sliders driven by the template's easy[] alias list.
 *  • Advanced — DH parameter table; each joint row shows all DH fields.
 *               Only fields marked editable=true in the template are inputs.
 *
 * The component is purely controlled: the caller owns DHChainValues state
 * and passes it via props.  onDhChange fires on every edit for live preview.
 */
import React, { useState } from 'react'
import type { DHChainSchema, DHChainValues, DHJointSpec, EasyAlias, Template } from '../lib/types'
import { dhToLinkLengths, readEasyAlias, readEasyAliasSpec, writeEasyAlias, writeDhTarget } from '../lib/dh'
import { AppCanvas } from './AppCanvas'
import { ArmCanvas } from './ArmCanvas'
import { KinematicsTab } from './KinematicsTab'
import { useMachineIK } from '../hooks/useMachineIK'

export interface MachineEditorProps {
  template: Template
  dhValues: DHChainValues
  onDhChange: (next: DHChainValues) => void
  /** If provided, a submit button is rendered with this label. */
  onSubmit?: (values: DHChainValues) => void
  submitLabel?: string
  /** Live or preview joint angles (rad). Defaults to all-zeros. */
  previewAngles?: number[]
  /** Optional error message to display above the submit button. */
  error?: string | null
  /** Slot for caller-supplied action buttons (e.g. Cancel). */
  actionsLeft?: React.ReactNode
  /** Machine ID, needed for the Kinematics tab. */
  machineId?: string | null
  /** Show the Kinematics tab (power-user / advanced mode). Defaults to false. */
  showKinematicsTab?: boolean
}

type Tab = 'easy' | 'advanced' | 'kinematics'

export function MachineEditor({
  template,
  dhValues,
  onDhChange,
  onSubmit,
  submitLabel = 'Apply',
  previewAngles,
  error,
  actionsLeft,
  machineId = null,
  showKinematicsTab = false,
}: MachineEditorProps) {
  const schema = template.dh
  const easy = template.easy ?? []
  const hasEasyAliases = easy.length > 0
  const [activeTab, setActiveTab] = useState<Tab>(hasEasyAliases ? 'easy' : 'advanced')
  const ik = useMachineIK(showKinematicsTab ? machineId : null)
  const nJoints = schema?.joints.length ?? dhValues.joints.length

  // Derive ArmCanvas props from DH values
  const linkLengths = dhToLinkLengths(dhValues)
  const radius = dhValues.link_radius
  const angles = previewAngles ?? Array(nJoints).fill(0)

  return (
    <div style={containerStyle}>
      {/* ── Left: 3D preview ── */}
      <div style={canvasPaneStyle}>
        <AppCanvas>
          <ArmCanvas
            anglesRad={angles}
            linkLengths={linkLengths}
            radius={radius}
            dhJoints={dhValues.joints}
          />
        </AppCanvas>
      </div>

      {/* ── Right: tabbed editor ── */}
      <div style={sliderPaneStyle}>
        {/* Tab header */}
        <div style={tabBarStyle}>
          {hasEasyAliases && (
            <button
              style={tabBtnStyle(activeTab === 'easy')}
              onClick={() => setActiveTab('easy')}
            >
              Easy
            </button>
          )}
          <button
              style={tabBtnStyle(activeTab === 'advanced')}
              onClick={() => setActiveTab('advanced')}
            >
            Advanced
          </button>
          {showKinematicsTab && (
            <button
              style={tabBtnStyle(activeTab === 'kinematics')}
              onClick={() => setActiveTab('kinematics')}
            >
              Kinematics
            </button>
          )}
        </div>

        {/* Tab body */}
        <div style={sliderScrollStyle}>
          {activeTab === 'easy' && (
            <EasyPanel
              easy={easy}
              schema={schema}
              dhValues={dhValues}
              onDhChange={onDhChange}
            />
          )}
          {activeTab === 'advanced' && (
            <AdvancedPanel
              schema={schema}
              dhValues={dhValues}
              onDhChange={onDhChange}
            />
          )}
          {activeTab === 'kinematics' && showKinematicsTab && (
            <KinematicsTab
              machineId={machineId ?? ''}
              machine={ik.machine}
              ik={ik}
            />
          )}
        </div>

        {/* Actions */}
        {(onSubmit || actionsLeft) && (
          <div style={actionsStyle}>
            {actionsLeft}
            {error && <span style={errorStyle}>{error}</span>}
            {onSubmit && (
              <button style={submitBtnStyle} onClick={() => onSubmit(dhValues)}>
                {submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Easy panel ────────────────────────────────────────────────────────────────

function EasyPanel({
  easy,
  schema,
  dhValues,
  onDhChange,
}: {
  easy: EasyAlias[]
  schema: DHChainSchema | undefined
  dhValues: DHChainValues
  onDhChange: (v: DHChainValues) => void
}) {
  if (easy.length === 0) {
    return <p style={emptyStyle}>No easy aliases defined in this template.</p>
  }
  return (
    <>
      {easy.map((alias) => {
        const value = readEasyAlias(dhValues, alias)
        const spec = readEasyAliasSpec(schema, alias)
        const { min, max } = easyRange(alias, spec)
        return (
          <SliderRow
            key={alias.legacy_param}
            label={alias.label}
            description={alias.description}
            unit={alias.unit}
            min={min}
            max={max}
            value={value}
            onChange={(v) => onDhChange(writeEasyAlias(dhValues, alias, v))}
          />
        )
      })}
    </>
  )
}

/**
 * Resolve Easy slider bounds: prefer the template-declared spec min/max;
 * fall back to a unit-based hint when the schema is missing or the field
 * spec doesn't constrain a bound. For limit_symmetric aliases, the lower
 * bound is clamped to 0 (magnitude).
 */
function easyRange(
  alias: EasyAlias,
  spec: import('../lib/types').DHFieldSpec | undefined,
): { min: number; max: number } {
  const hint = unitRangeHint(alias.unit)
  const isSymmetric = alias.target.endsWith('.limit_symmetric')
  const min = isSymmetric ? 0 : spec?.min ?? hint.min
  const max = spec?.max ?? hint.max
  return { min, max }
}

function unitRangeHint(unit: string): { min: number; max: number } {
  if (unit === 'm') return { min: 0.005, max: 2.0 }
  if (unit === 'deg') return { min: 0, max: 360 }
  if (unit === 'kg') return { min: 0.01, max: 20.0 }
  return { min: 0, max: 100 }
}

// ── Advanced panel ────────────────────────────────────────────────────────────

const DH_JOINT_FIELDS: Array<{
  key: keyof import('../lib/types').DHJointValues
  label: string
  unit: string
}> = [
  { key: 'a', label: 'a (link length)', unit: 'm' },
  { key: 'd', label: 'd (offset)', unit: 'm' },
  { key: 'alpha', label: 'α (twist)', unit: 'deg' },
  { key: 'theta_offset', label: 'θ offset', unit: 'deg' },
  { key: 'limit_lower', label: 'Limit lower', unit: 'deg' },
  { key: 'limit_upper', label: 'Limit upper', unit: 'deg' },
  { key: 'mass', label: 'Mass', unit: 'kg' },
]

function AdvancedPanel({
  schema,
  dhValues,
  onDhChange,
}: {
  schema: DHChainSchema | undefined
  dhValues: DHChainValues
  onDhChange: (v: DHChainValues) => void
}) {
  return (
    <>
      {/* Shared: link radius */}
      <div style={advSectionStyle}>Shared geometry</div>
      <AdvancedRow
        label="Link radius"
        unit="m"
        value={dhValues.link_radius}
        spec={schema?.link_radius}
        onChange={(v) => onDhChange(writeDhTarget(dhValues, 'link_radius', v))}
      />

      {/* Per-joint rows */}
      {dhValues.joints.map((jv, idx) => {
        const js: DHJointSpec | undefined = schema?.joints[idx]
        return (
          <div key={jv.name} style={jointBlockStyle}>
            <div style={advSectionStyle}>Joint {idx}: {jv.name}</div>
            {DH_JOINT_FIELDS.map(({ key, label, unit }) => {
              const fieldSpec = js?.[key as keyof DHJointSpec] as import('../lib/types').DHFieldSpec | undefined
              const editable = fieldSpec?.editable ?? true
              // Prefer the unit declared in the template schema; fall back to
              // the hardcoded default. This lets prismatic joints show "m" for
              // their travel limits while revolute joints show "deg".
              const displayUnit = fieldSpec?.unit ?? unit
              return (
                <AdvancedRow
                  key={key}
                  label={label}
                  unit={displayUnit}
                  value={jv[key] as number}
                  spec={fieldSpec}
                  readOnly={!editable}
                  onChange={(v) =>
                    onDhChange(writeDhTarget(dhValues, `joints[${idx}].${key}`, v))
                  }
                />
              )
            })}
          </div>
        )
      })}
    </>
  )
}

function AdvancedRow({
  label,
  unit,
  value,
  spec,
  readOnly = false,
  onChange,
}: {
  label: string
  unit: string
  value: number
  spec?: import('../lib/types').DHFieldSpec
  readOnly?: boolean
  onChange: (v: number) => void
}) {
  const decimals = unit === 'm' ? 4 : unit === 'deg' ? 2 : 3

  return (
    <div style={advRowStyle}>
      <span style={advLabelStyle}>{label}</span>
      <div style={advInputGroupStyle}>
        <input
          type="number"
          step={unit === 'm' ? 0.001 : unit === 'deg' ? 0.5 : 0.01}
          min={spec?.min}
          max={spec?.max}
          value={value.toFixed(decimals)}
          readOnly={readOnly}
          disabled={readOnly}
          style={readOnly ? advInputReadOnlyStyle : advInputStyle}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(v)
          }}
        />
        <span style={unitStyle}>{unit}</span>
      </div>
    </div>
  )
}

// ── Shared slider row (Easy tab) ──────────────────────────────────────────────

function SliderRow({
  label,
  description,
  unit,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  description?: string
  unit: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  const step = (max - min) / 200
  return (
    <div style={rowStyle}>
      <div style={rowLabelColStyle}>
        <span style={labelStyle}>{label}</span>
        {description && <span style={descStyle}>{description}</span>}
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
          <span style={readoutStyle}>{formatValue(value, unit)}</span>
          {unit && <span style={unitStyle}>{unit}</span>}
        </div>
      </div>
    </div>
  )
}

function formatValue(v: number, unit: string): string {
  if (unit === 'm') return v.toFixed(3)
  if (unit === 'deg') return v.toFixed(1)
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
  width: 340,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#1a1a1a',
  borderLeft: '1px solid #333',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #333',
  flexShrink: 0,
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 0',
  background: active ? '#2563eb' : 'transparent',
  color: active ? '#fff' : '#9ca3af',
  border: 'none',
  borderBottom: active ? '2px solid #60a5fa' : '2px solid transparent',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  transition: 'background 0.15s',
})

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

const emptyStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 12,
  textAlign: 'center',
  marginTop: 24,
}

// Advanced panel styles
const advSectionStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: 4,
  marginBottom: 2,
}

const jointBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  paddingTop: 8,
  borderTop: '1px solid #2a2a2a',
}

const advRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const advLabelStyle: React.CSSProperties = {
  color: '#d1d5db',
  fontSize: 12,
  flex: 1,
  minWidth: 0,
}

const advInputGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const advInputStyle: React.CSSProperties = {
  width: 80,
  background: '#111',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#fff',
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '3px 6px',
  textAlign: 'right',
}

const advInputReadOnlyStyle: React.CSSProperties = {
  ...advInputStyle,
  color: '#6b7280',
  borderColor: '#2a2a2a',
  cursor: 'not-allowed',
}
