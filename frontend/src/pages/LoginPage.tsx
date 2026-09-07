import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const { user, loginAgent, loginAdmin } = useAuth()
  const [mode, setMode] = useState<'agent' | 'admin'>('agent')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'agent') await loginAgent(username, password)
      else await loginAdmin(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ville-blue text-lg font-bold text-white">
            M
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Suivi des engagements du mandat</h1>
          <p className="text-sm text-slate-500">Ville d'Ivry-sur-Seine</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {mode === 'agent' ? (
            <p className="mb-4 text-sm text-slate-500">
              Connectez-vous avec votre identifiant Ville (identique à votre session sur le réseau).
            </p>
          ) : (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <span>
                Accès de secours réservé aux administrateurs, à utiliser si l'annuaire Ville (Active
                Directory) est indisponible.
              </span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Identifiant</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none focus:ring-1 focus:ring-ville-blue"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none focus:ring-1 focus:ring-ville-blue"
                required
              />
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === 'agent' ? 'admin' : 'agent')
              setError(null)
            }}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
          >
            {mode === 'agent' ? "Annuaire Ville indisponible ? Accès de secours admin →" : '← Retour à la connexion agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
