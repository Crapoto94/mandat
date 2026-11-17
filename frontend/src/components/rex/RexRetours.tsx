import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, ChevronDown, ChevronRight, Link2, MessageSquare, Pencil, Plus, Search, Target } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { MOMENTS, PARTIES, SUJET_STATUTS, ACTION_STATUTS, ORIGINES, formatDateTime, formatDay, splitDirections } from '../../lib/rex'
import type { RexAction, RexMine, RexSujet, RexSujetDetail, RexSujetStatut, RexThematique } from '../../types.rex'
import { ActionEditor } from './RexActions'
import {
  CommentThread, DirectionChips, EngagementChips, EngagementPicker, Field, Modal, Pill, PositionBar,
  btnGhost, btnPrimary, inputCls, useEngagements,
} from './shared'

type Filtre = 'tous' | 'a_completer' | 'a_arbitrer' | 'ma_direction'

export default function RexRetours({
  thematiques,
  mine,
  onChanged,
  onOpenSujet,
}: {
  thematiques: RexThematique[]
  mine: RexMine | null
  onChanged: () => void
  onOpenSujet: (id: number | null) => void
}) {
  const [sp] = useSearchParams()
  const [partie, setPartie] = useState<number>(0)
  const [filtre, setFiltre] = useState<Filtre>((['a_completer', 'a_arbitrer', 'ma_direction'] as string[]).includes(sp.get('filtre') || '') ? (sp.get('filtre') as Filtre) : 'tous')
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState<RexThematique | null>(null)
  const [addingThematique, setAddingThematique] = useState(false)

  const myCodes = useMemo(() => new Set((mine?.codes || []).map((c) => c.toUpperCase())), [mine])
  const isMine = (s: RexSujet) => splitDirections(s.pilotage).some((d) => myCodes.has(d.toUpperCase()))

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase()
    return thematiques
      .filter((th) => !partie || th.partie === partie)
      .map((th) => ({
        ...th,
        sujets: th.sujets.filter((s) => {
          if (filtre === 'a_completer' && !s.a_completer.length) return false
          if (filtre === 'a_arbitrer' && s.statut !== 'a_arbitrer') return false
          if (filtre === 'ma_direction' && !isMine(s)) return false
          if (t && !`${s.libelle} ${s.constat || ''} ${s.a_ameliorer || ''} ${s.mesures || ''} ${s.pilotage || ''}`.toLowerCase().includes(t)) return false
          return true
        }),
      }))
      .filter((th) => th.sujets.length || (filtre === 'tous' && !t))
  }, [thematiques, partie, filtre, q, myCodes]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-600">
        Le tableau du retour d'expérience, thématique par thématique : ce qui s'est passé, ce qui a fonctionné, ce qu'il faut améliorer et les mesures
        proposées pour 2027. <strong>Ouvrez un sujet</strong> pour le compléter, prendre position au nom de votre direction ou proposer une action.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2, 3].map((p) => (
            <button
              key={p}
              onClick={() => setPartie(p)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${partie === p ? 'bg-ville-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {p ? `${p}. ${PARTIES[p].court}` : 'Toutes les parties'}
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans le REX…" className={`${inputCls} pl-8`} />
        </div>
        <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className={`${inputCls} !w-auto`}>
          <option value="tous">Tous les sujets</option>
          <option value="a_completer">À compléter (pilote ou mesures manquants)</option>
          <option value="a_arbitrer">À arbitrer en CODIR</option>
          {!!mine?.codes.length && <option value="ma_direction">Piloté par ma direction</option>}
        </select>
        <button onClick={() => setAddingThematique(true)} className={btnGhost}>
          <Plus size={15} /> Thématique
        </button>
      </div>

      <div className="space-y-6">
        {visible.map((th) => {
          const open = !collapsed.has(th.id)
          return (
            <section key={th.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button onClick={() => toggle(th.id)} className="flex items-center gap-2 text-left" aria-expanded={open}>
                  {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: PARTIES[th.partie].couleur }}>
                    {th.partie}. {PARTIES[th.partie].court}
                  </span>
                  <h2 className="text-base font-semibold text-slate-900">{th.titre}</h2>
                  <span className="text-xs text-slate-400">{th.sujets.length} sujet{th.sujets.length > 1 ? 's' : ''}</span>
                </button>
                <button onClick={() => setCreating(th)} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-ville-blue hover:underline">
                  <Plus size={14} /> Ajouter un sujet
                </button>
              </div>
              {open && th.description && <p className="mb-2 ml-6 text-sm text-slate-500">{th.description}</p>}
              {open && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {th.sujets.map((s) => (
                    <SujetCard key={s.id} sujet={s} onOpen={() => onOpenSujet(s.id)} highlight={mine?.codes} />
                  ))}
                  {!th.sujets.length && <p className="text-sm text-slate-400">Aucun sujet pour ce filtre.</p>}
                </div>
              )}
            </section>
          )
        })}
        {!visible.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Rien ne correspond à cette recherche.</p>}
      </div>

      {creating && (
        <NewSujetModal
          thematique={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null)
            onChanged()
            onOpenSujet(id)
          }}
        />
      )}
      {addingThematique && (
        <NewThematiqueModal
          onClose={() => setAddingThematique(false)}
          onCreated={() => {
            setAddingThematique(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function SujetCard({ sujet: s, onOpen, highlight }: { sujet: RexSujet; onOpen: () => void; highlight?: string[] }) {
  const st = SUJET_STATUTS[s.statut]
  return (
    <button onClick={onOpen} className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:border-ville-blue/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-ville-blue">{s.libelle}</h3>
        <Pill className={`${st.className} shrink-0`}>{st.label}</Pill>
      </div>
      {s.constat && <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-600">{s.constat}</p>}
      {s.mesures && (
        <p className="line-clamp-2 whitespace-pre-line rounded-md bg-blue-50/70 px-2 py-1.5 text-xs text-blue-900">
          <span className="font-semibold">2027 · </span>
          {s.mesures}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-slate-500">
        <DirectionChips text={s.pilotage} highlight={highlight} />
        {!!s.engagements.length && (
          <span className="inline-flex items-center gap-1 text-ville-blue" title={s.engagements.map((e) => `n°${e.numero}`).join(', ')}>
            <Link2 size={12} /> {s.engagements.length} engagement{s.engagements.length > 1 ? 's' : ''}
          </span>
        )}
        {s.actions_total > 0 && (
          <span className="inline-flex items-center gap-1">
            <Target size={12} /> {s.actions_faites}/{s.actions_total} actions
          </span>
        )}
        {s.commentaires > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={12} /> {s.commentaires}
          </span>
        )}
        {s.positions.total > 0 && <span>{s.positions.total} position{s.positions.total > 1 ? 's' : ''}</span>}
        {!!s.a_completer.length && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
            <AlertCircle size={12} /> À compléter : {s.a_completer.join(', ')}
          </span>
        )}
      </div>
    </button>
  )
}

function Block({ title, text, tone }: { title: string; text: string | null; tone?: string }) {
  return (
    <div className={`rounded-lg p-3 ${tone || 'bg-slate-50'}`}>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      {text ? <p className="whitespace-pre-line text-sm text-slate-800">{text}</p> : <p className="text-sm italic text-slate-400">Non renseigné — à compléter.</p>}
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function SujetModal({
  sujetId, thematiques, version, onChanged, onClose,
}: {
  sujetId: number
  thematiques: RexThematique[]
  version: number
  onChanged: () => void
  onClose: () => void
}) {
  const [d, setD] = useState<RexSujetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editingLinks, setEditingLinks] = useState(false)
  const [actionEditing, setActionEditing] = useState<number | 'new' | null>(null)
  const [showCr, setShowCr] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const engagements = useEngagements()

  function load() {
    api.get(`/rex/sujets/${sujetId}`).then((r) => setD(r.data)).catch((e) => setError(apiErrorMessage(e)))
  }
  useEffect(load, [sujetId, version]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(values: Record<string, unknown>) {
    await api.patch(`/rex/sujets/${sujetId}`, values)
    onChanged()
  }

  if (error) return <Modal title="Sujet" onClose={onClose}><p className="text-sm text-red-600">{error}</p></Modal>
  if (!d) return <Modal title="Chargement…" onClose={onClose}><p className="text-sm text-slate-400">Chargement du sujet…</p></Modal>

  const editedAction = typeof actionEditing === 'number' ? d.actions.find((a) => a.id === actionEditing) || null : null

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            <span className="mr-1.5 rounded px-1.5 py-0.5 font-bold text-white" style={{ background: PARTIES[d.partie].couleur }}>
              {d.partie}
            </span>
            {d.thematique_titre}
          </span>
          <span>{d.libelle}</span>
        </span>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={d.statut}
            onChange={(e) => patch({ statut: e.target.value as RexSujetStatut })}
            className={`rounded-full border-0 px-3 py-1 text-sm font-medium ${SUJET_STATUTS[d.statut].className}`}
            aria-label="Statut du sujet"
          >
            {Object.entries(SUJET_STATUTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            Pilotage : <DirectionChips text={d.pilotage} />
          </span>
          <span className="text-xs text-slate-400">
            {ORIGINES[d.origine]} · modifié {formatDateTime(d.updated_at)}
            {d.updated_by ? ` par ${d.updated_by}` : ''}
          </span>
          <button onClick={() => setEditing((v) => !v)} className={`${btnGhost} ml-auto`}>
            <Pencil size={14} /> {editing ? 'Annuler' : 'Compléter / modifier'}
          </button>
        </div>

        {editing ? (
          <SujetForm
            sujet={d}
            thematiques={thematiques}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false)
              onChanged()
            }}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Block title="Constat / état des faits" text={d.constat} />
            <Block title="Ce qui a fonctionné" text={d.a_fonctionne} tone="bg-green-50" />
            <Block title="Ce qui est à améliorer" text={d.a_ameliorer} tone="bg-amber-50" />
            <Block title="Mesures correctives proposées pour 2027" text={d.mesures} tone="bg-blue-50" />
            <div className="md:col-span-2">
              <Block title="Décision du CODIR" text={d.decision} tone="bg-violet-50" />
            </div>
          </div>
        )}

        <Section
          title="Lien avec les engagements du mandat"
          right={
            <button onClick={() => setEditingLinks((v) => !v)} className="text-sm font-medium text-ville-blue hover:underline">
              {editingLinks ? 'Fermer' : 'Modifier'}
            </button>
          }
        >
          {editingLinks ? (
            <LinksEditor sujetId={d.id} initial={d.engagements.map((e) => e.id)} engagements={engagements} onSaved={() => { setEditingLinks(false); onChanged() }} />
          ) : d.engagements.length ? (
            <ul className="space-y-1.5">
              {d.engagements.map((e) => (
                <li key={e.id} className="text-sm">
                  <EngagementChips items={[e]} /> <span className="text-slate-700">{e.contenu}</span>
                  {e.motif && <span className="block pl-1 text-xs text-slate-500">→ {e.motif}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Aucun engagement du mandat n'est rattaché à ce sujet. S'il en fait avancer un, rattachez-le : l'engagement affichera ce REX sur sa fiche.
            </p>
          )}
        </Section>

        <Section
          title={`Actions (${d.actions.filter((a) => a.statut === 'fait').length}/${d.actions.length} faites)`}
          right={
            <button onClick={() => setActionEditing('new')} className="inline-flex items-center gap-1 text-sm font-medium text-ville-blue hover:underline">
              <Plus size={14} /> Proposer une action
            </button>
          }
        >
          {d.actions.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {d.actions.map((a) => (
                <ActionLine key={a.id} a={a} onOpen={() => setActionEditing(a.id)} onChanged={onChanged} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Aucune action encore définie pour ce sujet.</p>
          )}
          {!!d.reflexes.length && (
            <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
              Réflexes communs liés :
              {d.reflexes.map((r) => (
                <span key={r.id} className="rounded px-1.5 py-0.5 font-medium text-white" style={{ background: MOMENTS[r.moment].dot }}>
                  {r.titre}
                </span>
              ))}
            </p>
          )}
        </Section>

        <Section title="La position de votre direction">
          <PositionBar basePath={`/rex/sujets/${d.id}`} summary={d.positions} detail={d.positions_detail} onChange={onChanged} />
        </Section>

        <Section title={`Discussion (${d.comments.length})`}>
          <CommentThread type="sujet" id={d.id} initial={d.comments} onChange={onChanged} />
        </Section>

        {!!d.observations_cr.length && (
          <Section
            title={`Extraits du compte rendu du 14 octobre sur « ${d.thematique_titre} » (${d.observations_cr.length})`}
            right={
              <button onClick={() => setShowCr((v) => !v)} className="text-sm font-medium text-ville-blue hover:underline">
                {showCr ? 'Masquer' : 'Afficher'}
              </button>
            }
          >
            {showCr && (
              <div className="space-y-2">
                {d.observations_cr.map((c) => (
                  <p key={c.id} className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
                    {c.body}
                  </p>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section
          title={`Historique (${d.history.length})`}
          right={
            <button onClick={() => setShowHistory((v) => !v)} className="text-sm font-medium text-ville-blue hover:underline">
              {showHistory ? 'Masquer' : 'Afficher'}
            </button>
          }
        >
          {showHistory && (
            <ul className="space-y-1 text-xs text-slate-600">
              {d.history.map((h) => (
                <li key={h.id}>
                  <span className="text-slate-400">{formatDateTime(h.changed_at)}</span> · <strong>{h.changed_by || 'Import'}</strong> : {h.champ}
                  {h.nouvelle_valeur ? ` → ${h.nouvelle_valeur.slice(0, 120)}` : ''}
                </li>
              ))}
              {!d.history.length && <li>Aucune modification depuis l'import.</li>}
            </ul>
          )}
        </Section>
      </div>

      {actionEditing && (typeof actionEditing === 'string' || editedAction) && (
        <ActionEditor
          action={editedAction}
          thematiques={thematiques}
          defaultSujetId={d.id}
          onClose={() => setActionEditing(null)}
          onTouched={onChanged}
          onSaved={() => {
            setActionEditing(null)
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}

function ActionLine({ a, onOpen, onChanged }: { a: RexAction; onOpen: () => void; onChanged: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left font-medium text-slate-800 hover:text-ville-blue">
        {a.titre}
      </button>
      <DirectionChips text={a.pilote_direction} />
      <span className={`text-xs ${a.en_retard ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{a.echeance ? formatDay(a.echeance) : ''}</span>
      <select
        value={a.statut}
        onChange={async (e) => {
          await api.patch(`/rex/actions/${a.id}`, { statut: e.target.value })
          onChanged()
        }}
        className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${ACTION_STATUTS[a.statut].className}`}
      >
        {Object.entries(ACTION_STATUTS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
    </li>
  )
}

function LinksEditor({ sujetId, initial, engagements, onSaved }: { sujetId: number; initial: number[]; engagements: ReturnType<typeof useEngagements>; onSaved: () => void }) {
  const [ids, setIds] = useState<number[]>(initial)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-2">
      <EngagementPicker value={ids} onChange={setIds} engagements={engagements} />
      <button
        disabled={busy}
        className={btnPrimary}
        onClick={async () => {
          setBusy(true)
          await api.put(`/rex/sujets/${sujetId}/engagements`, { engagement_ids: ids })
          setBusy(false)
          onSaved()
        }}
      >
        Enregistrer les liens
      </button>
    </div>
  )
}

function SujetForm({
  sujet, thematiques, onCancel, onSaved,
}: {
  sujet: RexSujetDetail
  thematiques: RexThematique[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [v, setV] = useState({
    libelle: sujet.libelle,
    constat: sujet.constat || '',
    a_fonctionne: sujet.a_fonctionne || '',
    a_ameliorer: sujet.a_ameliorer || '',
    mesures: sujet.mesures || '',
    pilotage: sujet.pilotage || '',
    decision: sujet.decision || '',
    thematique_id: sujet.thematique_id,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: k === 'thematique_id' ? Number(e.target.value) : e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/rex/sujets/${sujet.id}`, v)
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-ville-blue/30 bg-blue-50/30 p-4">
      <Field label="Intitulé du sujet">
        <input value={v.libelle} onChange={set('libelle')} required className={inputCls} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Constat / état des faits">
          <textarea value={v.constat} onChange={set('constat')} rows={5} className={inputCls} />
        </Field>
        <Field label="Ce qui a fonctionné">
          <textarea value={v.a_fonctionne} onChange={set('a_fonctionne')} rows={5} className={inputCls} />
        </Field>
        <Field label="Ce qui est à améliorer">
          <textarea value={v.a_ameliorer} onChange={set('a_ameliorer')} rows={5} className={inputCls} />
        </Field>
        <Field label="Mesures correctives proposées pour 2027">
          <textarea value={v.mesures} onChange={set('mesures')} rows={5} className={inputCls} />
        </Field>
        <Field label="Pilotage" hint="Directions pilotes, séparées par une virgule (ex. DRH, DSI)">
          <input value={v.pilotage} onChange={set('pilotage')} className={inputCls} />
        </Field>
        <Field label="Thématique">
          <select value={v.thematique_id} onChange={set('thematique_id')} className={inputCls}>
            {thematiques.map((t) => (
              <option key={t.id} value={t.id}>
                {t.partie}. {t.titre}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Décision du CODIR" hint="À renseigner une fois l'arbitrage rendu (passez alors le statut à « Validé »).">
        <textarea value={v.decision} onChange={set('decision')} rows={2} className={inputCls} />
      </Field>
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !v.libelle.trim()} className={btnPrimary}>
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
          Annuler
        </button>
      </div>
    </form>
  )
}

function NewSujetModal({ thematique, onClose, onCreated }: { thematique: RexThematique; onClose: () => void; onCreated: (id: number) => void }) {
  const [libelle, setLibelle] = useState('')
  const [constat, setConstat] = useState('')
  const [mesures, setMesures] = useState('')
  const [pilotage, setPilotage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.post('/rex/sujets', { thematique_id: thematique.id, libelle, constat, mesures, pilotage })
      onCreated(r.data.id)
    } catch (err) {
      setError(apiErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={`Nouveau sujet — ${thematique.titre}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Sujet">
          <input autoFocus value={libelle} onChange={(e) => setLibelle(e.target.value)} required className={inputCls} placeholder="Ex. Accueil des gens du voyage en période de canicule" />
        </Field>
        <Field label="Constat / ce qui s'est passé">
          <textarea value={constat} onChange={(e) => setConstat(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <Field label="Mesure proposée pour 2027">
          <textarea value={mesures} onChange={(e) => setMesures(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <Field label="Pilotage" hint="Directions séparées par une virgule">
          <input value={pilotage} onChange={(e) => setPilotage(e.target.value)} className={inputCls} />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !libelle.trim()} className={btnPrimary}>
          Créer le sujet
        </button>
      </form>
    </Modal>
  )
}

function NewThematiqueModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [partie, setPartie] = useState(1)
  const [titre, setTitre] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api.post('/rex/thematiques', { partie, titre })
      onCreated()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }
  return (
    <Modal title="Nouvelle thématique" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Partie du document">
          <select value={partie} onChange={(e) => setPartie(Number(e.target.value))} className={inputCls}>
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {p}. {PARTIES[p].titre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Titre">
          <input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} required className={inputCls} />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={!titre.trim()} className={btnPrimary}>
          Créer
        </button>
      </form>
    </Modal>
  )
}
