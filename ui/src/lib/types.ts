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
