/**
 * gcodeApi — typed wrappers for the G-code REST endpoints.
 *
 * Mirrors the pattern used in programAst.ts / useProgramRun.ts:
 * all requests go through a local brainFetch that injects the Bearer token.
 */
import { getToken } from './authClient'

// ── Shared fetch helper ───────────────────────────────────────────────────────

function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

// ── API types (mirror brain/models/gcode.py) ──────────────────────────────────

export interface GCodeTranslationRequest {
  file_id: number
  program_id?: string
  name: string
  description?: string
  machine_id: string
  orientation_quat?: [number, number, number, number]
  start_position?: [number, number, number]
  chord_tolerance_mm?: number
  arc_plane?: 'xy' | 'xz' | 'yz'
}

export interface GCodeTranslationResult {
  program: {
    meta: { program_id: string; name: string; description: string }
    machine_id: string
    root: { kind: string; children: unknown[]; attributes: Record<string, unknown> }
  }
  pose_count: number
  warnings: string[]
  dropped_lines: [number, string][]
}

export interface GCodePreview {
  positions: number[][]
  motion_types: string[]
  warnings: string[]
  truncated: boolean
  pose_count: number
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Translate a G-code file into a Program.
 * @param save  If true (default), the Program is persisted and can be run.
 */
export async function translateGcode(
  body: GCodeTranslationRequest,
  save = true,
): Promise<GCodeTranslationResult> {
  const qs = save ? '' : '?save=false'
  const res = await brainFetch(`/api/v1/gcode/translate${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: 'Translation failed' }))) as {
      detail: string
    }
    throw new Error(err.detail ?? 'Translation failed')
  }
  return res.json() as Promise<GCodeTranslationResult>
}

/**
 * Return a lightweight path preview (no persistence).
 * Poses are capped at 2 000 server-side.
 */
export async function previewGcode(body: GCodeTranslationRequest): Promise<GCodePreview> {
  const res = await brainFetch('/api/v1/gcode/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: 'Preview failed' }))) as {
      detail: string
    }
    throw new Error(err.detail ?? 'Preview failed')
  }
  return res.json() as Promise<GCodePreview>
}

/**
 * Upload a raw file and return its stored file_id.
 * Uses multipart/form-data (no JSON Content-Type override).
 */
export async function uploadGcodeFile(file: File): Promise<{ id: number; location: string }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/v1/files', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: 'Upload failed' }))) as { detail: string }
    throw new Error(err.detail ?? 'Upload failed')
  }
  return res.json() as Promise<{ id: number; location: string }>
}
