import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  LayoutDashboard,
  ListChecks,
  MessageSquareWarning,
  Presentation,
  ShieldCheck,
  LogOut,
  GitCommitHorizontal,
  UserCircle2,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/mes-engagements', label: 'Mes engagements', icon: UserCircle2, badge: 'mine' as const },
  { to: '/engagements', label: 'Engagements', icon: ListChecks },
  { to: '/coordination', label: 'Coordination', icon: MessageSquareWarning },
  { to: '/timeline', label: 'Timeline', icon: GitCommitHorizontal },
  { to: '/plenaire', label: 'Plénière', icon: Presentation },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [mineCount, setMineCount] = useState<number | null>(null)

  useEffect(() => {
    api
      .get('/engagements/mine')
      .then((res) => setMineCount(res.data.engagements?.length ?? null))
      .catch(() => setMineCount(null)) // direction inconnue/non répertoriée : pas de pastille, silencieux
  }, [user])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo-ivry.png" alt="Ville d'Ivry-sur-Seine" className="h-9 w-auto" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">Suivi des engagements du mandat</p>
              <p className="text-xs text-slate-500">Ville d'Ivry-sur-Seine</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-ville-blue/10 text-ville-blue' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Icon size={16} />
                {label}
                {badge === 'mine' && !!mineCount && <NavBadge count={mineCount} />}
              </NavLink>
            ))}
            {user?.role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-ville-blue/10 text-ville-blue' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <ShieldCheck size={16} />
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.displayName}</p>
              <p className="text-xs text-slate-500">
                {user?.role === 'admin' ? 'Accès de secours admin' : user?.direction || 'Agent'}
              </p>
            </div>
            <button
              onClick={logout}
              title="Se déconnecter"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 md:hidden">
          {navItems.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive ? 'bg-ville-blue/10 text-ville-blue' : 'text-slate-600'
                }`
              }
            >
              <Icon size={16} />
              {label}
              {badge === 'mine' && !!mineCount && <NavBadge count={mineCount} />}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-ville-blue px-1 text-[10px] font-semibold text-white">
      {count}
    </span>
  )
}
