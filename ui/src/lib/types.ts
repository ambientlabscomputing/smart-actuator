// Shared types mirroring the Brain REST API schema.

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  name: string
  last_login: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

// ── Templates ─────────────────────────────────────────────────────────────────

// Shared types mirroring the Brain REST API template schema.

export interface TemplateParam {
  name: string
  label: string
  type: string
  default: number | string
  min?: number
  max?: number
  unit?: string
  description?: string
}

export interface TemplateJoint {
  slot: number
  name: string
}

export interface Template {
  template_id: string
  name: string
  summary: string
  version: string
  parameters?: TemplateParam[]
  joints?: TemplateJoint[]
}
