/**
 * OnboardingWizard — three-step flow to configure a new machine.
 *
 * Step 1: Pick a template.
 * Step 2: Configure geometry via the live MachineEditor (sliders + 3D preview).
 * Step 3: Bind each joint slot ("sim" for J3).
 *
 * On completion calls onDone(machineId, params) so the parent can switch to
 * the workspace view.
 */
import React, { useEffect, useRef, useState } from 'react'
import { brainPost, brainGet } from '../../hooks/useJointState'
import { getToken } from '../../lib/authClient'
import type { DHChainValues, Template, TemplateJoint } from '../../lib/types'
import { dhValuesFromSchema } from '../../lib/dh'
import { MachineEditor } from '../MachineEditor'
import { TemplateCard } from './TemplateCard'
import { bg, text, borderColor, accent, semantic } from '@/design'

interface BindingResult {
  machine_id: string
  slot: number
  kind: string
  actuator_id?: string
  address?: string
  pid?: number
}

// ── Step 1: Template picker ───────────────────────────────────────────────────

function TemplatePicker({
  onPick,
}: {
  onPick: (t: Template) => void
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const attemptRef = useRef(0)

  const load = () => {
    attemptRef.current += 1
    const attempt = attemptRef.current
    setLoading(true)
    setErr(null)
    setTemplates(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    fetch('/api/v1/templates', { headers, signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timer)
        if (attempt !== attemptRef.current) return
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const list = (await res.json()) as Template[]
        // Fetch each template's full schema (dh + joints) so cards can render
        // a live thumbnail and report joint counts. Failed fetches fall back
        // to the summary-level template from the list.
        const full = await Promise.all(
          list.map((t) =>
            brainGet(`/templates/${t.template_id}`)
              .then((f) => f as Template)
              .catch(() => t),
          ),
        )
        if (attempt !== attemptRef.current) return
        setTemplates(full)
      })
      .catch((e: unknown) => {
        clearTimeout(timer)
        if (attempt !== attemptRef.current) return
        if (e instanceof DOMException && e.name === 'AbortError') {
          setErr('Request timed out — is Brain running?')
        } else {
          setErr(String(e))
        }
      })
      .finally(() => {
        if (attempt === attemptRef.current) setLoading(false)
      })
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  if (loading) {
    return <p style={hint}>Loading templates…</p>
  }
  if (err) {
    return (
      <div>
        <p style={{ color: semantic.danger }}>Error: {err}</p>
        <button
          style={{ marginTop: 8, background: borderColor.default, border: 'none', borderRadius: 6, color: text.secondary, cursor: 'pointer', padding: '8px 16px', fontSize: 13 }}
          onClick={load}
        >
          Retry
        </button>
      </div>
    )
  }
  if (!templates) {
    return <p style={hint}>Loading templates…</p>
  }
  if (templates.length === 0) {
    return <p style={hint}>No templates found. Check Brain logs.</p>
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ ...heading, marginBottom: 4 }}>Choose a template</h2>
        <p style={{ ...hint, marginBottom: 0 }}>Select a kinematic configuration to get started.</p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {templates.map((t) => (
          <TemplateCard
            key={t.template_id}
            template={t}
            selected={selectedId === t.template_id}
            onSelect={(picked) => {
              setSelectedId(picked.template_id)
              // If the card already holds the full schema, proceed immediately;
              // otherwise fetch it before advancing.
              if (picked.dh) {
                onPick(picked)
              } else {
                void brainGet(`/templates/${picked.template_id}`)
                  .then((full) => onPick(full as Template))
                  .catch((e) => setErr(String(e)))
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Parameter editor (side-by-side live preview + sliders) ──────────
// Rendered inline in the wizard — no local component needed; MachineEditor handles it.
// Rendered inline in the wizard — no local component needed; MachineEditor handles it.

// ── Step 3: Bind joints ───────────────────────────────────────────────────────

type SlotKind = 'sim' | 'hardware'
type HwTransport = 'tcp' | 'serial'

interface HwInput {
  transport: HwTransport
  ip: string
  port: string
  serialPath: string
  baudRate: string
}

function BindingStep({
  machineId,
  joints,
  onDone,
}: {
  machineId: string
  joints: TemplateJoint[]
  onDone: () => void
}) {
  const [results, setResults] = useState<Record<number, BindingResult>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [binding, setBinding] = useState<number | null>(null)
  const [kinds, setKinds] = useState<Record<number, SlotKind>>({})
  const [hwInputs, setHwInputs] = useState<Record<number, HwInput>>({})

  const kindOf = (slot: number): SlotKind => kinds[slot] ?? 'sim'

  const setKind = (slot: number, k: SlotKind) =>
    setKinds((prev) => ({ ...prev, [slot]: k }))

  const setHwField = (slot: number, field: keyof HwInput, val: string) =>
    setHwInputs((prev) => ({
      ...prev,
      [slot]: {
        ...(prev[slot] ?? defaultHw()),
        [field]: val,
      },
    }))

  const defaultHw = (): HwInput => ({
    transport: 'serial',
    ip: '',
    port: '50051',
    serialPath: '',
    baudRate: '921600',
  })

  const bind = async (slot: number) => {
    setBinding(slot)
    setErrors((e) => ({ ...e, [slot]: '' }))
    try {
      const k = kindOf(slot)
      const payload: Record<string, unknown> = { kind: k }
      if (k === 'hardware') {
        const hw = hwInputs[slot] ?? defaultHw()
        if (hw.transport === 'serial') {
          if (!hw.serialPath) {
            setErrors((prev) => ({ ...prev, [slot]: 'Serial path required (e.g. /dev/cu.usbserial-XXXX)' }))
            return
          }
          payload['serial_path'] = hw.serialPath
          payload['baud_rate'] = parseInt(hw.baudRate || '921600', 10)
        } else {
          if (!hw.ip) {
            setErrors((prev) => ({ ...prev, [slot]: 'IP address required for TCP binding' }))
            return
          }
          payload['ip'] = hw.ip
          payload['port'] = parseInt(hw.port || '50051', 10)
        }
      }
      const r = (await brainPost(`/machine/${machineId}/bindings/${slot}`, payload)) as BindingResult
      setResults((prev) => ({ ...prev, [slot]: r }))
    } catch (e) {
      setErrors((prev) => ({ ...prev, [slot]: String(e) }))
    } finally {
      setBinding(null)
    }
  }

  const bindAll = async () => {
    for (const j of joints) {
      if (!results[j.slot]) await bind(j.slot)
    }
  }

  const allBound = joints.every((j) => results[j.slot] !== undefined)

  const kindSummary = joints.map((j) => kindOf(j.slot) === 'hardware' ? 'HW' : 'Sim').join(' / ')

  return (
    <div>
      <h2 style={heading}>Bind joint slots → {kindSummary}</h2>
      <p style={hint}>
        Choose <em>Sim</em> to spawn an <code>actuator-sim</code> process, or <em>Hardware</em> to
        connect a real actuator via USB-CDC (recommended) or TCP/IP.
      </p>
      <div style={slotListStyle}>
        {joints.map((j) => {
          const r = results[j.slot]
          const err = errors[j.slot]
          const k = kindOf(j.slot)
          const hw = hwInputs[j.slot] ?? defaultHw()
          const status = r
            ? (r.pid != null ? `Bound: pid=${r.pid} port=${r.address?.split(':').at(-1)}` : `Bound: ${r.address ?? 'ok'}`)
            : err
              ? err
              : binding === j.slot
                ? (k === 'hardware' ? 'Connecting hardware...' : 'Spawning simulator...')
                : 'Ready'
          const statusStyle: React.CSSProperties = r
            ? slotStatusOkStyle
            : err
              ? slotStatusErrStyle
              : slotStatusPendingStyle
          return (
            <div key={j.slot} style={slotCardStyle}>
              <div style={slotHeaderStyle}>
                <div style={slotTitleStyle}>SLOT {String(j.slot).padStart(2, '0')} · {j.name}</div>
                <span style={{ ...slotStatusStyle, ...statusStyle }}>{status}</span>
              </div>

              {!r && (
                <div style={kindCardRowStyle}>
                  <button
                    style={{ ...kindCardStyle, ...(k === 'sim' ? kindCardSelectedStyle : {}) }}
                    onClick={() => setKind(j.slot, 'sim')}
                  >
                    <div style={kindCardLabelStyle}>Add simulated</div>
                    <div style={kindCardDescStyle}>Spawn actuator-sim for this slot</div>
                  </button>
                  <button
                    style={{ ...kindCardStyle, ...(k === 'hardware' ? kindCardSelectedStyle : {}) }}
                    onClick={() => setKind(j.slot, 'hardware')}
                  >
                    <div style={kindCardLabelStyle}>Onboard real hardware</div>
                    <div style={kindCardDescStyle}>Bind over USB-CDC or TCP/IP</div>
                  </button>
                </div>
              )}

              {!r && k === 'hardware' && (
                <div style={hardwarePanelStyle}>
                  <div style={transportRowStyle}>
                    <button
                      style={{ ...transportBtnStyle, ...(hw.transport === 'serial' ? transportBtnSelectedStyle : {}) }}
                      onClick={() => setHwField(j.slot, 'transport', 'serial')}
                    >
                      USB-CDC
                    </button>
                    <button
                      style={{ ...transportBtnStyle, ...(hw.transport === 'tcp' ? transportBtnSelectedStyle : {}) }}
                      onClick={() => setHwField(j.slot, 'transport', 'tcp')}
                    >
                      TCP/IP
                    </button>
                  </div>
                  {hw.transport === 'serial' ? (
                    <div style={transportInputRowStyle}>
                      <input
                        placeholder="/dev/cu.usbserial-XXXX"
                        value={hw.serialPath}
                        onChange={(e) => setHwField(j.slot, 'serialPath', e.target.value)}
                        style={{ ...ipInput, width: 260 }}
                      />
                      <input
                        placeholder="921600"
                        value={hw.baudRate}
                        onChange={(e) => setHwField(j.slot, 'baudRate', e.target.value)}
                        style={{ ...ipInput, width: 94 }}
                      />
                    </div>
                  ) : (
                    <div style={transportInputRowStyle}>
                      <input
                        placeholder="IP (e.g. 192.168.4.105)"
                        value={hw.ip}
                        onChange={(e) => setHwField(j.slot, 'ip', e.target.value)}
                        style={{ ...ipInput, width: 220 }}
                      />
                      <input
                        placeholder="Port"
                        value={hw.port}
                        onChange={(e) => setHwField(j.slot, 'port', e.target.value)}
                        style={{ ...ipInput, width: 84 }}
                      />
                    </div>
                  )}
                </div>
              )}

              {!r && err && <div style={slotErrorStyle}>{err}</div>}

              {!r && (
                <div style={slotFooterStyle}>
                  <button
                    style={{ ...btn, marginTop: 0, padding: '6px 14px', fontSize: 12 }}
                    disabled={binding !== null}
                    onClick={() => void bind(j.slot)}
                  >
                    Bind slot →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          style={btn}
          disabled={binding !== null || allBound}
          onClick={() => void bindAll()}
        >
          Bind all slots →
        </button>
        {allBound && (
          <button style={{ ...btn, background: semantic.ok }} onClick={onDone}>
            Open workspace →
          </button>
        )}
      </div>
    </div>
  )
}

interface OnboardingWizardProps {
  onDone: (machineId: string, dh: DHChainValues) => void
}

export function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const [step, setStep] = useState<'pick' | 'params' | 'bind'>('pick')
  const [template, setTemplate] = useState<Template | null>(null)
  const [dhValues, setDhValues] = useState<DHChainValues>({ link_radius: 0.03, joints: [] })
  const [machineId, setMachineId] = useState<string | null>(null)
  const [buildErr, setBuildErr] = useState<string | null>(null)

  const onPick = (t: Template) => {
    // Seed DH chain values from template schema defaults
    const initial: DHChainValues = t.dh
      ? dhValuesFromSchema(t.dh)
      : { link_radius: 0.03, joints: [] }
    setDhValues(initial)
    setTemplate(t)
    setStep('params')
  }

  const onCommit = async (dh: DHChainValues) => {
    if (!template) return
    setDhValues(dh)
    setBuildErr(null)
    const mid = `arm-${Date.now()}`
    try {
      await brainPost('/machine', {
        machine_id: mid,
        template_ref: {
          source: 'in-tree',
          template_id: template.template_id,
          version: template.version,
          content_hash: 'in-tree',
          ref: 'in-tree',
        },
        dh_chain: dh,
        parameters: {},
        actuator_bindings: [],
      })
      setMachineId(mid)
      setStep('bind')
    } catch (e) {
      setBuildErr(String(e))
    }
  }

  const joints: TemplateJoint[] = template?.joints ?? []

  // Panel widens on params step for side-by-side layout, and on the pick step
  // to give the template card grid room to breathe.
  const panelStyle: React.CSSProperties =
    step === 'params'
      ? { ...panel, width: 'min(95vw, 1100px)', height: '85vh', padding: 0 }
      : (step === 'pick' || step === 'bind')
        ? { ...panel, width: 'min(92vw, 860px)' }
        : panel

  return (
    <div style={overlay}>
      <div style={panelStyle}>
        {/* Breadcrumb (shown above editor pane with padding) */}
        <div style={{ ...breadcrumb, padding: step === 'params' ? '16px 24px' : '0 0 24px 0' }}>
          <span style={step === 'pick' ? activeCrumb : {}}>1. Template</span>
          <span>›</span>
          <span style={step === 'params' ? activeCrumb : {}}>2. Configure</span>
          <span>›</span>
          <span style={step === 'bind' ? activeCrumb : {}}>3. Bind slots</span>
        </div>

        {/* Step content */}
        <div style={step === 'params' ? { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } : { padding: '0 32px 32px 32px' }}>
          {step === 'pick' && <TemplatePicker onPick={onPick} />}

          {step === 'params' && template && (
            <MachineEditor
              template={template}
              dhValues={dhValues}
              onDhChange={setDhValues}
              onSubmit={(dh) => void onCommit(dh)}
              submitLabel="Build machine →"
              error={buildErr}
              actionsLeft={
                <button style={cancelBtnStyle} onClick={() => setStep('pick')}>
                  ← Back
                </button>
              }
            />
          )}

          {step === 'bind' && machineId && (
            <BindingStep
              machineId={machineId}
              joints={joints}
              onDone={() => onDone(machineId, dhValues)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: bg.canvas,
}

const panel: React.CSSProperties = {
  background: bg.surfaceRaised,
  border: `1px solid ${borderColor.default}`,
  borderRadius: 2,
  padding: 32,
  width: 560,
  maxHeight: '90vh',
  overflowY: 'auto',
  color: text.secondary,
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
}

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  marginBottom: 20,
  letterSpacing: '0.02em',
  color: text.primary,
}

const hint: React.CSSProperties = { color: text.dim, marginBottom: 16, fontSize: 13 }

const breadcrumb: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: text.faint,
  flexShrink: 0,
}

const cancelBtnStyle: React.CSSProperties = {
  background: borderColor.default,
  border: `1px solid ${borderColor.focus}`,
  borderRadius: 2,
  color: text.secondary,
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
}

const btn: React.CSSProperties = {
  background: accent.default,
  border: `1px solid ${accent.dim}`,
  borderRadius: 2,
  color: accent.on,
  cursor: 'pointer',
  marginTop: 16,
  padding: '8px 20px',
  fontSize: 13,
}

const ipInput: React.CSSProperties = {
  background: bg.surfaceRaised,
  border: `1px solid ${borderColor.focus}`,
  borderRadius: 2,
  color: text.secondary,
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '3px 6px',
  width: 150,
}

const slotListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginBottom: 12,
}

const slotCardStyle: React.CSSProperties = {
  border: `1px solid ${borderColor.default}`,
  background: bg.surface,
  borderRadius: 2,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const slotHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const slotTitleStyle: React.CSSProperties = {
  color: text.primary,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
}

const slotStatusStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 2,
  border: `1px solid ${borderColor.default}`,
}

const slotStatusOkStyle: React.CSSProperties = {
  color: semantic.ok,
  borderColor: semantic.ok,
}

const slotStatusErrStyle: React.CSSProperties = {
  color: semantic.danger,
  borderColor: semantic.danger,
}

const slotStatusPendingStyle: React.CSSProperties = {
  color: text.dim,
}

const kindCardRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
}

const kindCardStyle: React.CSSProperties = {
  border: `1px solid ${borderColor.default}`,
  borderRadius: 2,
  background: bg.surfaceRaised,
  color: text.secondary,
  textAlign: 'left',
  cursor: 'pointer',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const kindCardSelectedStyle: React.CSSProperties = {
  borderColor: accent.default,
  background: bg.surfaceAlt,
}

const kindCardLabelStyle: React.CSSProperties = {
  color: text.primary,
  fontSize: 13,
  fontWeight: 600,
}

const kindCardDescStyle: React.CSSProperties = {
  color: text.dim,
  fontSize: 12,
}

const hardwarePanelStyle: React.CSSProperties = {
  border: `1px solid ${borderColor.default}`,
  borderRadius: 2,
  background: bg.canvas,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const transportRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
}

const transportBtnStyle: React.CSSProperties = {
  border: `1px solid ${borderColor.default}`,
  background: bg.surfaceRaised,
  color: text.secondary,
  borderRadius: 2,
  cursor: 'pointer',
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const transportBtnSelectedStyle: React.CSSProperties = {
  borderColor: accent.default,
  color: text.primary,
  background: accent.dim,
}

const transportInputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const slotErrorStyle: React.CSSProperties = {
  color: semantic.danger,
  fontSize: 12,
}

const slotFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}

const activeCrumb: React.CSSProperties = { color: accent.default, fontWeight: 600 }
