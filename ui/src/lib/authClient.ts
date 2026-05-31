/**
 * authClient — THE single source of truth for the auth token.
 *
 * RULE: This is the ONLY file in the codebase that reads or writes
 * localStorage for the auth token. All other modules call getToken(),
 * setToken(), subscribe(), or clearToken() — never localStorage directly.
 * An ESLint rule in eslint.config.js enforces this.
 */

// Private — never export the key constant so callers can't construct it.
const TOKEN_KEY = 'brain.access_token'

type Subscriber = (token: string | null) => void
const _subscribers = new Set<Subscriber>()

function _notify(token: string | null): void {
  for (const cb of _subscribers) cb(token)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the stored token, falling back to the VITE_BRAIN_TOKEN env var
 * (useful for headless smoke-test scripts that inject the token at build time).
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? (import.meta.env.VITE_BRAIN_TOKEN as string | undefined) ?? null
}

/**
 * Persist (or clear) the token. Fires all subscribers.
 * Pass null to remove the token (equivalent to logout).
 */
export function setToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY)
  } else {
    localStorage.setItem(TOKEN_KEY, token)
  }
  _notify(token)
}

/**
 * Subscribe to token changes (set, clear, cross-tab storage events).
 * Returns an unsubscribe function.
 */
export function subscribe(cb: Subscriber): () => void {
  _subscribers.add(cb)
  return () => _subscribers.delete(cb)
}

/**
 * Clear the token without navigating. AuthProvider's subscriber will flip
 * status to 'anon', which makes <RequireAuth> redirect to /login on the
 * next render.
 */
export function clearToken(): void {
  setToken(null)
}

// ── Cross-tab sync ────────────────────────────────────────────────────────────
// When the user logs out in another tab, propagate here via the storage event.
window.addEventListener('storage', (e: StorageEvent) => {
  if (e.key === TOKEN_KEY) {
    _notify(e.newValue) // null if removed
  }
})
