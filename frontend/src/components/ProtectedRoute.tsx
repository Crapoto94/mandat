import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Chargement…</div>
  if (!user) return <Navigate to="/connexion" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Chargement…</div>
  if (!user) return <Navigate to="/connexion" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
