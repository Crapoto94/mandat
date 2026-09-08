import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { Engagement, Groupe } from '../types'
import EtatBadge from '../components/EtatBadge'
import { MeteoBadge } from '../components/MeteoPicker'
import { Printer } from 'lucide-react'

export default function PleniairePage() {
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [items, setItems] = useState<Engagement[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get('/groupes'), api.get('/groupes/plenieres')])
      .then(([g, p]) => {
        setGroupes(g.data)
        setItems(p.data)
      })
      .catch((err) => setError(apiErrorMessage(err)))
  }, [])

  if (error) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Synthèse pour la plénière</h1>
          <p className="text-sm text-slate-500">
            2 à 3 sujets prioritaires retenus par chaque groupe, à porter en discussion élargie.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Printer size={15} /> Imprimer / exporter
        </button>
      </div>

      {groupes.map((g) => {
        const groupItems = items.filter((i) => i.groupe_id === g.id)
        return (
          <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {g.code} — {g.directions.join(', ')}
              </h2>
              <span className="text-xs text-slate-400">{groupItems.length}/3 sujet(s) retenu(s)</span>
            </div>
            {groupItems.length ? (
              <div className="space-y-4">
                {groupItems.map((e) => (
                  <div key={e.id} className="border-l-2 border-amber-400 pl-4">
                    <div className="mb-1 flex items-center gap-2">
                      <Link to={`/engagements/${e.id}`} className="font-medium text-slate-800 hover:text-ville-blue">
                        n°{e.numero} — {e.contenu}
                      </Link>
                      <EtatBadge libelle={e.etat_libelle} couleur={e.etat_couleur} />
                      {e.meteo_code && (
                        <MeteoBadge
                          meteo={{
                            code: e.meteo_code,
                            libelle: e.meteo_libelle || '',
                            emoji: e.meteo_emoji || '',
                            couleur: e.meteo_couleur || '#64748b',
                            ordre: 0,
                          }}
                          iconOnly
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Pilotage : {e.pilotage || '—'}</p>
                    {e.prioritaire_note && <p className="mt-1.5 text-sm text-slate-700">{e.prioritaire_note}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Aucun sujet prioritaire retenu pour l'instant.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
