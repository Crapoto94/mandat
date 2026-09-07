import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Engagement } from '../types'
import EtatBadge from '../components/EtatBadge'
import AxeTag from '../components/AxeTag'
import { getAxeColor } from '../lib/axeColors'
import { UserCircle2, Compass, Users, Wrench } from 'lucide-react'

type MineEngagement = Engagement & { est_pilote: boolean; est_contributeur: boolean; est_ressource: boolean }

export default function MesEngagementsPage() {
  const { user } = useAuth()
  const [engagements, setEngagements] = useState<MineEngagement[] | null>(null)
  const [directionResolue, setDirectionResolue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualDirection, setManualDirection] = useState('')

  function load(direction?: string) {
    setError(null)
    api
      .get('/engagements/mine', { params: direction ? { direction } : {} })
      .then((res) => {
        setEngagements(res.data.engagements)
        setDirectionResolue(res.data.code)
      })
      .catch((err) => {
        setEngagements(null)
        setError(apiErrorMessage(err))
      })
  }

  useEffect(load, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <UserCircle2 size={20} className="text-ville-blue" /> Mes engagements
        </h1>
        <p className="text-sm text-slate-500">
          Engagements où {user?.direction ? <span className="font-medium">{user.direction}</span> : 'votre direction'} est
          pilote, contributrice, ou direction/fonction ressource impactée.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          <p>{error}</p>
          {user?.role === 'admin' && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={manualDirection}
                onChange={(e) => setManualDirection(e.target.value)}
                placeholder="Nom de direction à tester (ex : DSI, DIRECTION CCAS...)"
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
              />
              <button
                onClick={() => load(manualDirection)}
                className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Voir
              </button>
            </div>
          )}
        </div>
      )}

      {directionResolue && !error && (
        <p className="text-xs text-slate-400">Sigle retenu : <span className="font-medium text-slate-600">{directionResolue}</span></p>
      )}

      {engagements && (
        <div className="space-y-3">
          {engagements.map((e) => (
            <Link
              key={e.id}
              to={`/engagements/${e.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-ville-blue/40"
              style={{ borderLeft: `3px solid ${getAxeColor(e.axe)}` }}
            >
              <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                <span className="font-medium text-slate-800">
                  n°{e.numero} — {e.contenu}
                </span>
                <EtatBadge libelle={e.etat_libelle} couleur={e.etat_couleur} />
              </div>
              <AxeTag axe={e.axe} className="mb-2" />
              <div className="flex flex-wrap gap-1.5">
                {e.est_pilote && <RoleTag icon={Compass} label="Pilote" className="bg-ville-blue/10 text-ville-blue" />}
                {e.est_contributeur && (
                  <RoleTag icon={Users} label="Contributrice" className="bg-purple-50 text-purple-700" />
                )}
                {e.est_ressource && <RoleTag icon={Wrench} label="Ressource" className="bg-amber-50 text-amber-700" />}
              </div>
            </Link>
          ))}
          {!engagements.length && (
            <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
              Aucun engagement ne concerne cette direction pour l'instant.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RoleTag({ icon: Icon, label, className }: { icon: typeof Compass; label: string; className: string }) {
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon size={11} /> {label}
    </span>
  )
}
