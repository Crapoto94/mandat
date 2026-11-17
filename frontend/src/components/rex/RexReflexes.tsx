import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Clock, ListChecks, MessageSquare, Plus, Printer, Users } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { MOMENTS, ORIGINES, REFLEXE_STATUTS } from '../../lib/rex'
import type { RexMine, RexMoment, RexReflexe, RexReflexeStatut } from '../../types.rex'
import { CommentThread, DirectionChips, Field, Modal, Pill, PositionBar, btnGhost, btnPrimary, inputCls } from './shared'

const ORDER: RexMoment[] = ['preparation', 'veille', 'orange', 'rouge', 'apres']

export default function RexReflexes({
  version,
  mine,
  codirCodes,
  onChanged,
  onOpenSujet,
}: {
  version: number
  mine: RexMine | null
  codirCodes: string[]
  onChanged: () => void
  onOpenSujet: (id: number) => void
}) {
  const [reflexes, setReflexes] = useState<RexReflexe[]>([])
  const [loading, setLoading] = useState(true)
  const [fiche, setFiche] = useState(false)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<RexReflexe | { moment: RexMoment } | null>(null)
  const [sp] = useSearchParams()
  const [onlyTodo, setOnlyTodo] = useState(sp.get('todo') === '1')
  const { user } = useAuth()

  useEffect(() => {
    setLoading(true)
    api.get('/rex/reflexes').then((r) => setReflexes(r.data)).finally(() => setLoading(false))
  }, [version])

  const todo = new Set((mine?.reflexes_a_positionner || []).map((r) => r.id))
  const byMoment = useMemo(() => {
    const m = new Map<RexMoment, RexReflexe[]>()
    for (const r of reflexes) {
      if (onlyTodo && !todo.has(r.id)) continue
      m.set(r.moment, [...(m.get(r.moment) || []), r])
    }
    return m
  }, [reflexes, onlyTodo, mine]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) =>
    setOpen((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function setStatut(r: RexReflexe, statut: RexReflexeStatut) {
    await api.patch(`/rex/reflexes/${r.id}`, { statut })
    onChanged()
  }

  const total = reflexes.length
  const valides = reflexes.filter((r) => r.statut === 'valide').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1 text-sm text-slate-600">
          <p>
            Les <strong>réflexes communs</strong> : ce que <em>toutes</em> les directions font, au même moment, pour que la Ville réagisse d'une seule voix.
            Chaque réflexe est proposé, puis <strong>chaque direction se positionne</strong> (d'accord, sous réserve, pas d'accord). Une fois le consensus
            atteint, le CODIR le valide.
          </p>
          <p className="text-xs text-slate-500">
            {valides}/{total} réflexes validés ·{' '}
            {mine?.reflexes_a_positionner.length ? `${mine.reflexes_a_positionner.length} attendent la position de votre direction` : 'votre direction a pris position sur tous les réflexes'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} className="accent-[#0055A4]" />
            Ceux où je dois me positionner
          </label>
          <button onClick={() => setFiche((v) => !v)} className={btnGhost} aria-pressed={fiche}>
            <ListChecks size={15} /> {fiche ? 'Vue détaillée' : 'Vue fiche'}
          </button>
          {fiche && (
            <button onClick={() => window.print()} className={btnGhost}>
              <Printer size={15} /> Imprimer
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Chargement…</p>}

      <div className="space-y-6">
        {ORDER.map((m) => {
          const list = byMoment.get(m) || []
          const meta = MOMENTS[m]
          if (!list.length && onlyTodo) return null
          return (
            <section key={m} className="rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3" style={{ borderLeft: `6px solid ${meta.dot}`, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{meta.label}</h2>
                  <p className="text-xs text-slate-500">{meta.sous}</p>
                </div>
                <span className="text-xs text-slate-400">
                  {list.filter((r) => r.statut === 'valide').length}/{list.length} validés
                </span>
                <button onClick={() => setEditing({ moment: m })} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-ville-blue hover:underline">
                  <Plus size={14} /> Proposer un réflexe
                </button>
              </header>
              <ul className="divide-y divide-slate-100">
                {list.map((r) => {
                  const expanded = open.has(r.id) && !fiche
                  const answered = new Set(r.positions.directions.map((d) => d.toUpperCase()))
                  const missing = codirCodes.filter((c) => !answered.has(c.toUpperCase()))
                  const pct = codirCodes.length ? Math.round(((codirCodes.length - missing.length) / codirCodes.length) * 100) : 0
                  return (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => !fiche && toggle(r.id)} className="flex items-start gap-1.5 text-left" disabled={fiche}>
                              {!fiche && (expanded ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400" />)}
                              {fiche && <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-slate-400" aria-hidden />}
                              <span className="text-sm font-semibold text-slate-900">{r.titre}</span>
                            </button>
                            {r.origine === 'analyse' && <Pill className="bg-violet-50 text-violet-700" title={ORIGINES.analyse}>Proposé par analyse</Pill>}
                            {todo.has(r.id) && !fiche && <Pill className="bg-amber-100 text-amber-800">Votre position attendue</Pill>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              Qui : <DirectionChips text={r.responsable} highlight={mine?.codes} />
                            </span>
                            {r.delai && (
                              <span className="inline-flex items-center gap-1">
                                <Clock size={12} /> {r.delai}
                              </span>
                            )}
                            {!fiche && r.commentaires > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare size={12} /> {r.commentaires}
                              </span>
                            )}
                          </div>
                        </div>
                        {!fiche && (
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <select
                              value={r.statut}
                              onChange={(e) => setStatut(r, e.target.value as RexReflexeStatut)}
                              className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${REFLEXE_STATUTS[r.statut].className}`}
                              aria-label="Statut du réflexe"
                            >
                              {Object.entries(REFLEXE_STATUTS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={missing.length ? `Pas encore de position : ${missing.join(', ')}` : 'Toutes les directions ont répondu'}>
                              <Users size={12} /> {codirCodes.length - missing.length}/{codirCodes.length} directions
                            </span>
                            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                              <span className="block h-full rounded-full bg-ville-blue" style={{ width: `${pct}%` }} />
                            </span>
                          </div>
                        )}
                      </div>

                      {!fiche && (
                        <div className="mt-2 pl-5">
                          <PositionBar basePath={`/rex/reflexes/${r.id}`} summary={r.positions} onChange={onChanged} compact={!expanded} />
                        </div>
                      )}

                      {expanded && (
                        <div className="mt-3 space-y-4 pl-5">
                          {r.description && <p className="whitespace-pre-line text-sm text-slate-700">{r.description}</p>}
                          <PositionDetail r={r} />
                          {!!missing.length && (
                            <p className="text-xs text-slate-500">
                              <strong>Pas encore de position :</strong> {missing.join(', ')}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            {r.sujet_id && (
                              <button onClick={() => onOpenSujet(r.sujet_id!)} className="underline decoration-dotted hover:text-ville-blue">
                                Sujet du REX : {r.sujet_libelle}
                              </button>
                            )}
                            <button onClick={() => setEditing(r)} className="font-medium text-ville-blue hover:underline">
                              Modifier le réflexe
                            </button>
                          </div>
                          <CommentThread type="reflexe" id={r.id} onChange={onChanged} />
                        </div>
                      )}
                    </li>
                  )
                })}
                {!list.length && <li className="px-4 py-3 text-sm text-slate-400">Aucun réflexe pour ce moment.</li>}
              </ul>
            </section>
          )
        })}
      </div>

      {editing && (
        <ReflexeEditor
          reflexe={'id' in editing ? editing : null}
          moment={editing.moment}
          canDelete={user?.role === 'admin'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function PositionDetail({ r }: { r: RexReflexe }) {
  const withText = r.positions_detail.filter((p) => p.position !== 'accord' && p.commentaire)
  if (!withText.length) return null
  return (
    <div className="space-y-1.5 rounded-lg bg-amber-50 p-3 text-xs">
      <p className="font-semibold text-amber-900">Réserves et désaccords à lever</p>
      {withText.map((p, i) => (
        <p key={i} className="text-amber-900">
          <strong>{p.direction || p.display_name}</strong> ({p.position === 'reserve' ? 'sous réserve' : "pas d'accord"}) : {p.commentaire}
        </p>
      ))}
    </div>
  )
}

function ReflexeEditor({
  reflexe, moment, canDelete, onClose, onSaved,
}: {
  reflexe: RexReflexe | null
  moment: RexMoment
  canDelete: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [v, setV] = useState({
    moment: reflexe?.moment || moment,
    titre: reflexe?.titre || '',
    description: reflexe?.description || '',
    responsable: reflexe?.responsable || '',
    delai: reflexe?.delai || '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (reflexe) await api.patch(`/rex/reflexes/${reflexe.id}`, v)
      else await api.post('/rex/reflexes', v)
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!reflexe) return
    try {
      await api.delete(`/rex/reflexes/${reflexe.id}`)
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Modal title={reflexe ? 'Modifier le réflexe' : 'Proposer un réflexe commun'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Quand ?">
          <select value={v.moment} onChange={set('moment')} className={inputCls}>
            {ORDER.map((m) => (
              <option key={m} value={m}>
                {MOMENTS[m].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Le réflexe (une action, à l'impératif)">
          <input autoFocus value={v.titre} onChange={set('titre')} required className={inputCls} placeholder="Ex. Prévenir son équipe d'astreinte" />
        </Field>
        <Field label="Précisions / comment">
          <textarea value={v.description} onChange={set('description')} rows={3} className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Qui ?" hint="Directions responsables, ou « Toutes les directions »">
            <input value={v.responsable} onChange={set('responsable')} className={inputCls} />
          </Field>
          <Field label="Dans quel délai ?">
            <input value={v.delai} onChange={set('delai')} className={inputCls} placeholder="Ex. Dans les 24 h" />
          </Field>
        </div>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy || !v.titre.trim()} className={btnPrimary}>
            Enregistrer
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            Annuler
          </button>
          {reflexe && canDelete && (
            <button type="button" onClick={remove} className="ml-auto text-sm text-red-600 hover:underline">
              Supprimer
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
