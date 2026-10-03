import { Navigate } from 'react-router-dom'
import { getUser } from './api'

export default function RequireRole({
  roles,
  children,
}: {
  roles: string[]
  children: React.ReactNode
}) {
  const user = getUser()
  if (!user) return <Navigate to="/login" replace />
  const role = String((user as any).role || '').toLowerCase()
  if (role === 'admin' || roles.map((r) => r.toLowerCase()).includes(role)) {
    return <>{children}</>
  }
  return <Navigate to="/" replace />
}
