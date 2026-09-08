import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { Direction, Engagement, Etat, Groupe, Meteo } from '../types'
import EtatBadge from '../components/EtatBadge'
import AxeTag from '../components/AxeTag'
import { MeteoBadge } from '../components/MeteoPicker'
import { getAxeColor, axeList } from '../lib/axeColors'
import { Star, Search, Infinity as InfinityIcon, Bell, Clock3 } from 'lucide-react'

const NOUVEAUTES_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: '7 derniers jours' },
  { value: 'month', label: '30 derniers jours' },
] as const

export default function EngagementsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [etats, setEtats] = useState<Etat[]>([])
  const [meteos, setMeteos] = useState<Meteo[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(params.get('q') || '')
  const [alertedIds, setAlertedIds] = useState<Set<number>>(new Set())
  const [nouveautesCounts, setNouveautesCounts] = useState<Record<string, number>>({})

  const groupeId = params.get('groupe') || ''
  const etatCode = params.get('etat') || ''
  const meteoCode = params.get('meteo') || ''
  const prioritaire = params.get('prioritaire') || ''
  const direction = params.get('direction') || ''
  const axe = params.get('axe') || ''
  const nouveautes = params.get('nouveautes') || ''

  useEffect(() => {
    api
      .get('/groupes')
      .then((res) => setGroupes(res.data))
      .catch(() => {})
    api
      .get('/etats')
      .then((res) => setEtats(res.data))
      .catch(() => {})
    api
      .get('/meteos')
      .then((res) => setMeteos(res.data))
      .catch(() => {})
    api
      .get('/directions')
      .then((res) => setDirections(res.data))
      .catch(() => {})
    api
      .get('/alerts/mine')
      .then((res) => setAlertedIds(new Set(res.data)))
      .catch(() => {})
  }, [])

  async function toggleAlert(id: number) {
    const wasAlerted = alertedIds.has(id)
    setAlertedIds((prev) => {
      const next = new Set(prev)
      if (wasAlerted) next.delete(id)
      else next.add(id)
      return next
    })
    try {
      if (wasAlerted) await api.delete(`/alerts/${id}`)
      else await api.post(`/alerts/${id}`)
    } catch (err) {
      // Revert optimiste en cas d'échec (ex : compte admin sans mail connu)
      setAlertedIds((prev) => {
        const next = new Set(prev)
        if (wasAlerted) next.add(id)
        else next.delete(id)
        return next
      })
      setError(apiErrorMessage(err, "Impossible de modifier l'alerte"))
    }
  }

  // Plusieurs sigles peuvent être concordés vers le même nom complet (ex.
  // DSPORT/DSPORTS/SPORT → "Direction des Sports") : le filtre se choisit
  // par nom complet, dédupliqué, jamais par sigle brut.
  const directionOptions = useMemo(() => {
    const libelles = new Set(directions.map((d) => d.libelle).filter((l): l is string => !!l))
    return [...libelles].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [directions])

  useEffect(() => {
    setLoading(true)
    const query: Record<string, string> = {}
    if (groupeId) query.groupe_id = groupeId
    if (etatCode) query.etat_code = etatCode
    if (meteoCode) query.meteo_code = meteoCode
    if (prioritaire) query.prioritaire = prioritaire
    if (direction) query.direction = direction
    if (axe) query.axe = axe
    if (nouveautes) query.nouveautes = nouveautes
    if (params.get('q')) query.q = params.get('q')!

    api
      .get('/engagements', { params: query })
      .then((res) => setEngagements(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Impossible de charger les engagements')))
      .finally(() => setLoading(false))
  }, [groupeId, etatCode, meteoCode, prioritaire, direction, axe, nouveautes, params])

  // Pastilles du filtre "Nouveautés" : effectifs pour les 3 périodes à la
  // fois (indépendant de la période actuellement sélectionnée), mais dans
  // le respect des autres filtres actifs (groupe, axe...).
  useEffect(() => {
    const query: Record<string, string> = {}
    if (groupeId) query.groupe_id = groupeId
    if (etatCode) query.etat_code = etatCode
    if (meteoCode) query.meteo_code = meteoCode
    if (prioritaire) query.prioritaire = prioritaire
    if (direction) query.direction = direction
    if (axe) query.axe = axe
    if (params.get('q')) query.q = params.get('q')!

    api
      .get('/engagements/nouveautes-counts', { params: query })
      .then((res) => setNouveautesCounts(res.data))
      .catch(() => {})
  }, [groupeId, etatCode, meteoCode, prioritaire, direction, axe, params])

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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        {axeList().map((a) => {
          const active = axe === a
          return (
            <button
              key={a}
              onClick={() => updateParam('axe', active ? '' : a)}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors ${
                active ? 'text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
              style={active ? { backgroundColor: getAxeColor(a) } : undefined}
              title={active ? 'Cliquer pour retirer ce filtre' : `Filtrer sur « ${a} »`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? '#fff' : getAxeColor(a) }}
              />
              {a}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="flex items-center gap-1 text-slate-400">
          <Clock3 size={13} /> Nouveautés :
        </span>
        {NOUVEAUTES_OPTIONS.map((opt) => {
          const active = nouveautes === opt.value
          const count = nouveautesCounts[opt.value] ?? 0
          return (
            <button
              key={opt.value}
              onClick={() => updateParam('nouveautes', active ? '' : opt.value)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors ${
                active ? 'bg-ville-blue text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
              <span
                className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                  active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
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
          className="max-w-[9.5rem] truncate rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:max-w-none"
        >
          <option value="">Tous les états</option>
          {etats.map((e) => (
            <option key={e.code} value={e.code}>
              {e.libelle}
            </option>
          ))}
        </select>
        <select
          value={meteoCode}
          onChange={(e) => updateParam('meteo', e.target.value)}
          className="max-w-[9.5rem] truncate rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:max-w-none"
        >
          <option value="">Toutes météos</option>
          {meteos.map((m) => (
            <option key={m.code} value={m.code}>
              {m.emoji} {m.libelle}
            </option>
          ))}
          <option value="none">❔ Non renseignée</option>
        </select>
        <select
          value={direction}
          onChange={(e) => updateParam('direction', e.target.value)}
          className="max-w-[9.5rem] truncate rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:max-w-[14rem]"
        >
          <option value="">Toutes directions</option>
          {directionOptions.map((libelle) => (
            <option key={libelle} value={libelle}>
              {libelle}
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
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Engagement</th>
                <th className="px-3 py-2.5 font-medium">Pilotage</th>
                <th className="px-3 py-2.5 font-medium">Contribution</th>
                <th className="px-3 py-2.5 font-medium">Ressources</th>
                <th className="px-3 py-2.5 font-medium">Groupe</th>
                <th className="px-3 py-2.5 font-medium">État</th>
                <th className="px-3 py-2.5 font-medium">Météo</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => navigate(`/engagements/${e.id}`)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  style={{ borderLeft: `3px solid ${getAxeColor(e.axe)}` }}
                >
                  <td className="px-3 py-2.5 align-top text-slate-500">{e.numero}</td>
                  <td className="max-w-[240px] px-3 py-2.5 align-top">
                    <Link
                      to={`/engagements/${e.id}`}
                      onClick={(ev) => ev.stopPropagation()}
                      className="font-medium text-slate-800 hover:text-ville-blue"
                    >
                      {e.contenu}
                    </Link>
                    {e.continu && (
                      <span title="Engagement continu — pas d'échéance" className="ml-1.5 inline-block align-text-bottom text-slate-400">
                        <InfinityIcon size={14} className="inline" />
                      </span>
                    )}
                    <AxeTag axe={e.axe} className="mt-1" />
                  </td>
                  <td className="max-w-[120px] px-3 py-2.5 align-top text-slate-600">{e.pilotage || '—'}</td>
                  <td className="max-w-[120px] px-3 py-2.5 align-top text-slate-600">{e.contribution_elaboration || '—'}</td>
                  <td className="max-w-[120px] px-3 py-2.5 align-top text-slate-600">{e.contribution_impactees || '—'}</td>
                  <td className="px-3 py-2.5 align-top text-slate-600">{e.groupe_code || 'Hors groupe'}</td>
                  <td className="px-3 py-2.5 align-top">
                    <EtatBadge libelle={e.etat_libelle} couleur={e.etat_couleur} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {e.meteo_code ? (
                      <MeteoBadge
                        meteo={{ code: e.meteo_code, libelle: e.meteo_libelle || '', emoji: e.meteo_emoji || '', couleur: e.meteo_couleur || '#64748b', ordre: 0 }}
                        iconOnly
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      {e.prioritaire_plenaire && <Star size={15} className="text-amber-500" fill="currentColor" />}
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          toggleAlert(e.id)
                        }}
                        title={
                          alertedIds.has(e.id)
                            ? "Alerte activée — un mail sera envoyé en fin de journée en cas de nouveauté"
                            : "Activer une alerte mail (en fin de journée) sur cet engagement"
                        }
                        className={`rounded-md p-1 ${
                          alertedIds.has(e.id) ? 'text-ville-blue' : 'text-slate-300 hover:text-slate-500'
                        }`}
                      >
                        <Bell size={15} fill={alertedIds.has(e.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!engagements.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
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
