import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { DashboardSummary, Groupe } from '../types'
import { AlertTriangle, Star, ListChecks } from 'lucide-react'
import { getAxeColor } from '../lib/axeColors'

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get('/dashboard/summary'), api.get('/groupes')])
      .then(([s, g]) => {
        setSummary(s.data)
        setGroupes(g.data)
      })
      .catch((err) => setError(apiErrorMessage(err, 'Impossible de charger le tableau de bord')))
  }, [])

  if (error) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!summary) return <p className="p-8 text-center text-slate-500">Chargement…</p>

  const maxEtat = Math.max(1, ...summary.parEtat.map((e) => e.count))
  const maxAxe = Math.max(1, ...summary.parAxe.map((a) => a.count))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tableau de bord</h1>
        <p className="text-sm text-slate-500">Vue d'ensemble de l'avancement des 55 engagements du mandat.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ListChecks} label="Engagements suivis" value={summary.total} />
        <StatCard icon={Star} label="Marqués prioritaires (plénière)" value={summary.prioritaires} accent="text-amber-600" />
        <StatCard
          icon={AlertTriangle}
          label="Hors groupe de travail"
          value={summary.sansGroupe}
          accent="text-slate-500"
          hint={summary.sansGroupe ? 'Ex : engagements pilotés directement par le Cabinet' : undefined}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Météo des engagements</h2>
        <p className="mb-4 text-xs text-slate-400">Cliquer sur un indicateur pour lister les sujets concernés.</p>
        <div className="flex flex-wrap gap-3">
          {summary.parMeteo.map((m) => (
            <Link
              key={m.code}
              to={`/engagements?meteo=${m.code}`}
              className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:border-ville-blue/40"
              style={{ backgroundColor: `${m.couleur}0d` }}
            >
              <span className="text-xl">{m.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{m.count}</p>
                <p className="text-xs text-slate-500">{m.libelle}</p>
              </div>
            </Link>
          ))}
          <Link
            to="/engagements?meteo=none"
            className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:border-ville-blue/40"
          >
            <span className="text-xl opacity-40">❔</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{summary.meteoNonRenseignee}</p>
              <p className="text-xs text-slate-500">Non renseignée</p>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Avancement par état</h2>
          <div className="space-y-2.5">
            {summary.parEtat.map((e) => (
              <div key={e.code} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-600">{e.libelle}</span>
                <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full"
                    style={{ width: `${(e.count / maxEtat) * 100}%`, backgroundColor: e.couleur }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-medium text-slate-700">{e.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Répartition par groupe de travail</h2>
          <div className="space-y-3">
            {groupes.map((g) => (
              <Link
                key={g.id}
                to={`/engagements?groupe=${g.id}`}
                className="block rounded-lg border border-slate-100 p-3 transition-colors hover:border-ville-blue/40 hover:bg-ville-blue/5"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">
                    {g.code} — {g.directions.join(', ')}
                  </span>
                  <span className="text-xs text-slate-500">{g.total_engagements} engagement(s)</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                  {Object.entries(g.par_etat || {}).map(([code, count]) => (
                    <div
                      key={code}
                      style={{
                        width: `${((count as number) / (g.total_engagements || 1)) * 100}%`,
                        backgroundColor: etatColor(code),
                      }}
                    />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Engagements par axe du projet</h2>
        <div className="space-y-2.5">
          {summary.parAxe.map((a) => (
            <div key={a.axe} className="flex items-center gap-3">
              <span className="w-72 shrink-0 truncate text-xs text-slate-600" title={a.axe}>
                {a.axe}
              </span>
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full"
                  style={{ width: `${(a.count / maxAxe) * 100}%`, backgroundColor: getAxeColor(a.axe) }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-medium text-slate-700">{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'text-ville-blue',
  hint,
}: {
  icon: typeof ListChecks
  label: string
  value: number
  accent?: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} className={accent} />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const ETAT_COLORS: Record<string, string> = {
  a_lancer: '#94a3b8',
  en_cours: '#0055A4',
  en_attente_arbitrage: '#f59e0b',
  partiellement_realise: '#8b5cf6',
  realise: '#16a34a',
}

function etatColor(code: string) {
  return ETAT_COLORS[code] || '#cbd5e1'
}
