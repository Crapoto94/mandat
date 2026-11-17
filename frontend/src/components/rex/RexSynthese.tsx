import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Gavel, Link2, MessageSquare, Sparkles, Users } from 'lucide-react'
import { MOMENTS, PARTIES, formatDay, relativeDay, formatDateTime } from '../../lib/rex'
import type { RexActivity, RexOverview } from '../../types.rex'
import type { RexTab } from '../../pages/RexCaniculePage'

function Bar({ value, total, color = '#0055A4', label, dark }: { value: number; total: number; color?: string; label: string; dark?: boolean }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={`font-medium ${dark ? 'text-white' : 'text-slate-700'}`}>{label}</span>
        <span className={dark ? 'text-white/80' : 'text-slate-500'}>
          <strong className={dark ? 'text-white' : 'text-slate-900'}>{value}</strong>/{total} · {pct} %
        </span>
      </div>
      <div className={`h-2.5 overflow-hidden rounded-full ${dark ? 'bg-white/25' : 'bg-slate-100'}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Card({ title, icon: Icon, children, className = '', right }: { title: string; icon?: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {Icon && <Icon size={16} className="text-ville-blue" />}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function activityText(e: RexActivity): string {
  if (e.kind === 'comment') return `a commenté « ${(e.valeur || '').slice(0, 90)}${(e.valeur || '').length > 90 ? '…' : ''} »`
  if (e.champ === 'creation') return 'a créé'
  if (e.champ === 'position') return `a pris position (${e.valeur})`
  if (e.champ === 'statut') return `a changé le statut → ${e.valeur}`
  return `a modifié ${e.champ_label || e.champ}`
}

export default function RexSynthese({
  overview: o,
  onGoto,
  onOpenSujet,
}: {
  overview: RexOverview
  onGoto: (tab: RexTab, params?: Record<string, string>) => void
  onOpenSujet: (id: number) => void
}) {
  const decides = o.sujets.par_statut.valide + o.sujets.par_statut.en_oeuvre + o.sujets.par_statut.realise
  const actifs = o.actions.total - o.actions.par_statut.abandonne
  const mine = o.mine
  const maxPos = o.reflexes.total || 1
  const silencieuses = o.participation.filter((p) => !p.positions && !p.commentaires && !p.actions_faites)

  return (
    <div className="space-y-5">
      {/* Cap : la saison 2027 */}
      <section className="overflow-hidden rounded-xl bg-gradient-to-r from-ville-blue-dark to-ville-blue p-6 text-white">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm font-medium text-white/80">Prêts avant les premières chaleurs de {formatDay(o.saison_cible).split(' ').slice(-1)[0]}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums">{Math.max(o.jours_restants, 0)}</span>
              <span className="text-lg">jours · échéance au {formatDay(o.saison_cible)}</span>
            </p>
          </div>
          <div className="min-w-[16rem] flex-1 space-y-3 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
            <Bar label="Réflexes communs validés" value={o.reflexes.valides} total={o.reflexes.total} color="#ffffff" dark />
            <Bar label="Actions réalisées" value={o.actions.par_statut.fait} total={actifs} color="#ffffff" dark />
            <Bar label="Sujets arbitrés par le CODIR" value={decides} total={o.sujets.total} color="#ffffff" dark />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Pour vous */}
        <Card
          title={mine.direction ? `Pour votre direction (${mine.codes.join(', ') || mine.direction})` : 'Pour vous'}
          icon={Sparkles}
          className="lg:col-span-2"
        >
          {!mine.codes.length ? (
            <p className="text-sm text-slate-500">
              Votre direction n'a pas pu être rapprochée du référentiel : vous pouvez tout de même consulter, commenter et prendre position depuis les onglets.
            </p>
          ) : mine.total === 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 size={18} /> Votre direction est à jour : rien en attente. Merci !
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <button onClick={() => onGoto('actions', { mine: '1' })} className="rounded-lg border border-slate-200 p-3 text-left hover:border-ville-blue/50 hover:bg-slate-50">
                  <p className="text-2xl font-bold text-slate-900">{mine.actions.length}</p>
                  <p className="text-sm text-slate-600">action{mine.actions.length > 1 ? 's' : ''} à réaliser</p>
                  {mine.actions.some((a) => a.en_retard) && <p className="mt-0.5 text-xs font-semibold text-red-600">dont {mine.actions.filter((a) => a.en_retard).length} en retard</p>}
                </button>
                <button onClick={() => onGoto('reflexes', { todo: '1' })} className="rounded-lg border border-slate-200 p-3 text-left hover:border-ville-blue/50 hover:bg-slate-50">
                  <p className="text-2xl font-bold text-slate-900">{mine.reflexes_a_positionner.length}</p>
                  <p className="text-sm text-slate-600">réflexe{mine.reflexes_a_positionner.length > 1 ? 's' : ''} où se positionner</p>
                </button>
                <button onClick={() => onGoto('retours', { filtre: 'ma_direction' })} className="rounded-lg border border-slate-200 p-3 text-left hover:border-ville-blue/50 hover:bg-slate-50">
                  <p className="text-2xl font-bold text-slate-900">{mine.sujets_a_traiter.length}</p>
                  <p className="text-sm text-slate-600">sujet{mine.sujets_a_traiter.length > 1 ? 's' : ''} que vous pilotez</p>
                </button>
              </div>
              {!!mine.actions.length && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {mine.actions.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{a.titre}</span>
                      <span className={`shrink-0 text-xs ${a.en_retard ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {a.en_retard && <AlertTriangle size={12} className="mr-1 inline" />}
                        {a.echeance ? formatDay(a.echeance) : a.echeance_texte || ''}
                      </span>
                    </li>
                  ))}
                  {mine.actions.length > 5 && (
                    <li className="px-3 py-2 text-xs text-slate-500">
                      … et {mine.actions.length - 5} autre{mine.actions.length - 5 > 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </Card>

        {/* Arbitrages */}
        <Card title="À arbitrer en CODIR" icon={Gavel}>
          {o.sujets_a_arbitrer.length ? (
            <ul className="space-y-1.5">
              {o.sujets_a_arbitrer.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onOpenSujet(s.id)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: PARTIES[s.partie].couleur }} />
                    <span className="text-slate-800">{s.libelle}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Aucun sujet n'est encore soumis à arbitrage. Quand un sujet est mûr, passez-le au statut « À arbitrer en CODIR » : il apparaîtra ici pour la prochaine séance.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Chantiers */}
        <Card title="Ce qu'il reste à compléter" icon={AlertTriangle}>
          <ul className="space-y-2 text-sm">
            <Item n={o.actions.sans_pilote} label="actions sans pilote désigné" onClick={() => onGoto('actions', { sanspilote: '1' })} />
            <Item n={o.actions.a_confirmer} label="actions déduites de l'analyse, à confirmer par leur pilote" onClick={() => onGoto('actions')} />
            <Item n={o.sujets.a_completer} label="sujets sans pilote ou sans mesure 2027" onClick={() => onGoto('retours', { filtre: 'a_completer' })} />
            <Item n={o.reflexes.a_revoir} label="réflexes à revoir" onClick={() => onGoto('reflexes')} />
            <Item n={o.actions.en_retard} label="actions en retard" tone="red" onClick={() => onGoto('actions', { retard: '1' })} />
          </ul>
          {!!o.sujets_a_completer.length && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">Les plus urgents à renseigner</p>
              <ul className="space-y-1">
                {o.sujets_a_completer.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <button onClick={() => onOpenSujet(s.id)} className="text-left text-xs text-slate-700 underline decoration-dotted hover:text-ville-blue">
                      {s.libelle} <span className="text-amber-700">({s.manque.join(', ')})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Mandat */}
        <Card title="Lien avec le mandat" icon={Link2}>
          <p className="text-sm text-slate-600">
            <strong className="text-2xl text-slate-900">{o.engagements_lies}</strong> engagements du mandat sont concernés par la canicule.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {o.sujets.lies_mandat}/{o.sujets.total} sujets du REX sont rattachés à un engagement. Chaque fiche engagement affiche désormais le REX qui la concerne.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Un sujet sans engagement du mandat est un sujet « opérationnel » (ex. ventilateurs, accès aux centres techniques) : c'est normal.
          </p>
        </Card>

        {/* Travaux */}
        <Card title="Travaux de confort" icon={CalendarClock} right={<button onClick={() => onGoto('travaux')} className="text-xs font-medium text-ville-blue hover:underline">Voir</button>}>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-500">Brasseurs d'air</dt>
              <dd className="text-xl font-bold text-slate-900">{o.travaux.brasseurs}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-500">Ventilateurs</dt>
              <dd className="text-xl font-bold text-slate-900">{o.travaux.ventilateurs}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-500">Interventions</dt>
              <dd className="text-xl font-bold text-slate-900">{o.travaux.total}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            {o.travaux.realises} réalisées, {o.travaux.prevus} prévues ou à confirmer (2026 et 1er semestre 2027).
          </p>
        </Card>
      </div>

      {/* Réflexes par moment */}
      <Card title="Réflexes communs, par moment" icon={Clock} right={<button onClick={() => onGoto('reflexes')} className="inline-flex items-center gap-1 text-xs font-medium text-ville-blue hover:underline">Ouvrir <ArrowRight size={12} /></button>}>
        <div className="grid gap-3 sm:grid-cols-5">
          {(Object.keys(MOMENTS) as (keyof typeof MOMENTS)[]).map((m) => {
            const x = o.reflexes.par_moment[m]
            return (
              <button key={m} onClick={() => onGoto('reflexes')} className="rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50" style={{ borderTop: `4px solid ${MOMENTS[m].dot}` }}>
                <p className="text-sm font-semibold text-slate-900">{MOMENTS[m].label}</p>
                <p className="text-xs text-slate-500">
                  {x.valides}/{x.total} validés
                </p>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Participation */}
        <Card title="Participation des directions du CODIR" icon={Users} className="lg:col-span-2">
          <div className="scroll-x">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">Direction</th>
                  <th className="py-1.5 pr-2 font-medium">Réflexes positionnés</th>
                  <th className="py-1.5 pr-2 font-medium">Contributions</th>
                  <th className="py-1.5 pr-2 font-medium">Actions faites / pilotées</th>
                  <th className="py-1.5 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {o.participation.map((p) => {
                  const mineRow = mine.codes.map((c) => c.toUpperCase()).includes(p.code)
                  return (
                    <tr key={p.code} className={`border-b border-slate-100 last:border-0 ${mineRow ? 'bg-blue-50/60' : ''}`}>
                      <td className="py-1.5 pr-2 font-semibold text-slate-900">
                        {p.code}
                        {mineRow && <span className="ml-1.5 rounded bg-ville-blue px-1 py-0.5 text-[10px] font-semibold text-white">vous</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                            <span className="block h-full rounded-full bg-ville-blue" style={{ width: `${(p.reflexes_positionnes / maxPos) * 100}%` }} />
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {p.reflexes_positionnes}/{o.reflexes.total}
                          </span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                        <MessageSquare size={12} className="mr-1 inline text-slate-400" />
                        {p.commentaires}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                        {p.actions_faites}/{p.actions_pilotees}
                      </td>
                      <td className="py-1.5 text-xs text-slate-500">{relativeDay(p.derniere_activite)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!!silencieuses.length && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Pas encore de contribution :</strong> {silencieuses.map((p) => p.code).join(', ')}. Une position sur les réflexes communs prend deux minutes.
            </p>
          )}
        </Card>

        {/* Activité */}
        <Card title="Activité récente" icon={MessageSquare}>
          {o.activite.length ? (
            <ul className="space-y-2.5">
              {o.activite.map((e, i) => (
                <li key={i} className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{e.by || 'Import'}</span> {activityText(e)}
                  {e.cible_label && <span className="block truncate text-slate-500">« {e.cible_label} »</span>}
                  <span className="text-slate-400">{formatDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Rien pour l'instant. La première contribution lancera le fil.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function Item({ n, label, onClick, tone }: { n: number; label: string; onClick: () => void; tone?: 'red' }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-baseline gap-2 text-left hover:text-ville-blue">
        <span className={`w-7 shrink-0 text-right text-lg font-bold tabular-nums ${n === 0 ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{n}</span>
        <span className="text-slate-600">{label}</span>
      </button>
    </li>
  )
}
