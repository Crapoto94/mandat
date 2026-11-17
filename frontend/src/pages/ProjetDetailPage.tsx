import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useDialogs } from '../hooks/useDialogs'
import { useModuleLayout } from '../hooks/useModuleLayout'
import type { Etat, Meteo, ModuleOwner, Projet, ProjetComment, ProjetStep } from '../types'
import EtatBadge from '../components/EtatBadge'
import MeteoPicker from '../components/MeteoPicker'
import ToggleSwitch from '../components/ToggleSwitch'
import RichTextEditor from '../components/RichTextEditor'
import DocumentsModule from '../components/DocumentsModule'
import RolesModule from '../components/RolesModule'
import ModuleFrame from '../components/ModuleFrame'
import ModuleSettingsModal from '../components/ModuleSettingsModal'
import { atLeast } from '../lib/access'
import {
  ArrowLeft,
  Users,
  X,
  Trash2,
  Send,
  Pencil,
  Folder,
  GitCommitHorizontal,
  MessageSquare,
  Settings,
  Infinity as InfinityIcon,
} from 'lucide-react'

const DEFAULT_MODULE_ORDER = ['roles', 'documents', 'steps', 'comments']
const MODULE_META: Record<string, { title: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  roles: { title: 'Rôles assignés', icon: Users },
  documents: { title: 'Documents', icon: Folder },
  steps: { title: 'Étapes', icon: GitCommitHorizontal },
  comments: { title: 'Échanges', icon: MessageSquare },
}

