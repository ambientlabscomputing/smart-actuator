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
import type { Template, TemplateJoint } from '../../lib/types'
import { MachineEditor } from '../MachineEditor'

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
    const token = import.meta.env.VITE_BRAIN_TOKEN as string | undefined
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

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p style={hint}>Loading templates…</p>
  }
  if (err) {
    return (
      <div>
        <p style={{ color: '#f44' }}>Error: {err}</p>
        <button
          style={{ marginTop: 8, background: '#374151', border: 'none', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', padding: '8px 16px', fontSize: 13 }}
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
            <small style={{ color: '#aaa' }}>{t.summary}</small>
            <br />
            <small style={{ color: '#666' }}>v{t.version}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Parameter editor (side-by-side live preview + sliders) ──────────
// Rendered inline in the wizard — no local component needed; MachineEditor handles it.

// ── Step 3: Bind joints ───────────────────────────────────────────────────────

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

  const bind = async (slot: number) => {
    setBinding(slot)
    setErrors((e) => ({ ...e, [slot]: '' }))
    try {
      const r = (await brainPost(`/machine/${machineId}/bindings/${slot}`, {
        kind: 'sim',
      })) as BindingResult
      setResults((prev) => ({ ...prev, [slot]: r }))
    } catch (e) {
      setErrors((prev) => ({ ...prev, [slot]: String(e) }))
    } finally {
      setBinding(null)
    }
  }

  const bindAll = async () => {
    for (const j of joints) {
      await bind(j.slot)
    }
  }

  const allBound = joints.every((j) => results[j.slot] !== undefined)

  return (
    <div>
      <h2 style={heading}>Bind joint slots → Sim</h2>
      <p style={hint}>
        Each slot will spawn an <code>actuator-sim</code> process and register it with the Sidecar.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: '#aaa', padding: '4px 12px 4px 0' }}>Slot</th>
            <th style={{ textAlign: 'left', color: '#aaa', padding: '4px 12px 4px 0' }}>Joint</th>
            <th style={{ textAlign: 'left', color: '#aaa', padding: '4px 0' }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {joints.map((j) => {
            const r = results[j.slot]
            const err = errors[j.slot]
            return (
              <tr key={j.slot}>
                <td style={{ padding: '6px 12px 6px 0', color: '#ccc' }}>{j.slot}</td>
                <td style={{ padding: '6px 12px 6px 0', color: '#ccc' }}>{j.name}</td>
                <td style={{ padding: '6px 12px 6px 0' }}>
                  {r ? (
                    <span style={{ color: '#69f0ae' }}>
                      ✓ pid={r.pid} port={r.address?.split(':').at(-1)}
                    </span>
                  ) : err ? (
                    <span style={{ color: '#f44' }}>{err}</span>
                  ) : binding === j.slot ? (
                    <span style={{ color: '#aaa' }}>Spawning…</span>
                  ) : (
                    <span style={{ color: '#666' }}>–</span>
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
          <button style={{ ...btn, background: '#1b5e20' }} onClick={onDone}>
            Open workspace →
          </button>
        )}
      </div>
    </div>
  )
}

interface OnboardingWizardProps {
  onDone: (machineId: string, params: Record<string, number>) => void
}

export function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const [step, setStep] = useState<'pick' | 'params' | 'bind'>('pick')
  const [template, setTemplate] = useState<Template | null>(null)
  const [params, setParams] = useState<Record<string, number>>({})
  const [machineId, setMachineId] = useState<string | null>(null)
  const [buildErr, setBuildErr] = useState<string | null>(null)

  const onPick = (t: Template) => {
    // Initialise params from template defaults
    const defaults: Record<string, number> = {}
    for (const p of t.parameters ?? []) defaults[p.name] = Number(p.default)
    setParams(defaults)
    setTemplate(t)
    setStep('params')
  }

  const onParams = async (p: Record<string, number>) => {
    if (!template) return
    setParams(p)
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
        parameters: p,
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
              params={params}
              onParamsChange={setParams}
              onSubmit={(p) => void onParams(p)}
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
              onDone={() => onDone(machineId, params)}
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
  background: '#0d0d0d',
}

const panel: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 8,
  padding: 32,
  width: 560,
  maxHeight: '90vh',
  overflowY: 'auto',
  color: '#e0e0e0',
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
}

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  marginBottom: 20,
  color: '#fff',
}

const hint: React.CSSProperties = { color: '#888', marginBottom: 16, fontSize: 13 }

const card: React.CSSProperties = {
  background: '#222',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '12px 16px',
  cursor: 'pointer',
  textAlign: 'left',
  color: '#e0e0e0',
  minWidth: 200,
}

const breadcrumb: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  fontSize: 13,
  color: '#666',
  flexShrink: 0,
}

const cancelBtnStyle: React.CSSProperties = {
  background: '#374151',
  border: 'none',
  borderRadius: 6,
  color: '#d1d5db',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 14,
}

const btn: React.CSSProperties = {
  background: '#1565c0',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  marginTop: 16,
  padding: '8px 20px',
  fontSize: 14,
}

const activeCrumb: React.CSSProperties = { color: '#82b1ff', fontWeight: 600 }
