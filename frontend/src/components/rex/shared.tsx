import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Link2, Search, Send, Trash2, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { POSITIONS, formatDateTime, splitDirections } from '../../lib/rex'
import type { Engagement } from '../../types'
import type { RexComment, RexCibleType, RexEngagementRef, RexPosition, RexPositionDetail, RexPositionSummary } from '../../types.rex'

export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-ville-blue focus:outline-none focus:ring-1 focus:ring-ville-blue/30'
export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
export const btnGhost =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'

export function Pill({ className, children, title }: { className: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

export function DirectionChips({ text, highlight }: { text: string | null | undefined; highlight?: string[] }) {
  const list = splitDirections(text)
  if (!list.length) return <span className="text-xs italic text-amber-700">Pilote à désigner</span>
  const hl = new Set((highlight || []).map((c) => c.toUpperCase()))
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((d) => (
        <span
          key={d}
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${hl.has(d.toUpperCase()) ? 'bg-ville-blue text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {d}
        </span>
      ))}
    </span>
  )
}

/** Pastilles des engagements du mandat liés (lien vers la fiche). */
export function EngagementChips({ items, empty }: { items: RexEngagementRef[]; empty?: string }) {
  if (!items.length) return empty ? <span className="text-xs italic text-slate-400">{empty}</span> : null
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {items.map((e) => (
        <Link
          key={e.id}
          to={`/engagements/${e.id}`}
          title={`${e.contenu}${e.motif ? `\n\nPourquoi : ${e.motif}` : ''}`}
          className="inline-flex items-center gap-1 rounded-md bg-ville-blue/10 px-2 py-0.5 text-xs font-semibold text-ville-blue hover:bg-ville-blue/20"
        >
          <Link2 size={11} /> Mandat n°{e.numero}
        </Link>
      ))}
    </span>
  )
}

/** Sélecteur multiple d'engagements du mandat (avec filtre), en ligne. */
export function EngagementPicker({
  value,
  onChange,
  engagements,
}: {
  value: number[]
  onChange: (ids: number[]) => void
  engagements: Engagement[]
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? engagements.filter((e) => `${e.numero} ${e.contenu} ${e.pilotage || ''}`.toLowerCase().includes(t)) : engagements
  }, [engagements, q])
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((i) => i !== id) : [...value, id])
  return (
    <div className="rounded-md border border-slate-300 bg-white">
      <div className="relative border-b border-slate-200 p-1.5">
        <Search size={13} className="pointer-events-none absolute left-3.5 top-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer par n°, mot-clé ou direction…"
          className="w-full rounded px-2 py-1 pl-6 text-sm focus:outline-none"
        />
      </div>
      <div className="max-h-44 overflow-y-auto p-1.5">
        {filtered.map((e) => (
          <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={value.includes(e.id)} onChange={() => toggle(e.id)} className="mt-0.5 accent-[#0055A4]" />
            <span>
              <span className="font-semibold">n°{e.numero}</span> <span className="text-slate-600">{e.contenu}</span>
            </span>
          </label>
        ))}
        {!filtered.length && <p className="p-2 text-xs text-slate-400">Aucun résultat.</p>}
      </div>
    </div>
  )
}

export function useEngagements(): Engagement[] {
  const [list, setList] = useState<Engagement[]>([])
  useEffect(() => {
    api.get('/engagements').then((r) => setList(r.data)).catch(() => setList([]))
  }, [])
  return list
}

/**
 * « Mon positionnement » : d'accord / sous réserve / pas d'accord, avec un mot
 * obligatoire dès qu'on émet une réserve. Un clic = une prise de position
 * visible de tous (sigle de la direction), modifiable à tout moment.
 */
