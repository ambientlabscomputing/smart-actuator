/**
 * RequireAuth — route guard that redirects unauthenticated users to /login.
 *
 * RULE: This is the ONLY place in the app that redirects to /login based on
 * auth status. No other component should do that redirect.
 */
import { useLocation, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { LoadingScreen } from '@/components'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <LoadingScreen />
  }

  if (status === 'anon') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
