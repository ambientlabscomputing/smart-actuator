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

// ── DH kinematics types ───────────────────────────────────────────────────────

/** Descriptor for a single numeric DH field as declared in template.yaml dh: block. */
export interface DHFieldSpec {
  default: number
  min?: number
  max?: number
  unit: string
  editable: boolean
}

/** Schema for one joint row in the template's dh.joints[] list. */
export interface DHJointSpec {
  name: string
  slot: number
  type: string
  axis: string
  a: DHFieldSpec
  d: DHFieldSpec
  alpha: DHFieldSpec
  theta_offset: DHFieldSpec
  limit_lower: DHFieldSpec
  limit_upper: DHFieldSpec
  mass: DHFieldSpec
}

/** Full DH chain schema parsed from a template's dh: block. */
export interface DHChainSchema {
  link_radius: DHFieldSpec
  joints: DHJointSpec[]
}

/** One entry in the template's easy: alias list. */
export interface EasyAlias {
  legacy_param: string
  label: string
  unit: string
  description: string
  target: string  // dot-path into DHChainValues, e.g. "joints[0].a"
}

/** Per-machine values for one joint in the DH chain (source of truth). */
export interface DHJointValues {
  name: string
  slot: number
  /** 'revolute' | 'prismatic' — defaults to 'revolute' if absent. */
  type?: string
  /** 'x' | 'y' | 'z' — translation axis for prismatic joints; default 'z'. */
  axis?: string
  a: number
  d: number
  alpha: number        // degrees
  theta_offset: number // degrees
  /** Revolute: degrees. Prismatic: metres. */
  limit_lower: number
  /** Revolute: degrees. Prismatic: metres. */
  limit_upper: number
  mass: number
}

/** The per-machine DH chain values stored in MachineDescription.dh_chain. */
export interface DHChainValues {
  link_radius: number
  joints: DHJointValues[]
}

export interface Template {
  template_id: string
  name: string
  summary: string
  version: string
  parameters?: TemplateParam[]
  joints?: TemplateJoint[]
  dh?: DHChainSchema
  easy?: EasyAlias[]
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export interface WorkspaceHull {
  /** Vertices of the convex hull, indexed by faces. */
  vertices: [number, number, number][]
  /** Triangular face indices into vertices. */
  faces: [number, number, number][]
  /** Hyperplane equations [a, b, c, d] where a·x+b·y+c·z+d <= 0 for interior. */
  equations: [number, number, number, number][]
  volume: number
  area: number
}

export interface WorkspaceResult {
  /** SHA-256 of the dh_chain JSON at compute time. */
  dh_hash: string
  /** Sampled EE positions (x, y, z) in metres. */
  points: [number, number, number][]
  hull: WorkspaceHull | null
  bounds: { min: [number, number, number]; max: [number, number, number] }
  stats: {
    n_samples: number
    volume: number
    hull_area: number
    reach_max: number
    reach_min: number
  }
  generated_at: string
}

// ── IK / End-effector types ───────────────────────────────────────────────────

export interface EndEffectorSpec {
  parent: string
  offset_m: [number, number, number]
  orientation_offset_deg: [number, number, number]
  task_space: string
}

export interface IKNumericConfig {
  max_iters: number
  pos_tol_m: number
  rot_tol_rad: number
  damping: number
  seed: string
}

export interface IKOverrides {
  force_numeric: boolean
  numeric: IKNumericConfig | null
}

export type IKBlockStatus = 'ok' | 'warning' | 'error'

export interface IKBlockVerification {
  block_index: number
  kind: string
  joints: number[]
  status: IKBlockStatus
  reason: string
}

export interface IKVerification {
  strategy: 'analytic' | 'numeric'
  blocks: IKBlockVerification[]
  summary: string
  verified_at: string
}

export interface IKPreviewResponse {
  machine_id: string
  solved_q: number[]
  residual_m: number
  strategy_used: string
  elapsed_ms: number
  collision_blocked: boolean
  collision_resolved: boolean
  resolved_branch: string | null
  requires_reconfig: boolean
}

export interface Machine {
  machine_id: string
  description: {
    machine_id: string
    end_effector: EndEffectorSpec | null
    ik_overrides: IKOverrides | null
    dh_chain: DHChainValues | null
    [key: string]: unknown
  }
  joint_names: string[]
  ik_verification: IKVerification | null
  [key: string]: unknown
}