export default function ProjetDetailPage() {
  const { id } = useParams()
  const [projet, setProjet] = useState<Projet | null>(null)
  const [etats, setEtats] = useState<Etat[]>([])
  const [meteos, setMeteos] = useState<Meteo[]>([])
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    api
      .get(`/projets/${id}`)
      .then((res) => setProjet(res.data))
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true)
        else setError(apiErrorMessage(err, 'Projet indisponible'))
      })
  }

  useEffect(() => {
    load()
    api.get('/etats').then((res) => setEtats(res.data))
    api.get('/meteos').then((res) => setMeteos(res.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function patch(body: Record<string, unknown>) {
    try {
      await api.patch(`/projets/${id}`, body)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link to="/projets" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ville-blue">
          <ArrowLeft size={15} /> Retour aux projets
        </Link>
        <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-700">
          Projet introuvable, ou vous n'en êtes pas membre.
        </p>
      </div>
    )
  }

  if (!projet) return <p className="p-8 text-center text-slate-500">Chargement…</p>

  return <ProjetBody projet={projet} etats={etats} meteos={meteos} error={error} load={load} patch={patch} />
}

function ProjetBody({
  projet,
  etats,
  meteos,
  error,
  load,
  patch,
}: {
  projet: Projet
  etats: Etat[]
  meteos: Meteo[]
  error: string | null
  load: () => void
  patch: (body: Record<string, unknown>) => Promise<void>
}) {
  const { user } = useAuth()
  const [commentBody, setCommentBody] = useState('')
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(false)
  const [stepDate, setStepDate] = useState('')
  const [stepDesc, setStepDesc] = useState('')
  const owner: ModuleOwner = { kind: 'projet', id: projet.id }
  const { layout, toggle, reorder } = useModuleLayout(owner, DEFAULT_MODULE_ORDER)
  const canEdit = atLeast(projet.myAccessLevel, 'modification')
  const canAdminister = atLeast(projet.myAccessLevel, 'administration')

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    try {
      await api.post(`/projets/${projet.id}/comments`, { body: commentBody })
      setCommentBody('')
      load()
    } catch {
      // le message d'erreur global de la fiche suffit
    }
  }

  async function submitStep(e: FormEvent) {
    e.preventDefault()
    if (!stepDesc.trim()) return
    try {
      await api.post(`/projets/${projet.id}/steps`, { date_etape: stepDate || null, description: stepDesc.trim() })
      setStepDate('')
      setStepDesc('')
      load()
    } catch {
      // idem
    }
  }

  async function removeStep(stepId: number) {
    await api.delete(`/projets/${projet.id}/steps/${stepId}`)
    load()
  }

  const moduleContent: Record<string, React.ReactNode> = {
    roles: <RolesModule owner={owner} roles={projet.roles || []} onChange={load} canAdminister={canAdminister} />,
    documents: <DocumentsModule owner={owner} canEdit={canEdit} canAdminister={canAdminister} />,
    steps: (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <GitCommitHorizontal size={16} /> Étapes
        </h2>
        {!!projet.steps?.length && (
          <ol className="mb-5 space-y-4 border-l-2 border-slate-100 pl-4">
            {projet.steps.map((s: ProjetStep) => (
              <li key={s.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-ville-blue" />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {s.date_etape
                        ? new Date(s.date_etape).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                        : 'Date non précisée'}
                    </p>
                    <p className="text-sm text-slate-800">{s.description}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => removeStep(s.id)} className="shrink-0 text-slate-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {!projet.steps?.length && <p className="mb-4 text-sm text-slate-400">Aucune étape renseignée.</p>}
        {canEdit && (
        <form onSubmit={submitStep} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date (optionnelle)</label>
            <input
              value={stepDate}
              onChange={(e) => setStepDate(e.target.value)}
              placeholder="ex : 2028, T3 2030, juin 2029..."
              className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Description de l'étape</label>
            <input
              value={stepDesc}
              onChange={(e) => setStepDesc(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!stepDesc.trim()}
            className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Ajouter
          </button>
        </form>
        )}
      </div>
    ),
    comments: (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquare size={16} /> Échanges ({projet.comments?.length || 0})
        </h2>
        <div className="mb-4 space-y-3">
          {projet.comments?.map((c: ProjetComment) => (
            <ProjetCommentItem key={c.id} comment={c} projetId={projet.id} canEdit={!!c.author_sub && c.author_sub === user?.sub && canEdit} onChanged={load} />
          ))}
          {!projet.comments?.length && <p className="text-sm text-slate-400">Aucun échange pour l'instant.</p>}
        </div>
        {canEdit ? (
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
        ) : (
          <p className="text-xs text-slate-400">Accès en consultation seule.</p>
        )}
      </div>
    ),
  }

  return (
    <div className="space-y-6">
      {projet.engagement_id ? (
        <Link
          to={`/engagements/${projet.engagement_id}`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ville-blue"
        >
          <ArrowLeft size={15} /> Retour à l'engagement
        </Link>
      ) : (
        <Link to="/projets" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ville-blue">
          <ArrowLeft size={15} /> Retour aux projets
        </Link>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <HeaderCard projet={projet} onSaved={load} canEdit={canEdit} canAdminister={canAdminister} />

      {projet.engagement_id && (
        <p className="text-sm text-slate-500">
          Lié à l'engagement{' '}
          <Link to={`/engagements/${projet.engagement_id}`} className="font-medium text-ville-blue hover:underline">
            n°{projet.engagement_numero} — {projet.engagement_contenu}
          </Link>
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Point d'avancement</h2>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">État d'avancement</label>
            <select
              value={projet.etat_code}
              onChange={(e) => patch({ etat_code: e.target.value })}
              disabled={!canEdit}
              className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              {etats.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Météo</label>
            <MeteoPicker meteos={meteos} value={projet.meteo_code} onChange={(code) => patch({ meteo_code: code })} disabled={!canEdit} />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">Description — point atteint</label>
          <RichTextEditor value={projet.description || ''} onChange={(html) => patch({ description: html })} readOnly={!canEdit} />
        </div>
        {!canEdit && <p className="mt-3 text-xs text-slate-400">Accès en consultation seule.</p>}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setModuleSettingsOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-ville-blue"
        >
          <Settings size={13} /> Modules de la fiche
        </button>
      </div>

      {layout.map((entry) => {
        const meta = MODULE_META[entry.module_key]
        if (!meta) return null
        return (
          <ModuleFrame
            key={entry.module_key}
            moduleKey={entry.module_key}
            title={meta.title}
            icon={meta.icon}
            enabled={entry.enabled}
            onToggle={() => toggle(entry.module_key)}
            onReorder={reorder}
          >
            {moduleContent[entry.module_key]}
          </ModuleFrame>
        )
      })}

      {moduleSettingsOpen && (
        <ModuleSettingsModal
          layout={layout}
          moduleMeta={MODULE_META}
          toggle={toggle}
          reorder={reorder}
          onClose={() => setModuleSettingsOpen(false)}
        />
      )}
    </div>
  )
}

function HeaderCard({
  projet,
  onSaved,
  canEdit,
  canAdminister,
}: {
  projet: Projet
  onSaved: () => void
  canEdit: boolean
  canAdminister: boolean
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { confirmAsync, dialog } = useDialogs()

  async function removeProjet() {
    const ok = await confirmAsync({
      title: 'Supprimer le projet',
      message: `Supprimer définitivement le projet "${projet.nom}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/projets/${projet.id}`)
      navigate(projet.engagement_id ? `/engagements/${projet.engagement_id}` : '/projets')
    } catch (err) {
      setDeleteError(apiErrorMessage(err, 'Suppression impossible'))
      setDeleting(false)
    }
  }
  const [form, setForm] = useState({
    nom: projet.nom,
    description_courte: '',
    axe: projet.axe || '',
    pilotage: projet.pilotage || '',
    echeance: projet.echeance || '',
    continu: projet.continu,
  })
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setForm({ nom: projet.nom, description_courte: '', axe: projet.axe || '', pilotage: projet.pilotage || '', echeance: projet.echeance || '', continu: projet.continu })
    setEditing(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/projets/${projet.id}`, {
        nom: form.nom,
        axe: form.axe,
        pilotage: form.pilotage,
        echeance: form.echeance,
        continu: form.continu,
      })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function toggleContinu() {
    await api.patch(`/projets/${projet.id}`, { continu: !projet.continu })
    onSaved()
  }

  if (!editing) {
    return (
      <>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{projet.nom}</h1>
            {projet.axe && <p className="mt-1 text-sm text-slate-500">{projet.axe}</p>}
          </div>
          <div className="flex items-center gap-2">
            <EtatBadge libelle={projet.etat_libelle} couleur={projet.etat_couleur} />
            {canEdit && (
              <button onClick={startEditing} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue">
                <Pencil size={15} />
              </button>
            )}
            {canAdminister && (
              <button
                onClick={removeProjet}
                disabled={deleting}
                title="Supprimer le projet"
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
        {deleteError && <p className="mb-3 text-xs text-red-600">{deleteError}</p>}
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Pilotage</p>
            <p className="mt-0.5 text-slate-700">{projet.pilotage || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Échéance</p>
            {projet.continu ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-slate-700">
                <InfinityIcon size={14} className="text-ville-blue" /> Tout au long du projet
              </p>
            ) : (
              <p className="mt-0.5 text-slate-700">{projet.echeance || '—'}</p>
            )}
            <div className="mt-1.5">
              <ToggleSwitch checked={projet.continu} disabled={!canEdit} onChange={toggleContinu} label="Projet continu" />
            </div>
          </div>
        </div>
      </div>
      {dialog}
      </>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ville-blue/40 bg-white p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Modifier le projet</p>
        <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nom du projet</label>
        <input
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Axe / thématique (libre)</label>
          <input
            value={form.axe}
            onChange={(e) => setForm({ ...form, axe: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Pilotage</label>
          <input
            value={form.pilotage}
            onChange={(e) => setForm({ ...form, pilotage: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Échéance</label>
          <input
            value={form.echeance}
            onChange={(e) => setForm({ ...form, echeance: e.target.value })}
            disabled={form.continu}
            placeholder="ex : 2028, T3 2030, juin 2029..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none disabled:bg-slate-50"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

function ProjetCommentItem({
  comment,
  projetId,
  canEdit,
  onChanged,
}: {
  comment: ProjetComment
  projetId: number
  canEdit: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await api.patch(`/projets/${projetId}/comments/${comment.id}`, { body: draft.trim() })
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800">
          {comment.author_name} {comment.author_direction && <span className="text-slate-400">· {comment.author_direction}</span>}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-400">
            {new Date(comment.created_at).toLocaleString('fr-FR')}
            {comment.edited_at && ' (modifié)'}
          </span>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-ville-blue">
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !draft.trim()}
              className="rounded-md bg-ville-blue px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-slate-700">{comment.body}</p>
      )}
    </div>
  )
}

