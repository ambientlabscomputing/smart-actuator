/**
 * AuthContext — manages auth state (user, status) for the whole app.
 *
 * Wraps authClient (the localStorage boundary) so React can react to token
 * changes. Never touches localStorage directly — all token ops go through
 * authClient.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { clearToken, getToken, setToken, subscribe } from '@/lib/authClient'
import type { LoginResponse, User } from '@/lib/types'

const BRAIN_BASE = '/api/v1'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'anon' | 'authed'

interface AuthState {
  user: User | null
  status: AuthStatus
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null)

// ── Internal helpers (do NOT call from outside this file) ─────────────────────

async function fetchMe(): Promise<User> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BRAIN_BASE}/users/me`, { headers })
  if (!res.ok) {
    if (res.status === 401) clearToken()
    throw new Error(`${res.status}`)
  }
  return res.json() as Promise<User>
}

async function postLogin(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BRAIN_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<LoginResponse>
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise synchronously so we never need to call setStatus from inside an
  // effect body (which react-hooks/set-state-in-effect flags).
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => getToken() ? 'loading' : 'anon')
  const [error, setError] = useState<string | null>(null)

  // If we started in 'loading' (token exists), validate it via /me on mount.
  useEffect(() => {
    if (status !== 'loading') return
    fetchMe()
      .then((u) => { setUser(u); setStatus('authed') })
      .catch(() => setStatus('anon'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once; `status` initial value drives the branch

  // Subscribe to authClient so any clearToken() call (e.g. 401 handler)
  // flips us back to anon, which makes <RequireAuth> redirect to /login.
  useEffect(() => {
    return subscribe((token) => {
      if (token === null) {
        setUser(null)
        setStatus('anon')
      } else if (status === 'anon') {
        // Cross-tab login: a token appeared — revalidate
        setStatus('loading')
        fetchMe()
          .then((u) => { setUser(u); setStatus('authed') })
          .catch(() => setStatus('anon'))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const { access_token } = await postLogin(username, password)
      setToken(access_token)
      const u = await fetchMe()
      setUser(u)
      setStatus('authed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    }
  }, [])

  const logout = useCallback(() => {
    clearToken() // subscriber will set status='anon'
  }, [])

  return (
    <AuthContext.Provider value={{ user, status, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
