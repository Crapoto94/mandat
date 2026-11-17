import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Thermometer } from 'lucide-react'
import { api } from '../../lib/api'
import { ACTION_STATUTS, PARTIES, SUJET_STATUTS, formatDay } from '../../lib/rex'
import type { RexActionStatut, RexSujetStatut } from '../../types.rex'
import { DirectionChips, Pill } from './shared'

interface Linked {
  sujets: { id: number; libelle: string; statut: RexSujetStatut; thematique_titre: string; partie: 1 | 2 | 3; motif: string | null }[]
  actions: { id: number; titre: string; statut: RexActionStatut; pilote_direction: string | null; echeance: string | null; echeance_texte: string | null; motif: string | null }[]
}

/**
 * Sur la fiche d'un engagement du mandat : ce que le REX Canicule 2026 en dit
 * (sujets et actions rattachés). N'affiche rien si l'engagement n'est pas concerné.
 */
export default function RexEngagementBox({ engagementId }: { engagementId: number }) {
  const [data, setData] = useState<Linked | null>(null)

  useEffect(() => {
    api.get(`/rex/by-engagement/${engagementId}`).then((r) => setData(r.data)).catch(() => setData(null))
  }, [engagementId])

  if (!data || (!data.sujets.length && !data.actions.length)) return null

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Thermometer size={16} className="text-orange-600" /> REX Canicule 2026 — ce que le retour d'expérience dit de cet engagement
        </h2>
        <Link to={`/rex-canicule?onglet=actions&engagement=${engagementId}`} className="inline-flex items-center gap-1 text-xs font-medium text-ville-blue hover:underline">
          Voir dans le REX <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {!!data.sujets.length && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Sujets du REX concernés</h3>
            <ul className="space-y-2">
              {data.sujets.map((s) => (
                <li key={s.id} className="text-sm">
                  <Link to={`/rex-canicule?onglet=retours&sujet=${s.id}`} className="font-medium text-slate-900 hover:text-ville-blue">
                    {s.libelle}
                  </Link>{' '}
                  <Pill className={SUJET_STATUTS[s.statut].className}>{SUJET_STATUTS[s.statut].label}</Pill>
                  <span className="block text-xs text-slate-500">
                    <span className="mr-1 rounded px-1 font-bold text-white" style={{ background: PARTIES[s.partie].couleur }}>
                      {s.partie}
                    </span>
                    {s.thematique_titre}
                  </span>
                  {s.motif && <span className="block text-xs text-slate-600">→ {s.motif}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!data.actions.length && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions qui font avancer cet engagement</h3>
            <ul className="space-y-2">
              {data.actions.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium text-slate-900">{a.titre}</span>{' '}
                  <Pill className={ACTION_STATUTS[a.statut].className}>{ACTION_STATUTS[a.statut].label}</Pill>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <DirectionChips text={a.pilote_direction} />
                    {(a.echeance || a.echeance_texte) && <span>{a.echeance ? formatDay(a.echeance) : a.echeance_texte}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