export function PositionBar({
  basePath,
  summary,
  detail,
  onChange,
  compact,
}: {
  basePath: string // ex. /rex/reflexes/12
  summary: RexPositionSummary
  detail?: RexPositionDetail[]
  onChange: () => void
  compact?: boolean
}) {
  const [pending, setPending] = useState<RexPosition | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mine = summary.mine?.position

  async function send(position: RexPosition, commentaire?: string) {
    setBusy(true)
    setError(null)
    try {
      await api.put(`${basePath}/position`, { position, commentaire })
      setPending(null)
      setText('')
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    await api.delete(`${basePath}/position`)
    onChange()
  }

  function pick(p: RexPosition) {
    if (p === 'accord') void send('accord')
    else {
      setPending(p)
      setText(summary.mine?.position === p ? summary.mine.commentaire || '' : '')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(POSITIONS) as RexPosition[]).map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => pick(p)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              mine === p ? POSITIONS[p].active : `bg-white ${POSITIONS[p].className}`
            }`}
          >
            {mine === p && <Check size={12} className="mr-1 inline" />}
            {POSITIONS[p].label}
            {summary[p] > 0 && <span className="ml-1 opacity-80">· {summary[p]}</span>}
          </button>
        ))}
        {mine && !compact && (
          <button type="button" onClick={withdraw} className="text-xs text-slate-400 underline hover:text-slate-600">
            retirer ma position
          </button>
        )}
      </div>
      {pending && (
        <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={pending === 'reserve' ? 'Sous quelle réserve ? (obligatoire)' : "Pourquoi n'êtes-vous pas d'accord ? (obligatoire)"}
            className={inputCls}
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !text.trim()} onClick={() => send(pending, text)} className={btnPrimary}>
              <Send size={13} /> Enregistrer ma position
            </button>
            <button type="button" onClick={() => setPending(null)} className={btnGhost}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!!detail?.length && !compact && (
        <ul className="space-y-1 text-xs">
          {detail.map((d, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-1.5">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${d.position === 'accord' ? 'bg-green-50 text-green-700' : d.position === 'reserve' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                {d.direction || d.display_name || '—'} · {POSITIONS[d.position].label.toLowerCase()}
              </span>
              {d.commentaire && <span className="text-slate-600">{d.commentaire}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Fil de discussion d'un sujet, d'une action ou d'un réflexe. */
export function CommentThread({
  type,
  id,
  onChange,
  initial,
}: {
  type: RexCibleType
  id: number
  onChange?: () => void
  initial?: RexComment[]
}) {
  const { user } = useAuth()
  const [comments, setComments] = useState<RexComment[]>(initial || [])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    api.get('/rex/comments', { params: { cible_type: type, cible_id: id } }).then((r) => setComments(r.data))
  }
  useEffect(load, [type, id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/rex/comments', { cible_type: type, cible_id: id, body })
      setBody('')
      load()
      onChange?.()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: RexComment) {
    await api.delete(`/rex/comments/${c.id}`)
    load()
    onChange?.()
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className={`rounded-lg p-3 text-sm ${c.is_cr ? 'border border-dashed border-slate-300 bg-slate-50' : 'bg-white ring-1 ring-slate-200'}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{c.author_name}</span>
            {c.author_direction && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{c.author_direction}</span>}
            <span>{formatDateTime(c.created_at)}</span>
            {c.edited_at && <span>(modifié)</span>}
            {(c.author_sub === user?.sub || user?.role === 'admin') && !c.is_cr && (
              <button onClick={() => remove(c)} title="Supprimer" className="ml-auto text-slate-400 hover:text-red-600">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-slate-700">{c.body}</p>
        </div>
      ))}
      {!comments.length && <p className="text-sm text-slate-400">Pas encore de contribution. Soyez le ou la première.</p>}
      <form onSubmit={submit} className="space-y-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Votre retour, une précision, une proposition…" className={inputCls} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !body.trim()} className={btnPrimary}>
          <Send size={13} /> Contribuer
        </button>
      </form>
    </div>
  )
}

/** Fenêtre modale simple (fermeture au clic extérieur ou Échap). */
export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-8" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
