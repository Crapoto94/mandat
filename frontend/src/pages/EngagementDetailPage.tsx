import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Engagement, Etat } from '../types'
import EtatBadge from '../components/EtatBadge'
import { ArrowLeft, Star, Send, Clock, MessageSquare } from 'lucide-react'

export default function EngagementDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [engagement, setEngagement] = useState<Engagement | null>(null)
  const [etats, setEtats] = useState<Etat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Champs éditables (brouillon local avant sauvegarde)
  const [form, setForm] = useState({
    etat_code: '',
    description_avancement: '',
    prochaines_etapes: '',
    roles_precises: '',
  })
  const [prioNote, setPrioNote] = useState('')
  const [commentBody, setCommentBody] = useState('')

  function load() {
    api.get(`/engagements/${id}`).then((res) => {
      setEngagement(res.data)
      setForm({
        etat_code: res.data.etat_code,
        description_avancement: res.data.description_avancement || '',
        prochaines_etapes: res.data.prochaines_etapes || '',
        roles_precises: res.data.roles_precises || '',
      })
      setPrioNote(res.data.prioritaire_note || '')
    })
  }

  useEffect(() => {
    load()
    api.get('/etats').then((res) => setEtats(res.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.patch(`/engagements/${id}`, form)
      setSaved(true)
      load()
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function togglePrioritaire() {
    if (!engagement) return
    try {
      await api.patch(`/engagements/${id}/prioritaire`, {
        prioritaire: !engagement.prioritaire_plenaire,
        note: prioNote,
      })
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de mettre à jour le marquage prioritaire'))
    }
  }

  async function savePrioNote() {
    if (!engagement?.prioritaire_plenaire) return
    try {
      await api.patch(`/engagements/${id}/prioritaire`, { prioritaire: true, note: prioNote })
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    try {
      await api.post(`/engagements/${id}/comments`, { body: commentBody })
      setCommentBody('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'ajouter le commentaire"))
    }
  }

  if (!engagement) return <p className="p-8 text-center text-slate-500">Chargement…</p>

  return (
    <div className="space-y-6">
      <Link to="/engagements" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ville-blue">
        <ArrowLeft size={15} /> Retour à la liste
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Engagement n°{engagement.numero} — {engagement.axe}
            </p>
            <h1 className="mt-1 text-lg font-semibold text-slate-900">{engagement.contenu}</h1>
          </div>
          <EtatBadge libelle={engagement.etat_libelle} couleur={engagement.etat_couleur} />
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <Info label="Pilotage" value={engagement.pilotage} />
          <Info label="Contribution — élaboration du projet" value={engagement.contribution_elaboration} />
          <Info label="Contribution — directions/fonctions impactées" value={engagement.contribution_impactees} />
          <Info label="Échéance" value={engagement.echeance} />
          <Info label="Groupe de travail" value={engagement.groupe_code ? `${engagement.groupe_code} — ${engagement.groupe_nom}` : 'Hors groupe'} />
        </div>
      </div>

      {/* Marquage prioritaire plénière */}
      <div className={`rounded-xl border p-5 ${engagement.prioritaire_plenaire ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Star size={16} className={engagement.prioritaire_plenaire ? 'text-amber-500' : 'text-slate-400'} fill={engagement.prioritaire_plenaire ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium text-slate-800">À porter en plénière (max. 3 par groupe)</span>
          </div>
          <button
            onClick={togglePrioritaire}
            disabled={!engagement.groupe_id}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              engagement.prioritaire_plenaire
                ? 'bg-white text-amber-700 ring-1 ring-amber-300 hover:bg-amber-100'
                : 'bg-ville-blue text-white hover:opacity-90'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {engagement.prioritaire_plenaire ? 'Retirer' : 'Marquer prioritaire'}
          </button>
        </div>
        {!engagement.groupe_id && (
          <p className="mt-2 text-xs text-slate-500">Cet engagement est hors groupe : il ne peut pas être porté en plénière.</p>
        )}
        {engagement.prioritaire_plenaire && (
          <div className="mt-3">
            <textarea
              value={prioNote}
              onChange={(e) => setPrioNote(e.target.value)}
              onBlur={savePrioNote}
              placeholder="Pourquoi ce sujet mérite une discussion élargie en plénière ?"
              rows={2}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Fiche d'avancement éditable */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Point d'avancement</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">État d'avancement</label>
            <select
              value={form.etat_code}
              onChange={(e) => setForm({ ...form, etat_code: e.target.value })}
              className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
            >
              {etats.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Description — point atteint"
            value={form.description_avancement}
            onChange={(v) => setForm({ ...form, description_avancement: v })}
          />
          <Field
            label="Prochaines étapes"
            value={form.prochaines_etapes}
            onChange={(v) => setForm({ ...form, prochaines_etapes: v })}
          />
          <Field
            label="Rôles précisés / points de coordination entre directions"
            value={form.roles_precises}
            onChange={(v) => setForm({ ...form, roles_precises: v })}
            hint="À compléter quand la répartition entre directions mérite d'être clarifiée."
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && <span className="text-sm text-green-600">Enregistré ✓</span>}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {engagement.updated_by && (
          <p className="mt-3 text-xs text-slate-400">
            Dernière modification par {engagement.updated_by} le{' '}
            {new Date(engagement.updated_at).toLocaleString('fr-FR')}
          </p>
        )}
      </div>

      {/* Commentaires */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquare size={16} /> Échanges ({engagement.comments?.length || 0})
        </h2>
        <div className="mb-4 space-y-3">
          {engagement.comments?.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-800">
                  {c.author_name} {c.author_direction && <span className="text-slate-400">· {c.author_direction}</span>}
                </span>
                <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <p className="whitespace-pre-wrap text-slate-700">{c.body}</p>
            </div>
          ))}
          {!engagement.comments?.length && <p className="text-sm text-slate-400">Aucun échange pour l'instant.</p>}
        </div>
        <form onSubmit={submitComment} className="flex items-start gap-2">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={`Écrire un commentaire en tant que ${user?.displayName}...`}
            rows={2}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-ville-blue p-2.5 text-white hover:opacity-90">
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* Historique */}
      {!!engagement.history?.length && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock size={16} /> Historique des modifications
          </h2>
          <ul className="space-y-2 text-sm">
            {engagement.history.map((h) => (
              <li key={h.id} className="border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-500">
                  {new Date(h.changed_at).toLocaleString('fr-FR')} · {h.changed_by || 'inconnu'}
                </span>{' '}
                a modifié <span className="font-medium">{fieldLabel(h.champ)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-700">{value || '—'}</p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  etat_code: "l'état d'avancement",
  description_avancement: 'la description du point atteint',
  prochaines_etapes: 'les prochaines étapes',
  roles_precises: 'les rôles précisés',
  axe: "l'axe du projet",
  contenu: 'le contenu',
  pilotage: 'le pilotage',
  contribution_elaboration: "la contribution à l'élaboration",
  contribution_impactees: 'les directions impactées',
  echeance: "l'échéance",
  'prioritaire_plenaire': 'le marquage prioritaire plénière',
}

function fieldLabel(code: string) {
  return FIELD_LABELS[code] || code
}
