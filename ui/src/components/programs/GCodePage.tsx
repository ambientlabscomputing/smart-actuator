/**
 * GCodePage — full-page G-code upload, preview, and run workflow.
 *
 * Layout:
 *   Left column  : upload card + translation options + action buttons
 *   Right column : 2-D XY path preview (SVG, color-coded by motion type)
 *                  + run progress when a run is in-flight
 */
import { useCallback, useRef, useState } from 'react'
import { AppToolbar } from '../AppToolbar'
import { ProgramRunView } from './ProgramRunView'
import { nodeToStep } from './programAst'
import type { ProgramStep } from './programAst'
import {
  translateGcode,
  previewGcode,
  uploadGcodeFile,
} from '../../lib/gcodeApi'
import type { GCodePreview, GCodeTranslationResult } from '../../lib/gcodeApi'

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const label: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  marginBottom: 3,
}

const inputStyle: React.CSSProperties = {
  background: '#0d0d0d',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#f3f4f6',
  fontSize: 13,
  padding: '5px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

const btn = (color: string, disabled = false): React.CSSProperties => ({
  padding: '8px 18px',
  background: disabled ? '#374151' : color,
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
  fontWeight: 600,
  opacity: disabled ? 0.6 : 1,
})

// ── Motion-type colour map ────────────────────────────────────────────────────

const MOTION_COLOR: Record<string, string> = {
  rapid: '#facc15',   // yellow
  feed: '#3b82f6',    // blue
  arc: '#a855f7',     // purple
}

function motionColor(type: string): string {
  return MOTION_COLOR[type] ?? '#6b7280'
}

// ── SVG path preview ─────────────────────────────────────────────────────────

interface PathPreviewProps {
  preview: GCodePreview
  size?: number
}

function PathPreview({ preview, size = 340 }: PathPreviewProps) {
  const { positions, motion_types } = preview
  if (positions.length === 0) {
    return (
      <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
        No poses to preview.
      </div>
    )
  }

  // Compute XY bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const pad = 16
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scaleX = (size - 2 * pad) / rangeX
  const scaleY = (size - 2 * pad) / rangeY
  const scale = Math.min(scaleX, scaleY)

  const toSvg = (x: number, y: number) => [
    pad + (x - minX) * scale,
    size - pad - (y - minY) * scale, // flip Y so +Y is up
  ]

  // Build line segments grouped into per-type polylines
  const segments: { color: string; pts: string }[] = []
  let i = 0
  while (i < positions.length) {
    const type = motion_types[i] ?? 'feed'
    let j = i + 1
    while (j < positions.length && (motion_types[j] ?? 'feed') === type) j++
    // include previous point for continuity
    const pts: string[] = []
    if (i > 0) {
      const [px, py] = toSvg(positions[i - 1][0], positions[i - 1][1])
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`)
    }
    for (let k = i; k < j; k++) {
      const [px, py] = toSvg(positions[k][0], positions[k][1])
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`)
    }
    segments.push({ color: motionColor(type), pts: pts.join(' ') })
    i = j
  }

  return (
    <svg
      width={size}
      height={size}
      style={{ background: '#0d0d0d', borderRadius: 8, display: 'block' }}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Grid lines */}
      <line x1={pad} y1={size / 2} x2={size - pad} y2={size / 2} stroke="#1f2937" strokeWidth={1} />
      <line x1={size / 2} y1={pad} x2={size / 2} y2={size - pad} stroke="#1f2937" strokeWidth={1} />
      {/* Path */}
      {segments.map((s, idx) => (
        <polyline
          key={idx}
          points={s.pts}
          fill="none"
          stroke={s.color}
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {/* Start dot */}
      {(() => {
        const [x, y] = toSvg(positions[0][0], positions[0][1])
        return <circle cx={x} cy={y} r={3} fill="#22c55e" />
      })()}
      {/* End dot */}
      {(() => {
        const last = positions[positions.length - 1]
        const [x, y] = toSvg(last[0], last[1])
        return <circle cx={x} cy={y} r={3} fill="#ef4444" />
      })()}
    </svg>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
      {Object.entries(MOTION_COLOR).map(([type, color]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 3, background: color, borderRadius: 2 }} />
          <span style={{ color: '#9ca3af', fontSize: 11 }}>{type}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        <span style={{ color: '#9ca3af', fontSize: 11 }}>start</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
        <span style={{ color: '#9ca3af', fontSize: 11 }}>end</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface GCodePageProps {
  machineId: string
}

// Tool pointing straight down: 180° rotation about world X axis maps the
// tool's +Z (typical approach axis) to world −Z.  Quaternion (x, y, z, w).
const TOOL_DOWN_QUAT: [number, number, number, number] = [1, 0, 0, 0]

export function GCodePage({ machineId }: GCodePageProps) {
  // ── Upload state ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileId, setFileId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ── Translation options ───────────────────────────────────────────────────
  const [programName, setProgramName] = useState('My G-code program')
  const [chordTol, setChordTol] = useState('0.1')
  const [arcPlane, setArcPlane] = useState<'xy' | 'xz' | 'yz'>('xy')

  // ── Preview / translate state ─────────────────────────────────────────────
  const [preview, setPreview] = useState<GCodePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [result, setResult] = useState<GCodeTranslationResult | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  // ── Run state ─────────────────────────────────────────────────────────────
  const [runId, setRunId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [runSteps, setRunSteps] = useState<ProgramStep[]>([])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setFileId(null)
    setPreview(null)
    setResult(null)
    setUploadError(null)
    setPreviewError(null)
    setTranslateError(null)
    setRunId(null)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    setUploadError(null)
    try {
      const stored = await uploadGcodeFile(selectedFile)
      setFileId(stored.id)
    } catch (e) {
      setUploadError(String(e))
    } finally {
      setUploading(false)
    }
  }

  const makeRequest = useCallback(
    (fid: number): Parameters<typeof previewGcode>[0] => ({
      file_id: fid,
      name: programName || 'G-code program',
      machine_id: machineId,
      chord_tolerance_mm: parseFloat(chordTol) || 0.1,
      arc_plane: arcPlane,
      orientation_quat: TOOL_DOWN_QUAT,
    }),
    [programName, machineId, chordTol, arcPlane],
  )

  async function handlePreview() {
    if (fileId == null) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const p = await previewGcode(makeRequest(fileId))
      setPreview(p)
    } catch (e) {
      setPreviewError(String(e))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleTranslate() {
    if (fileId == null) return
    setTranslating(true)
    setTranslateError(null)
    try {
      const res = await translateGcode(makeRequest(fileId), true)
      setResult(res)
      // Build a lightweight preview from the full result
      setPreview({
        positions: res.program.root.children.map(
          (n) => (((n as unknown) as { attributes: { position?: number[] } }).attributes.position ?? [0, 0, 0]),
        ),
        motion_types: res.program.root.children.map(
          (n) => String((((n as unknown) as { attributes: { motion_type?: string } }).attributes.motion_type) ?? 'feed'),
        ),
        warnings: res.warnings,
        truncated: false,
        pose_count: res.pose_count,
      })
    } catch (e) {
      setTranslateError(String(e))
    } finally {
      setTranslating(false)
    }
  }

  async function handleRun() {
    if (!result) return
    setRunError(null)
    const token = (await import('../../lib/authClient')).getToken()
    const res = await fetch(
      `/api/v1/programs/${encodeURIComponent(result.program.meta.program_id)}/runs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ machine_id: machineId }),
      },
    )
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ detail: 'Run failed' }))) as { detail: string }
      setRunError(err.detail ?? 'Run failed')
      return
    }
    const run = (await res.json()) as { run_id: string }
    // Build steps list for the progress panel
    const steps = result.program.root.children
      .map((n) => nodeToStep(n as Parameters<typeof nodeToStep>[0]))
      .filter((s): s is ProgramStep => s !== null)
    setRunSteps(steps)
    setRunId(run.run_id)
  }

  const busy = uploading || previewing || translating

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
      <AppToolbar title="G-code" />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 20,
          padding: 20,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Upload card */}
          <div style={card}>
            <div style={label}>1. Upload G-code file</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gcode,.nc,.cnc,.tap"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={btn('#374151')}
            >
              {selectedFile ? selectedFile.name : 'Choose file…'}
            </button>
            {selectedFile && !fileId && (
              <button onClick={() => void handleUpload()} disabled={uploading} style={btn('#2563eb', uploading)}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            )}
            {fileId != null && (
              <span style={{ color: '#22c55e', fontSize: 12 }}>
                ✓ Uploaded (file_id={fileId})
              </span>
            )}
            {uploadError && <span style={{ color: '#f87171', fontSize: 12 }}>{uploadError}</span>}
          </div>

          {/* Options card */}
          <div style={card}>
            <div style={label}>2. Translation options</div>

            <div>
              <div style={label}>Program name</div>
              <input
                style={inputStyle}
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="My G-code program"
              />
            </div>

            <div>
              <div style={label}>Arc chord tolerance (mm)</div>
              <input
                style={inputStyle}
                type="number"
                min="0.001"
                step="0.01"
                value={chordTol}
                onChange={(e) => setChordTol(e.target.value)}
              />
            </div>

            <div>
              <div style={label}>Arc plane</div>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={arcPlane}
                onChange={(e) => setArcPlane(e.target.value as 'xy' | 'xz' | 'yz')}
              >
                <option value="xy">XY</option>
                <option value="xz">XZ</option>
                <option value="yz">YZ</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => void handlePreview()}
              disabled={fileId == null || busy}
              style={btn('#4b5563', fileId == null || busy)}
            >
              {previewing ? 'Previewing…' : 'Preview path'}
            </button>
            <button
              onClick={() => void handleTranslate()}
              disabled={fileId == null || busy}
              style={btn('#2563eb', fileId == null || busy)}
            >
              {translating ? 'Translating…' : 'Save program'}
            </button>
            <button
              onClick={() => void handleRun()}
              disabled={result == null || runId != null}
              style={btn('#16a34a', result == null || runId != null)}
            >
              Run
            </button>
          </div>

          {previewError && <span style={{ color: '#f87171', fontSize: 12 }}>{previewError}</span>}
          {translateError && <span style={{ color: '#f87171', fontSize: 12 }}>{translateError}</span>}
          {runError && <span style={{ color: '#f87171', fontSize: 12 }}>{runError}</span>}

          {/* Result summary */}
          {result && (
            <div style={{ ...card, borderColor: '#1f2937' }}>
              <div style={label}>Result</div>
              <span style={{ color: '#d1d5db', fontSize: 12 }}>
                {result.pose_count} poses saved as{' '}
                <code style={{ color: '#60a5fa' }}>{result.program.meta.name}</code>
              </span>
              {result.warnings.length > 0 && (
                <div>
                  <div style={{ ...label, color: '#fbbf24' }}>Warnings</div>
                  {result.warnings.map((w, i) => (
                    <div key={i} style={{ color: '#fbbf24', fontSize: 11, marginBottom: 2 }}>{w}</div>
                  ))}
                </div>
              )}
              {result.dropped_lines.length > 0 && (
                <div>
                  <div style={{ ...label, color: '#f87171' }}>
                    {result.dropped_lines.length} dropped line(s)
                  </div>
                  {result.dropped_lines.slice(0, 5).map(([ln, msg], i) => (
                    <div key={i} style={{ color: '#f87171', fontSize: 11, marginBottom: 2 }}>
                      Line {ln}: {msg}
                    </div>
                  ))}
                  {result.dropped_lines.length > 5 && (
                    <div style={{ color: '#6b7280', fontSize: 11 }}>
                      … and {result.dropped_lines.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {preview ? (
            <>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>
                {preview.pose_count} pose{preview.pose_count !== 1 ? 's' : ''}
                {preview.truncated ? ` (preview capped at ${preview.positions.length})` : ''}
                {' '}— XY plane view
              </div>
              <PathPreview preview={preview} size={460} />
              <Legend />
              {preview.warnings.length > 0 && !result && (
                <div style={{ color: '#fbbf24', fontSize: 11 }}>
                  {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4b5563',
                fontSize: 14,
                border: '1px dashed #374151',
                borderRadius: 8,
                minHeight: 300,
              }}
            >
              Upload a file and click &ldquo;Preview path&rdquo; to see the tool path here.
            </div>
          )}

          {runId && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...label, marginBottom: 8 }}>Run progress</div>
              <ProgramRunView
                runId={runId}
                steps={runSteps}
                onClose={() => setRunId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
