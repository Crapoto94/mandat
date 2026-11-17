import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, HandHeart, MessageSquare, Plus, Search, Trash2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { ACTION_STATUTS, ORIGINES, PARTIES, formatDay, splitDirections } from '../../lib/rex'
import type { Direction } from '../../types'
import type { RexAction, RexActionStatut, RexMine, RexThematique } from '../../types.rex'
import {
  CommentThread, DirectionChips, EngagementChips, EngagementPicker, Field, Modal, Pill, PositionBar,
  btnGhost, btnPrimary, inputCls, useEngagements,
} from './shared'

type Filtre = 'actives' | 'a_faire' | 'en_cours' | 'fait' | 'toutes'

export default function RexActions({
  thematiques,
  mine,
  version,
  onChanged,
  onOpenSujet,
  initialEngagementId,
}: {
  thematiques: RexThematique[]
  mine: RexMine | null
  version: number
  onChanged: () => void
  onOpenSujet: (id: number) => void
  initialEngagementId?: number | null
}) {
  const [actions, setActions] = useState<RexAction[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<Filtre>('actives')
  const [direction, setDirection] = useState('')
  const [q, setQ] = useState('')
  const [sp] = useSearchParams()
  const [onlyMine, setOnlyMine] = useState(sp.get('mine') === '1')
  const [onlyLate, setOnlyLate] = useState(sp.get('retard') === '1')
  const [onlyNoPilot, setOnlyNoPilot] = useState(sp.get('sanspilote') === '1')
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    setLoading(true)
    api
      .get('/rex/actions', { params: initialEngagementId ? { engagement_id: initialEngagementId } : {} })
      .then((r) => setActions(r.data))
      .finally(() => setLoading(false))
  }, [version, initialEngagementId])

  const directionsList = useMemo(() => {
    const set = new Set<string>()
    actions.forEach((a) => splitDirections(a.pilote_direction).forEach((d) => set.add(d)))
    return [...set].sort()
  }, [actions])

  const myCodes = useMemo(() => new Set((mine?.codes || []).map((c) => c.toUpperCase())), [mine])
  const isMine = (a: RexAction) =>
    a.pilote_sub === user?.sub || splitDirections(a.pilote_direction).some((d) => myCodes.has(d.toUpperCase()))

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return actions.filter((a) => {
      if (filtre === 'actives' && !['a_faire', 'en_cours'].includes(a.statut)) return false
      if (['a_faire', 'en_cours', 'fait'].includes(filtre) && a.statut !== filtre) return false
      if (direction && !splitDirections(a.pilote_direction).includes(direction)) return false
      if (onlyMine && !isMine(a)) return false
      if (onlyLate && !a.en_retard) return false
      if (onlyNoPilot && a.pilote_direction) return false
      if (t && !`${a.titre} ${a.description || ''} ${a.sujet_libelle || ''} ${a.pilote_direction || ''}`.toLowerCase().includes(t)) return false
      return true
    })
  }, [actions, filtre, direction, q, onlyMine, onlyLate, onlyNoPilot, myCodes]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatut(a: RexAction, statut: RexActionStatut) {
    await api.patch(`/rex/actions/${a.id}`, { statut })
    onChanged()
  }

  async function prendre(a: RexAction) {
    await api.post(`/rex/actions/${a.id}/prendre`)
    onChanged()
  }

  const counts = {
    actives: actions.filter((a) => ['a_faire', 'en_cours'].includes(a.statut)).length,
    a_faire: actions.filter((a) => a.statut === 'a_faire').length,
    en_cours: actions.filter((a) => a.statut === 'en_cours').length,
    fait: actions.filter((a) => a.statut === 'fait').length,
    toutes: actions.length,
  }
  const labels: Record<Filtre, string> = { actives: 'À réaliser', a_faire: 'À faire', en_cours: 'En cours', fait: 'Faites', toutes: 'Toutes' }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-600">
          Les actions issues du retour d'expérience. Chacune a un pilote, une échéance <strong>avant la saison</strong> et peut être rattachée à un
          engagement du mandat. Prenez celles de votre direction, faites-les avancer, signalez ce qui bloque.
        </p>
        <button onClick={() => setEditing('new')} className={btnPrimary}>
          <Plus size={16} /> Nouvelle action
        </button>
      </div>

      {initialEngagementId && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Actions liées à l'engagement du mandat n°{actions[0]?.engagements.find((e) => e.id === initialEngagementId)?.numero ?? initialEngagementId}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(labels) as Filtre[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${filtre === f ? 'bg-ville-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {labels[f]} <span className="opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une action…" className={`${inputCls} pl-8`} />
        </div>
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Toutes les directions</option>
          {directionsList.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {!!mine?.codes.length && (
          <Toggle on={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
            Ma direction
          </Toggle>
        )}
        <Toggle on={onlyLate} onClick={() => setOnlyLate((v) => !v)}>
          En retard
        </Toggle>
        <Toggle on={onlyNoPilot} onClick={() => setOnlyNoPilot((v) => !v)}>
          Sans pilote
        </Toggle>
      </div>

      {loading && <p className="text-sm text-slate-400">Chargement…</p>}
      <div className="space-y-2">
        {shown.map((a) => (
          <div key={a.id} className={`rounded-xl border bg-white p-4 ${a.en_retard ? 'border-red-200' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {a.priorite === 'haute' && (
                    <Pill className="bg-red-50 text-red-700" title="Priorité haute">
                      Prioritaire
                    </Pill>
                  )}
                  <button onClick={() => setEditing(a.id)} className="text-left text-sm font-semibold text-slate-900 hover:text-ville-blue">
                    {a.titre}
                  </button>
                  {a.origine === 'analyse' && (
                    <Pill className="bg-violet-50 text-violet-700" title={ORIGINES.analyse}>
                      À confirmer
                    </Pill>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    Pilote : <DirectionChips text={a.pilote_direction} highlight={mine?.codes} />
                    {a.pilote_nom && <span className="text-slate-600">· {a.pilote_nom}</span>}
                  </span>
                  <span className={`inline-flex items-center gap-1 ${a.en_retard ? 'font-semibold text-red-600' : ''}`}>
                    {a.en_retard ? <AlertTriangle size={13} /> : <CalendarClock size={13} />}
                    {a.echeance ? formatDay(a.echeance) : 'Sans date'}
                    {a.echeance_texte && <span className="font-normal text-slate-400">({a.echeance_texte})</span>}
                  </span>
                  {a.sujet_id && (
                    <button onClick={() => onOpenSujet(a.sujet_id!)} className="max-w-xs truncate text-left underline decoration-dotted hover:text-ville-blue" title={a.sujet_libelle || ''}>
                      {a.partie ? `${PARTIES[a.partie].court} · ` : ''}
                      {a.sujet_libelle}
                    </button>
                  )}
                  {!!a.commentaires && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={13} /> {a.commentaires}
                    </span>
                  )}
                </div>
                {!!a.engagements.length && (
                  <div className="mt-2">
                    <EngagementChips items={a.engagements} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <select
                  value={a.statut}
                  onChange={(e) => setStatut(a, e.target.value as RexActionStatut)}
                  className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${ACTION_STATUTS[a.statut].className}`}
                >
                  {Object.entries(ACTION_STATUTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                {['a_faire', 'en_cours'].includes(a.statut) && a.pilote_sub !== user?.sub && (
                  <button onClick={() => prendre(a)} className="inline-flex items-center gap-1 rounded-md border border-ville-blue/30 px-2 py-1 text-xs font-medium text-ville-blue hover:bg-ville-blue/5">
                    <HandHeart size={13} /> {a.pilote_sub ? 'Reprendre' : 'Je prends'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {!loading && !shown.length && (
          <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Aucune action ne correspond à ces filtres.</p>
        )}
      </div>

      {editing && (typeof editing === 'string' || actions.some((a) => a.id === editing)) && (
        <ActionEditor
          action={typeof editing === 'number' ? actions.find((a) => a.id === editing) || null : null}
          thematiques={thematiques}
          onClose={() => setEditing(null)}
          onTouched={onChanged}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-md border px-2.5 py-1.5 text-sm font-medium ${on ? 'border-ville-blue bg-ville-blue/10 text-ville-blue' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  )
}

/** Création / modification d'une action (+ discussion et positionnement en mode édition). */
export function ActionEditor({
  action,
  thematiques,
  defaultSujetId,
  onClose,
  onSaved,
  onTouched,
}: {
  action: RexAction | null
  thematiques: RexThematique[]
  defaultSujetId?: number | null
  onClose: () => void
  /** Après enregistrement / suppression : ferme la fenêtre. */
  onSaved: () => void
  /** Après un commentaire ou une prise de position : rafraîchit sans fermer. */
  onTouched?: () => void
}) {
  const engagements = useEngagements()
  const [directions, setDirections] = useState<Direction[]>([])
  const [titre, setTitre] = useState(action?.titre || '')
  const [description, setDescription] = useState(action?.description || '')
  const [sujetId, setSujetId] = useState<number | ''>(action?.sujet_id ?? defaultSujetId ?? '')
  const [pilote, setPilote] = useState(action?.pilote_direction || '')
  const [piloteNom, setPiloteNom] = useState(action?.pilote_nom || '')
  const [echeance, setEcheance] = useState(action?.echeance || '')
  const [echeanceTexte, setEcheanceTexte] = useState(action?.echeance_texte || '')
  const [priorite, setPriorite] = useState(action?.priorite || 'normale')
  const [engagementIds, setEngagementIds] = useState<number[]>(action?.engagements.map((e) => e.id) || [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    api.get('/directions').then((r) => setDirections(r.data)).catch(() => {})
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      titre, description, sujet_id: sujetId || null, pilote_direction: pilote, pilote_nom: piloteNom,
      echeance: echeance || null, echeance_texte: echeanceTexte, priorite, engagement_ids: engagementIds,
    }
    try {
      if (action) await api.patch(`/rex/actions/${action.id}`, payload)
      else await api.post('/rex/actions', payload)
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!action) return
    setBusy(true)
    try {
      await api.delete(`/rex/actions/${action.id}`)
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={action ? "Modifier l'action" : 'Nouvelle action'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {action?.origine === 'analyse' && (
          <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-800">
            Cette action a été déduite de l'analyse des documents. Enregistrez-la (même sans changement) ou ajustez-la pour la confirmer.
          </p>
        )}
        <Field label="Action à réaliser">
          <input value={titre} onChange={(e) => setTitre(e.target.value)} required className={inputCls} autoFocus={!action} />
        </Field>
        <Field label="Précisions">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Direction(s) pilote(s)" hint="Sigles séparés par une virgule (ex. DRH, DSI)">
            <input value={pilote} onChange={(e) => setPilote(e.target.value)} list="rex-directions" className={inputCls} />
            <datalist id="rex-directions">
              {directions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.libelle}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Référent·e (nom)">
            <div className="flex gap-2">
              <input value={piloteNom} onChange={(e) => setPiloteNom(e.target.value)} className={inputCls} />
              {user && (
                <button type="button" onClick={() => setPiloteNom(user.displayName)} className={`${btnGhost} whitespace-nowrap`}>
                  Moi
                </button>
              )}
            </div>
          </Field>
          <Field label="Échéance">
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Précision sur l'échéance" hint="Ex. « Avant mai 2027 », « Dès février 2027 »">
            <input value={echeanceTexte} onChange={(e) => setEcheanceTexte(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Rattachée au sujet du REX">
            <select value={sujetId} onChange={(e) => setSujetId(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
              <option value="">— Aucun —</option>
              {thematiques.map((t) => (
                <optgroup key={t.id} label={`${PARTIES[t.partie].court} · ${t.titre}`}>
                  {t.sujets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Priorité">
            <select value={priorite} onChange={(e) => setPriorite(e.target.value as 'normale' | 'haute')} className={inputCls}>
              <option value="normale">Normale</option>
              <option value="haute">Prioritaire (avant la saison)</option>
            </select>
          </Field>
        </div>
        <Field label={`Engagements du mandat concernés ${engagementIds.length ? `(${engagementIds.length})` : ''}`} hint="Rattachez l'action aux engagements qu'elle fait avancer.">
          <EngagementPicker value={engagementIds} onChange={setEngagementIds} engagements={engagements} />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !titre.trim()} className={btnPrimary}>
            {action ? 'Enregistrer' : "Créer l'action"}
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            Fermer
          </button>
          {action && (user?.role === 'admin') && (
            <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
              <Trash2 size={14} /> Supprimer
            </button>
          )}
        </div>
      </form>
      {action && (
        <div className="mt-6 space-y-5 border-t border-slate-200 pt-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Votre direction confirme-t-elle cette action ?</h3>
            <PositionBar basePath={`/rex/actions/${action.id}`} summary={action.positions} onChange={() => onTouched?.()} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Discussion</h3>
            <CommentThread type="action" id={action.id} onChange={() => onTouched?.()} />
          </div>
        </div>
      )}
    </Modal>
  )
}
