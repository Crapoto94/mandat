import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { Engagement, Etat, Groupe } from '../types'
import EtatBadge from '../components/EtatBadge'
import AxeTag from '../components/AxeTag'
import { getAxeColor, axeList } from '../lib/axeColors'
import { Star, Search } from 'lucide-react'

export default function EngagementsPage() {
  const [params, setParams] = useSearchParams()
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [etats, setEtats] = useState<Etat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(params.get('q') || '')

  const groupeId = params.get('groupe') || ''
  const etatCode = params.get('etat') || ''
  const prioritaire = params.get('prioritaire') || ''

  useEffect(() => {
    api
      .get('/groupes')
      .then((res) => setGroupes(res.data))
      .catch(() => {})
    api
      .get('/etats')
      .then((res) => setEtats(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const query: Record<string, string> = {}
    if (groupeId) query.groupe_id = groupeId
    if (etatCode) query.etat_code = etatCode
    if (prioritaire) query.prioritaire = prioritaire
    if (params.get('q')) query.q = params.get('q')!

    api
      .get('/engagements', { params: query })
      .then((res) => setEngagements(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Impossible de charger les engagements')))
      .finally(() => setLoading(false))
  }, [groupeId, etatCode, prioritaire, params])

  const groupTabs = useMemo(
    () => [{ id: '', label: 'Tous' }, ...groupes.map((g) => ({ id: String(g.id), label: g.code })), { id: 'none', label: 'Hors groupe' }],
    [groupes]
  )

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    updateParam('q', q)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Engagements</h1>
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un engagement..."
              className="w-64 rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {axeList().map((axe) => (
          <span key={axe} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getAxeColor(axe) }} />
            {axe}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {groupTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => updateParam('groupe', tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              groupeId === tab.id ? 'bg-ville-blue text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={etatCode}
          onChange={(e) => updateParam('etat', e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">Tous les états</option>
          {etats.map((e) => (
            <option key={e.code} value={e.code}>
              {e.libelle}
            </option>
          ))}
        </select>
        <button
          onClick={() => updateParam('prioritaire', prioritaire === 'true' ? '' : 'true')}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium ${
            prioritaire === 'true'
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Star size={14} />
          Prioritaires plénière
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="p-8 text-center text-slate-500">Chargement…</p>
      ) : (
        <div className="scroll-x rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Engagement</th>
                <th className="px-4 py-3 font-medium">Pilotage</th>
                <th className="px-4 py-3 font-medium">Groupe</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  style={{ borderLeft: `3px solid ${getAxeColor(e.axe)}` }}
                >
                  <td className="px-4 py-3 align-top text-slate-500">{e.numero}</td>
                  <td className="max-w-md px-4 py-3 align-top">
                    <Link to={`/engagements/${e.id}`} className="font-medium text-slate-800 hover:text-ville-blue">
                      {e.contenu}
                    </Link>
                    <AxeTag axe={e.axe} className="mt-1" />
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">{e.pilotage || '—'}</td>
                  <td className="px-4 py-3 align-top text-slate-600">{e.groupe_code || 'Hors groupe'}</td>
                  <td className="px-4 py-3 align-top">
                    <EtatBadge libelle={e.etat_libelle} couleur={e.etat_couleur} />
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {e.prioritaire_plenaire && <Star size={15} className="inline text-amber-500" fill="currentColor" />}
                  </td>
                </tr>
              ))}
              {!engagements.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    Aucun engagement ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
