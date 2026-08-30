import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/authClient'

export interface DeviceRegistration { device_id: string; org_id: string; key_id: string; fingerprint: string }
export interface PairingState { user_code: string; verification_uri: string; expires_at: string }
export interface GatewayStatus { available: boolean; paired: boolean; deployment_id: string; device?: DeviceRegistration; pairing?: PairingState; compatibility?: { status: string }; error?: string }
export interface PreparedSnapshot { digest: string; byte_size: number; machine_id: string; included_attachments: string[]; excluded_categories: string[]; compatibility: { status: string }; preview: Record<string, string> }

async function brain<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const response = await fetch(`/api/v1/fabricate${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } })
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail ?? `Request failed (${response.status})`) }
  return response.json() as Promise<T>
}

export function useFabricateGateway() {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [prepared, setPrepared] = useState<PreparedSnapshot | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => { try { setStatus(await brain<GatewayStatus>('/status')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }, [])
  useEffect(() => {
    void brain<GatewayStatus>('/status').then(setStatus).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])
  const run = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label); setError(null)
    try { const result = await action(); await refresh(); return result } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return undefined } finally { setBusy(null) }
  }, [refresh])
  return {
    status, prepared, busy, error, refresh,
    beginPairing: (name: string) => run('Starting pairing', () => brain<PairingState>('/pairing', { method: 'POST', body: JSON.stringify({ name }) })),
    pollPairing: () => run('Checking approval', () => brain('/pairing/poll', { method: 'POST' })),
    rotate: () => run('Rotating key', () => brain('/identity/rotate', { method: 'POST' })),
    reset: () => run('Resetting identity', () => brain('/identity', { method: 'DELETE' })),
    prepare: async (machineId: string, attachmentIds: number[]) => { const result = await run('Preparing snapshot', () => brain<PreparedSnapshot>('/snapshots/prepare', { method: 'POST', body: JSON.stringify({ machine_id: machineId, attachment_ids: attachmentIds }) })); if (result) setPrepared(result) },
    send: async () => prepared ? run('Sending snapshot', () => brain<{ project_url: string }>(`/snapshots/${prepared.digest}/send`, { method: 'POST' })) : undefined,
  }
}
