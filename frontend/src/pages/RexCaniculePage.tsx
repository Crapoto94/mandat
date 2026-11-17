import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, Hammer, LayoutDashboard, ListChecks, Thermometer, Zap } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { RexOverview, RexThematique } from '../types.rex'
import RexSynthese from '../components/rex/RexSynthese'
import RexRetours, { SujetModal } from '../components/rex/RexRetours'
import RexActions from '../components/rex/RexActions'
import RexReflexes from '../components/rex/RexReflexes'
import RexTravaux from '../components/rex/RexTravaux'

export type RexTab = 'synthese' | 'retours' | 'actions' | 'reflexes' | 'travaux'
const TABS: { key: RexTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'synthese', label: 'Synthèse', icon: LayoutDashboard },
  { key: 'retours', label: "Retours d'expérience", icon: ClipboardList },
  { key: 'actions', label: "Plan d'actions", icon: ListChecks },
  { key: 'reflexes', label: 'Réflexes communs', icon: Zap },
  { key: 'travaux', label: 'Travaux', icon: Hammer },
]

/**
 * REX Canicule 2026 : espace de travail collaboratif du CODIR, sur le modèle du
 * suivi des engagements — retours d'expérience par thématique, actions liables
 * aux engagements du mandat, réflexes communs validés direction par direction.
 */
export default function RexCaniculePage() {
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t.key === sp.get('onglet'))?.key || 'synthese') as RexTab
  const sujetParam = Number(sp.get('sujet')) || null
  const engagementParam = Number(sp.get('engagement')) || null

  const [overview, setOverview] = useState<RexOverview | null>(null)
  const [thematiques, setThematiques] = useState<RexThematique[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    Promise.all([api.get('/rex/overview'), api.get('/rex/thematiques')])
      .then(([o, t]) => {
        setOverview(o.data)
        setThematiques(t.data)
        setError(null)
      })
      .catch((err) => setError(apiErrorMessage(err, 'Chargement du REX impossible')))
  }, [])

  useEffect(reload, [reload, version])

  // Un changement (statut, position, commentaire…) recharge la synthèse, les sujets et l'onglet courant.
  const changed = useCallback(() => setVersion((v) => v + 1), [])

  const goto = useCallback(
    (next: RexTab, params: Record<string, string> = {}) => {
      setSp({ onglet: next, ...params })
      window.scrollTo({ top: 0 })
    },
    [setSp]
  )

  const openSujet = useCallback(
    (id: number | null) => {
      setSp((prev) => {
        const n = new URLSearchParams(prev)
        if (id) n.set('sujet', String(id))
        else n.delete('sujet')
        return n
      })
    },
    [setSp]
  )

  const badge = (key: RexTab): number => {
    if (!overview) return 0
    if (key === 'actions') return overview.mine.actions.length
    if (key === 'reflexes') return overview.mine.reflexes_a_positionner.length
    if (key === 'retours') return overview.mine.sujets_a_traiter.length
    return 0
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Thermometer size={24} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">REX Canicule 2026</h1>
          <p className="text-sm text-slate-500">
            Retour d'expérience collaboratif du CODIR · à partir du compte rendu du 14 octobre 2026 et du tableau des travaux de confort
          </p>
        </div>
      </header>

      <nav className="scroll-x flex gap-1 border-b border-slate-200" aria-label="Sections du REX Canicule">
        {TABS.map(({ key, label, icon: Icon }) => {
          const n = badge(key)
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => goto(key)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? 'border-ville-blue text-ville-blue' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon size={16} />
              {label}
              {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ville-blue px-1.5 text-[11px] font-semibold text-white" title="À traiter pour votre direction">{n}</span>}
            </button>
          )
        })}
      </nav>

      {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!overview && !error && <p className="text-sm text-slate-400">Chargement du REX…</p>}

      {overview && tab === 'synthese' && <RexSynthese overview={overview} onGoto={goto} onOpenSujet={openSujet} />}
      {overview && tab === 'retours' && <RexRetours thematiques={thematiques} mine={overview.mine} onChanged={changed} onOpenSujet={openSujet} />}
      {overview && tab === 'actions' && (
        <RexActions thematiques={thematiques} mine={overview.mine} version={version} onChanged={changed} onOpenSujet={openSujet} initialEngagementId={engagementParam} />
      )}
      {overview && tab === 'reflexes' && (
        <RexReflexes version={version} mine={overview.mine} codirCodes={overview.participation.map((p) => p.code)} onChanged={changed} onOpenSujet={openSujet} />
      )}
      {overview && tab === 'travaux' && <RexTravaux version={version} onChanged={changed} />}

      {sujetParam != null && (
        <SujetModal sujetId={sujetParam} thematiques={thematiques} version={version} onChanged={changed} onClose={() => openSujet(null)} />
      )}
    </div>
  )
}
