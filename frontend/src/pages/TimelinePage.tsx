import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { TimelineEntry } from '../types'
import AxeTag from '../components/AxeTag'
import { getAxeColor } from '../lib/axeColors'
import { GitCommitHorizontal } from 'lucide-react'

export default function TimelinePage() {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get('/timeline')
      .then((res) => setEntries(res.data))
      .catch((err) => setError(apiErrorMessage(err)))
  }, [])

  if (error) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>

  // Regroupe par mois pour une lecture plus rapide de la timeline globale.
  const groups = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const key = entry.date_etape
      ? new Date(entry.date_etape).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : 'Date non précisée'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <GitCommitHorizontal size={20} className="text-ville-blue" /> Timeline globale
        </h1>
        <p className="text-sm text-slate-500">Toutes les étapes datées, tous engagements confondus.</p>
      </div>

      {!entries.length && (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Aucune étape renseignée pour l'instant — ajoutez-en depuis la fiche d'un engagement.
        </p>
      )}

      {[...groups.entries()].map(([month, items]) => (
        <div key={month}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{month}</h2>
          <ol className="space-y-3 border-l-2 border-slate-100 pl-4">
            {items.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getAxeColor(entry.engagement_axe) }}
                />
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={`/engagements/${entry.engagement_id}`}
                      className="text-sm font-medium text-slate-800 hover:text-ville-blue"
                    >
                      n°{entry.engagement_numero} — {entry.engagement_contenu}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {entry.date_etape
                        ? new Date(entry.date_etape).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                        : ''}
                      {entry.groupe_code ? ` · ${entry.groupe_code}` : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{entry.description}</p>
                  <AxeTag axe={entry.engagement_axe} className="mt-1.5" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
