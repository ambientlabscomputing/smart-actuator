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
        setTemplates(list)
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
      <h2 style={heading}>Choose a template</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {templates.map((t) => (
          <button
            key={t.template_id}
            style={card}
            onClick={() => {
              // Fetch full schema (with parameters + joints) then proceed
              void brainGet(`/templates/${t.template_id}`)
                .then((full) => onPick(full as Template))
                .catch((e) => setErr(String(e)))
            }}
          >
            <strong>{t.name}</strong>
            <br />
            <small style={{ color: text.dim }}>{t.summary}</small>
            <br />
            <small style={{ color: text.faint }}>v{t.version}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Parameter editor (side-by-side live preview + sliders) ──────────
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
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: text.dim, padding: '4px 12px 4px 0' }}>Slot</th>
            <th style={{ textAlign: 'left', color: text.dim, padding: '4px 12px 4px 0' }}>Joint</th>
            <th style={{ textAlign: 'left', color: text.dim, padding: '4px 12px 4px 0' }}>Kind</th>
            <th style={{ textAlign: 'left', color: text.dim, padding: '4px 0' }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {joints.map((j) => {
            const r = results[j.slot]
            const err = errors[j.slot]
            const k = kindOf(j.slot)
            const hw = hwInputs[j.slot] ?? defaultHw()
            return (
              <tr key={j.slot}>
                <td style={{ padding: '6px 12px 6px 0', color: text.secondary }}>{j.slot}</td>
                <td style={{ padding: '6px 12px 6px 0', color: text.secondary }}>{j.name}</td>
                <td style={{ padding: '6px 12px 6px 0' }}>
                  {!r && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={{ ...kindBtn, background: k === 'sim' ? accent.default : borderColor.default }}
                          onClick={() => setKind(j.slot, 'sim')}
                        >
                          Sim
                        </button>
                        <button
                          style={{ ...kindBtn, background: k === 'hardware' ? accent.hover : borderColor.default }}
                          onClick={() => setKind(j.slot, 'hardware')}
                        >
                          Hardware
                        </button>
                      </div>
                      {k === 'hardware' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              style={{ ...kindBtn, background: hw.transport === 'serial' ? accent.dim : borderColor.default, fontSize: 11 }}
                              onClick={() => setHwField(j.slot, 'transport', 'serial')}
                            >
                              USB-CDC
                            </button>
                            <button
                              style={{ ...kindBtn, background: hw.transport === 'tcp' ? accent.dim : borderColor.default, fontSize: 11 }}
                              onClick={() => setHwField(j.slot, 'transport', 'tcp')}
                            >
                              TCP/IP
                            </button>
                          </div>
                          {hw.transport === 'serial' ? (
                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                              <input
                                placeholder="/dev/cu.usbserial-XXXX"
                                value={hw.serialPath}
                                onChange={(e) => setHwField(j.slot, 'serialPath', e.target.value)}
                                style={{ ...ipInput, width: 220 }}
                              />
                              <input
                                placeholder="921600"
                                value={hw.baudRate}
                                onChange={(e) => setHwField(j.slot, 'baudRate', e.target.value)}
                                style={{ ...ipInput, width: 80 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                              <input
                                placeholder="IP (e.g. 192.168.4.105)"
                                value={hw.ip}
                                onChange={(e) => setHwField(j.slot, 'ip', e.target.value)}
                                style={ipInput}
                              />
                              <input
                                placeholder="Port"
                                value={hw.port}
                                onChange={(e) => setHwField(j.slot, 'port', e.target.value)}
                                style={{ ...ipInput, width: 64 }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 12px 6px 0' }}>
                  {r ? (
                    r.pid != null ? (
                      <span style={{ color: semantic.ok }}>
                        ✓ pid={r.pid} port={r.address?.split(':').at(-1)}
                      </span>
                    ) : (
                      <span style={{ color: semantic.ok }}>✓ {r.address}</span>
                    )
                  ) : err ? (
                    <span style={{ color: semantic.danger }}>{err}</span>
                  ) : binding === j.slot ? (
                    <span style={{ color: text.dim }}>{k === 'hardware' ? 'Connecting…' : 'Spawning…'}</span>
                  ) : (
                    <span style={{ color: text.faint }}>–</span>
                  )}
                </td>
                <td>
                  {!r && (
                    <button
                      style={{ ...btn, padding: '4px 10px', fontSize: 12 }}
                      disabled={binding !== null}
                      onClick={() => void bind(j.slot)}
                    >
                      Bind
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 12 }}>
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

  // Panel widens on params step to accommodate side-by-side layout
  const panelStyle: React.CSSProperties =
    step === 'params'
      ? { ...panel, width: 'min(95vw, 1100px)', height: '85vh', padding: 0 }
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
  borderRadius: 8,
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
  color: text.primary,
}

const hint: React.CSSProperties = { color: text.dim, marginBottom: 16, fontSize: 13 }

const card: React.CSSProperties = {
  background: bg.surfaceRaised,
  border: `1px solid ${borderColor.focus}`,
  borderRadius: 6,
  padding: '12px 16px',
  cursor: 'pointer',
  textAlign: 'left',
  color: text.secondary,
  minWidth: 200,
}

const breadcrumb: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  fontSize: 13,
  color: text.faint,
  flexShrink: 0,
}

const cancelBtnStyle: React.CSSProperties = {
  background: borderColor.default,
  border: 'none',
  borderRadius: 6,
  color: text.secondary,
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 14,
}

const btn: React.CSSProperties = {
  background: accent.default,
  border: 'none',
  borderRadius: 4,
  color: accent.on,
  cursor: 'pointer',
  marginTop: 16,
  padding: '8px 20px',
  fontSize: 14,
}

const kindBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  color: text.primary,
  cursor: 'pointer',
  padding: '3px 10px',
  fontSize: 12,
  fontWeight: 600,
}

const ipInput: React.CSSProperties = {
  background: bg.surfaceRaised,
  border: `1px solid ${borderColor.focus}`,
  borderRadius: 4,
  color: text.secondary,
  fontSize: 12,
  padding: '3px 6px',
  width: 150,
}

const activeCrumb: React.CSSProperties = { color: accent.default, fontWeight: 600 }
