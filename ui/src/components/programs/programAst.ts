/**
 * programAst.ts — shared types and AST helpers for the program editor.
 *
 * Imported by ProgramsPage (full editor), StepRow, ProgramRunPanel (run-only),
 * and ProgramRunView (step labels).
 */
import { getToken } from '../../lib/authClient'

// ── Step types ────────────────────────────────────────────────────────────────

export type StepKind = 'move' | 'move_se3' | 'wait'

export interface MoveStep {
  kind: 'move'
  joint_name?: string
  /** SI target: radians for revolute, metres for prismatic */
  target?: number
}

export interface MoveSe3Step {
  kind: 'move_se3'
  position: [number, number, number]
  orientation_quat: [number, number, number, number]
}

export interface WaitStep {
  kind: 'wait'
  duration_s?: number
}

export type ProgramStep = MoveStep | MoveSe3Step | WaitStep

// ── Program meta (mirror brain/models/program.py) ────────────────────────────

export interface ProgramMeta {
  program_id: string
  name: string
  description: string
}

export interface ProgramNode {
  kind: string
  children: ProgramNode[]
  attributes: Record<string, unknown>
}

export interface SavedProgram {
  meta: ProgramMeta
  machine_id: string
  root: ProgramNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function emptyStep(kind: StepKind, firstJoint = ''): ProgramStep {
  if (kind === 'move') return { kind: 'move', joint_name: firstJoint, target: 0 }
  if (kind === 'move_se3') return { kind: 'move_se3', position: [0, 0, 0], orientation_quat: [0, 0, 0, 1] }
  return { kind: 'wait', duration_s: 1 }
}

export function stepToNode(step: ProgramStep): ProgramNode {
  if (step.kind === 'move') {
    return {
      kind: 'move',
      children: [],
      attributes: {
        joint_name: step.joint_name ?? '',
        target: step.target ?? 0,
      },
    }
  }
  if (step.kind === 'move_se3') {
    return {
      kind: 'move_se3',
      children: [],
      attributes: {
        position: step.position,
        orientation_quat: step.orientation_quat,
      },
    }
  }
  return {
    kind: 'wait',
    children: [],
    attributes: { duration_s: step.duration_s ?? 1 },
  }
}

export function nodeToStep(node: ProgramNode): ProgramStep | null {
  if (node.kind === 'move') {
    // Support both 'target' (current) and 'target_rad' (legacy) attribute names.
    const rawTarget = node.attributes.target ?? node.attributes.target_rad ?? 0
    return {
      kind: 'move',
      joint_name: String(node.attributes.joint_name ?? ''),
      target: Number(rawTarget),
    }
  }
  if (node.kind === 'move_se3') {
    const pos = node.attributes.position as number[] | undefined
    const quat = node.attributes.orientation_quat as number[] | undefined
    return {
      kind: 'move_se3',
      position: [pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0],
      orientation_quat: [quat?.[0] ?? 0, quat?.[1] ?? 0, quat?.[2] ?? 0, quat?.[3] ?? 1],
    }
  }
  if (node.kind === 'wait') {
    return { kind: 'wait', duration_s: Number(node.attributes.duration_s ?? 1) }
  }
  return null
}

export function programPayload(
  programId: string,
  machineId: string,
  name: string,
  steps: ProgramStep[],
) {
  return {
    meta: { program_id: programId, name, description: '' },
    machine_id: machineId,
    root: { kind: 'sequence', children: steps.map(stepToNode), attributes: {} },
  }
}

export function brainFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  }
  return fetch(path, { ...options, headers })
}

export function stepLabel(step: ProgramStep, index: number): string {
  if (step.kind === 'move') {
    const deg = ((step.target ?? 0) * 180) / Math.PI
    return `Move ${step.joint_name ?? '?'} → ${deg.toFixed(1)}°`
  }
  if (step.kind === 'move_se3') {
    const [x, y, z] = step.position
    return `Move EE → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) m`
  }
  if (step.kind === 'wait') {
    return `Wait ${step.duration_s ?? 0}s`
  }
  return `Step ${index + 1}`
}
